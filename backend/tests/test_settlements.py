import pytest
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.api.balance import calculate_group_balances, simplify_debts
from app.models.base import Expense, Group, User


def test_simplify_debts_base_case_three_members_equal():
    """
    Przypadek bazowy: 3 osoby, równe kwoty.
    Alice płaci 3000 groszy (30 zł) za 3 osoby (po 10 zł na osobę).
    Oczekujemy 2 transakcji: Bob -> Alice (1000) oraz Charlie -> Alice (1000).
    """
    alice = User(id=1, name="Alice", phone_number="111")
    bob = User(id=2, name="Bob", phone_number="222")
    charlie = User(id=3, name="Charlie", phone_number="333")
    members = [alice, bob, charlie]

    net_balances = {
        1: 2000,   # Alice jest na plusie (+20.00 PLN)
        2: -1000,  # Bob jest winny (-10.00 PLN)
        3: -1000,  # Charlie jest winny (-10.00 PLN)
    }

    settlements = simplify_debts(net_balances, members)

    assert len(settlements) == 2

    # Sprawdzenie sumy wszystkich rozliczeń
    total_settled = sum(s["amount_cents"] for s in settlements)
    assert total_settled == 2000

    # Każda transakcja trafia do Alice
    for s in settlements:
        assert s["to_user_id"] == 1
        assert s["to_user_name"] == "Alice"
        assert s["amount_cents"] == 1000
        assert s["amount_pln"] == "10.00 PLN"

    # Dłużnikami są Bob i Charlie
    from_user_ids = {s["from_user_id"] for s in settlements}
    assert from_user_ids == {2, 3}


def test_remainder_handling_one_hundred_pln_three_members(db_session: Session, test_group: Group, user_a: User, user_b: User, user_c: User):
    """
    Reszta z dzielenia: 100 zł (10000 groszy) dzielone na 3 osoby.
    10000 // 3 = 3333 grosze, reszta = 1 grosz.
    Weryfikacja:
    1. Suma udziałów jest równa dokładnie kwocie wydatku (10000).
    2. Suma sald netto w grupie wynosi dokładnie 0.
    3. simplify_debts generuje poprawne rozliczenia bez utraty ani jednego grosza.
    """
    expense = Expense(
        title="Dinner in Rome",
        amount=10000,  # 100.00 PLN
        payer_id=user_a.id,
        group_id=test_group.id,
    )
    db_session.add(expense)
    db_session.commit()

    net_balances = calculate_group_balances(test_group, db_session)

    # Suma sald netto MUSI wynosić dokładnie 0
    assert sum(net_balances.values()) == 0

    # Weryfikacja alokacji groszy:
    # Użytkownicy są sortowani po ID. Pierwszy użytkownik otrzymuje dodatkowy 1 grosz.
    sorted_members = sorted(test_group.members, key=lambda m: m.id)
    first_member_id = sorted_members[0].id

    # Obliczamy indywidualne obciążenia
    expected_shares = {}
    for i, member in enumerate(sorted_members):
        extra = 1 if i < (10000 % 3) else 0
        expected_shares[member.id] = (10000 // 3) + extra

    assert sum(expected_shares.values()) == 10000  # ani grosz nie zginął

    # Saldo płatnika (user_a): zapłacił 10000 minus jego udział
    expected_payer_balance = 10000 - expected_shares[user_a.id]
    assert net_balances[user_a.id] == expected_payer_balance

    # Sprawdzenie uproszczenia długu
    settlements = simplify_debts(net_balances, test_group.members)
    assert len(settlements) >= 1

    # Całkowita kwota rozliczona jest równa sumie wszystkich długów
    total_debt = sum(-bal for bal in net_balances.values() if bal < 0)
    total_settled = sum(s["amount_cents"] for s in settlements)
    assert total_settled == total_debt
    assert total_settled == expected_payer_balance


def test_simplify_debts_zero_balances():
    """
    Brak długów: wszyscy są na zero (każdy zapłacił dokładnie za siebie).
    simplify_debts zwraca pustą listę.
    """
    alice = User(id=1, name="Alice")
    bob = User(id=2, name="Bob")
    members = [alice, bob]

    net_balances = {1: 0, 2: 0}
    settlements = simplify_debts(net_balances, members)
    assert settlements == []


def test_complex_debt_graph_reduction_to_max_n_minus_one_transactions():
    """
    Skomplikowany graf: 6 członków (3 dłużników, 3 wierzycieli).
    Bez uproszczenia pary dłużnik-wierzyciel mogłyby generować wiele krzyżowych transakcji.
    simplify_debts redukuje graf do maksymalnie N - 1 transakcji (dla 6 osób <= 5 transakcji).
    """
    users = [User(id=i, name=f"User {i}", phone_number=f"50000000{i}") for i in range(1, 7)]

    # Dłużnicy: U1 (-5000), U2 (-3500), U3 (-1500)  -> suma długu = 10000
    # Wierzyciele: U4 (+4000), U5 (+4000), U6 (+2000) -> suma wierzytelności = 10000
    net_balances = {
        1: -5000,
        2: -3500,
        3: -1500,
        4: 4000,
        5: 4000,
        6: 2000,
    }

    assert sum(net_balances.values()) == 0

    settlements = simplify_debts(net_balances, users)

    # 1. Złożoność: liczba transakcji <= N - 1
    assert len(settlements) <= len(users) - 1

    # 2. Suma spłat każdego dłużnika zgadza się co do grosza
    paid_by_user = {}
    received_by_user = {}
    for s in settlements:
        paid_by_user[s["from_user_id"]] = paid_by_user.get(s["from_user_id"], 0) + s["amount_cents"]
        received_by_user[s["to_user_id"]] = received_by_user.get(s["to_user_id"], 0) + s["amount_cents"]
        assert s["amount_cents"] > 0

    assert paid_by_user.get(1, 0) == 5000
    assert paid_by_user.get(2, 0) == 3500
    assert paid_by_user.get(3, 0) == 1500

    assert received_by_user.get(4, 0) == 4000
    assert received_by_user.get(5, 0) == 4000
    assert received_by_user.get(6, 0) == 2000


def test_get_group_balance_api_endpoint(client: TestClient, db_session: Session, test_group: Group, user_a: User, user_b: User, auth_headers):
    """
    Test integracyjny endpointu GET /api/groups/{group_id}/balance.
    Weryfikacja autoryzacji, kalkulacji salda i formatu odpowiedzi.
    """
    # User A płaci 60 zł (6000 groszy) za grupę (A, B, C -> po 20 zł)
    expense = Expense(
        title="Tickets",
        amount=6000,
        payer_id=user_a.id,
        group_id=test_group.id,
    )
    db_session.add(expense)
    db_session.commit()

    # Zapytanie zalogowanego User B (dłużnik)
    headers = auth_headers(user_b)
    response = client.get(f"/api/groups/{test_group.id}/balance", headers=headers)

    assert response.status_code == 200
    data = response.json()

    assert data["my_net_balance"] == -2000
    assert "Jesteś winny grupie: 20.00 PLN" in data["summary"]
    assert len(data["suggested_settlements"]) == 2

    # Sprawdzenie blokady dla użytkownika spoza grupy
    external_user = User(
        name="Eve",
        email="eve@test.com",
        hashed_password="pw",
        is_verified=True,
    )
    db_session.add(external_user)
    db_session.commit()

    eve_headers = auth_headers(external_user)
    forbidden_response = client.get(f"/api/groups/{test_group.id}/balance", headers=eve_headers)
    assert forbidden_response.status_code == 403

