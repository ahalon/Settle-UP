import resend
from app.core.config import settings


def send_verification_email(to_email: str, token: str):
    if not settings.RESEND_API_KEY:
        print("[EMAIL WARNING] Brak RESEND_API_KEY w konfiguracji (.env)!")
        return

    resend.api_key = settings.RESEND_API_KEY

    # Link weryfikacyjny do Twojego API FastAPI
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
        print(f"[EMAIL SUCCESS] Mail wysłany do {to_email}, id: {response}")
    except Exception as e:
        print(f"[EMAIL ERROR] Błąd podczas wysyłki maila przez Resend: {e}")