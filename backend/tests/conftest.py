from typing import Generator
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.base import Base, Group, User

# In-memory SQLite for isolated, fast test execution
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def mock_external_services():
    """Mock external network calls (Expo push and SMTP emails) for all tests."""
    with patch("app.api.auth.send_expo_push"), \
         patch("app.api.transfers.send_expo_push"), \
         patch("app.api.balance.send_expo_push"), \
         patch("app.services.email_service._send_email_smtp", return_value=True), \
         patch("app.services.email_service.send_verification_email"), \
         patch("app.services.email_service.send_transfer_notification_email"), \
         patch("app.services.email_service.send_transfer_rejected_email"), \
         patch("app.main.scheduler.start"), \
         patch("app.main.scheduler.shutdown"):
        yield


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provides a transactional in-memory database session, recreated per test."""
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def user_factory(db_session: Session):
    """Factory fixture to create test users."""
    def _create_user(name: str, email: str, phone: str = "123456789") -> User:
        user = User(
            name=name,
            email=email,
            phone_number=phone,
            hashed_password=get_password_hash("testpassword123"),
            is_verified=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _create_user


@pytest.fixture
def user_a(user_factory) -> User:
    return user_factory(name="Alice", email="alice@test.com", phone="111222333")


@pytest.fixture
def user_b(user_factory) -> User:
    return user_factory(name="Bob", email="bob@test.com", phone="444555666")


@pytest.fixture
def user_c(user_factory) -> User:
    return user_factory(name="Charlie", email="charlie@test.com", phone="777888999")


@pytest.fixture
def auth_headers():
    """Generates valid Bearer authentication header for a given user."""
    def _headers(user: User) -> dict[str, str]:
        token = create_access_token({"sub": str(user.id)})
        return {"Authorization": f"Bearer {token}"}

    return _headers


@pytest.fixture
def test_group(db_session: Session, user_a: User, user_b: User, user_c: User) -> Group:
    """Group containing Alice, Bob, and Charlie."""
    group = Group(name="Vacation Crew")
    group.members.extend([user_a, user_b, user_c])
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    return group

