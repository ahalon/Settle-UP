from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib

from app.core.config import settings


def _send_email_smtp(to_email: str, subject: str, html_content: str) -> bool:
    """Wysyła e-mail za pomocą standardowego protokołu SMTP (np. Gmail, własna poczta)."""
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print("[EMAIL WARNING] Brak konfiguracji SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) w .env!")
        return False

    sender_email = settings.EMAIL_FROM or settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"SettleApp <{sender_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html", "utf-8"))

    password = settings.SMTP_PASSWORD.replace(" ", "").strip()

    try:
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.login(settings.SMTP_USER, password)
                server.sendmail(sender_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, password)
                server.sendmail(sender_email, [to_email], msg.as_string())

        print(f"[EMAIL SUCCESS] Mail wysłany pomyślnie do {to_email} ({subject})")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Błąd podczas wysyłki maila przez SMTP: {e}")
        return False


def send_verification_email(to_email: str, token: str) -> None:
    base_url = getattr(settings, "BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
    verify_url = f"{base_url}/api/auth/verify?token={token}"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px;">
          <h2 style="color: #38bdf8; margin-top: 0;">Weryfikacja konta SettleApp</h2>
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

    _send_email_smtp(to_email, "Zweryfikuj konto w SettleApp", html_content)


def send_transfer_notification_email(recipient_email: str, sender_name: str, amount_cents: int) -> None:
    amount_pln = f"{amount_cents / 100:.2f} PLN"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #334155;">
          <h2 style="color: #38bdf8; margin-top: 0;">Nowa deklaracja spłaty</h2>
          <p style="color: #cbd5e1;"><strong style="color: #f8fafc;">{sender_name}</strong> zadeklarował wykonanie przelewu na kwotę <strong style="color: #38bdf8;">{amount_pln}</strong>.</p>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">Sprawdź swoje konto bankowe, a następnie wejdź do aplikacji SettleApp, aby zatwierdzić lub odrzucić wpłatę.</p>
        </div>
      </body>
    </html>
    """

    _send_email_smtp(recipient_email, f"SettleApp: {sender_name} zadeklarował spłatę {amount_pln}", html_content)


def send_transfer_rejected_email(
    recipient_email: str,
    sender_name: str,
    receiver_name: str,
    amount_cents: int,
) -> None:
    amount_pln = f"{amount_cents / 100:.2f} PLN"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #ef4444;">
          <h2 style="color: #ef4444; margin-top: 0;">Deklaracja spłaty odrzucona</h2>
          <p style="color: #cbd5e1;">Cześć <strong style="color: #f8fafc;">{sender_name}</strong>,</p>
          <p style="color: #cbd5e1;"><strong style="color: #f8fafc;">{receiver_name}</strong> odrzucił Twoją deklarację przelewu na kwotę <strong style="color: #ef4444;">{amount_pln}</strong>.</p>
          <div style="background-color: #2a1215; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; border-radius: 4px;">
            <p style="color: #fca5a5; margin: 0; font-size: 14px;">Twój dług w grupie został automatycznie przywrócony.</p>
          </div>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">Upewnij się, że przelew został rzeczywiście wysłany lub skontaktuj się z odbiorcą w celu wyjaśnienia.</p>
        </div>
      </body>
    </html>
    """

    _send_email_smtp(recipient_email, f"SettleApp: {receiver_name} odrzucił deklarację spłaty {amount_pln}", html_content)


def send_monthly_settlement_email(
    recipient_email: str,
    recipient_name: str,
    group_name: str,
    settlements: list[dict],
) -> None:
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
            Po wykonaniu przelewów zgłoś je w aplikacji SettleApp, aby zaktualizować saldo grupy.
          </p>
        </div>
      </body>
    </html>
    """

    _send_email_smtp(recipient_email, f"SettleApp: Miesięczne rozliczenie grupy {group_name}", html_content)