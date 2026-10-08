import resend
from app.core.config import settings


def send_verification_email(to_email: str, token: str) -> None:
    if not settings.RESEND_API_KEY:
        print("[EMAIL WARNING] Brak RESEND_API_KEY w konfiguracji (.env)!")
        return

    resend.api_key = settings.RESEND_API_KEY
    verify_url = f"http://127.0.0.1:8000/api/auth/verify?token={token}"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px;">
          <h2 style="color: #38bdf8; margin-top: 0;">Weryfikacja konta SettleUp</h2>
          <p style="color: #cbd5e1;">Kliknij poniższy przycisk, aby potwierdzić swój adres e-mail:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{verify_url}" style="background-color: #38bdf8; color: #0f172a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Aktywuj konto
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">Link jest ważny przez 24 godziny. Jeśli nie zakładałeś konta, zignoruj tę wiadomość.</p>
        </div>
      </body>
    </html>
    """

    params: resend.Emails.SendParams = {
        "from": "onboarding@resend.dev",
        "to": [to_email],
        "subject": "Zweryfikuj konto w SettleUp",
        "html": html_content,
    }

    try:
        response = resend.Emails.send(params)
        print(f"[EMAIL SUCCESS] Mail weryfikacyjny wysłany do {to_email}, id: {response}")
    except Exception as e:
        print(f"[EMAIL ERROR] Błąd podczas wysyłki maila przez Resend: {e}")


def send_transfer_notification_email(recipient_email: str, sender_name: str, amount_cents: int) -> None:
    if not settings.RESEND_API_KEY:
        print("[EMAIL WARNING] Brak RESEND_API_KEY w konfiguracji (.env)!")
        return

    resend.api_key = settings.RESEND_API_KEY
    amount_pln = f"{amount_cents / 100:.2f} PLN"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #334155;">
          <h2 style="color: #38bdf8; margin-top: 0;">Nowa deklaracja spłaty</h2>
          <p style="color: #cbd5e1;"><strong style="color: #f8fafc;">{sender_name}</strong> zadeklarował wykonanie przelewu na kwotę <strong style="color: #38bdf8;">{amount_pln}</strong>.</p>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">Sprawdź swoje konto bankowe, a następnie wejdź do aplikacji SettleUp, aby zatwierdzić lub odrzucić wpłatę.</p>
        </div>
      </body>
    </html>
    """

    params: resend.Emails.SendParams = {
        "from": "onboarding@resend.dev",
        "to": [recipient_email],
        "subject": f"SettleUp: {sender_name} zadeklarował spłatę {amount_pln}",
        "html": html_content,
    }

    try:
        response = resend.Emails.send(params)
        print(f"[EMAIL SUCCESS] Mail o przelewie wysłany do {recipient_email}, id: {response}")
    except Exception as e:
        print(f"[EMAIL ERROR] Błąd wysyłki maila o przelewie przez Resend: {e}")



def send_monthly_settlement_email(
    recipient_email: str,
    recipient_name: str,
    group_name: str,
    settlements: list[dict],
) -> None:
    if not settings.RESEND_API_KEY:
        print("[EMAIL WARNING] Brak RESEND_API_KEY w konfiguracji (.env)!")
        return

    resend.api_key = settings.RESEND_API_KEY

    # Generujemy wiersze z instrukcjami kogo spłacić
    rows_html = "".join(
        f"""
        <li style="margin-bottom: 8px;">
          Przelej <strong>{s['amount_pln']}</strong> do <strong>{s['to_user_name']}</strong>
          {f'(BLIK: {s["to_user_phone"]})' if s.get('to_user_phone') else ''}
        </li>
        """
        for s in settlements
    )

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 520px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #334155;">
          <h2 style="color: #38bdf8; margin-top: 0;">Miesięczne rozliczenie: {group_name}</h2>
          <p style="color: #cbd5e1;">Cześć {recipient_name}, zakończył się miesiąc i czas wyrównać salda w grupie.</p>
          <p style="color: #f8fafc; font-weight: bold;">Twoje sugerowane spłaty:</p>
          <ul style="color: #cbd5e1; padding-left: 20px;">
            {rows_html}
          </ul>
          <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
            Po wykonaniu przelewów zgłoś je w aplikacji SettleUp, aby zaktualizować saldo grupy.
          </p>
        </div>
      </body>
    </html>
    """

    try:
        resend.Emails.send({
            "from": "onboarding@resend.dev",
            "to": [recipient_email],
            "subject": f"SettleUp: Miesięczne rozliczenie grupy {group_name}",
            "html": html_content,
        })
    except Exception as e:
        print(f"[EMAIL ERROR] Błąd wysyłki raportu miesięcznego: {e}")