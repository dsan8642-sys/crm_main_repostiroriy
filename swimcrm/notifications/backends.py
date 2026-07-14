"""Notification channel backends.

Email uses Django's configured email backend. Telegram and SMS use real HTTP
providers when configured, with dry-run mode for local/dev environments.
"""
import json
from urllib import error, request

from django.conf import settings
from django.core.mail import send_mail

from .models import Channel, validate_sms_template


class DeliveryError(Exception):
    pass


class BaseBackend:
    channel = None

    def send(self, *, parent, subject, body):
        raise NotImplementedError


class EmailBackend(BaseBackend):
    channel = Channel.EMAIL

    def send(self, *, parent, subject, body):
        to = parent.email or parent.user.email
        if not to:
            raise DeliveryError("recipient has no email")
        count = send_mail(
            subject or "Notification",
            body,
            getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@swimcrm.local"),
            [to],
            fail_silently=False,
        )
        if count != 1:
            raise DeliveryError("email provider did not accept the message")
        return {"provider_message_id": f"email:{to}", "raw": {"to": to}}


class TelegramBackend(BaseBackend):
    channel = Channel.TELEGRAM
    sent_messages = []

    def send(self, *, parent, subject, body):
        if not parent.telegram_chat_id:
            raise DeliveryError("recipient has no telegram_chat_id")
        if getattr(settings, "TELEGRAM_DRY_RUN", False):
            TelegramBackend.sent_messages.append((parent.telegram_chat_id, body))
            return {"provider_message_id": f"telegram:dry:{parent.telegram_chat_id}"}

        token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
        if not token:
            raise DeliveryError("TELEGRAM_BOT_TOKEN is not configured")
        api_url = getattr(settings, "TELEGRAM_API_URL", "https://api.telegram.org").rstrip("/")
        response = _post_json(
            f"{api_url}/bot{token}/sendMessage",
            {"chat_id": parent.telegram_chat_id, "text": body},
        )
        if response.get("ok") is False:
            raise DeliveryError(response.get("description") or "Telegram provider rejected the message")
        message_id = response.get("result", {}).get("message_id", "")
        return {"provider_message_id": str(message_id), "raw": response}


class SmsBackend(BaseBackend):
    channel = Channel.SMS
    sent_messages = []

    def send(self, *, parent, subject, body):
        validate_sms_template(body)
        if not parent.phone:
            raise DeliveryError("recipient has no phone")
        if getattr(settings, "SMS_DRY_RUN", False):
            SmsBackend.sent_messages.append((parent.phone, body))
            return {"provider_message_id": f"sms:dry:{parent.phone}"}

        provider_url = getattr(settings, "SMS_PROVIDER_URL", "")
        api_key = getattr(settings, "SMS_API_KEY", "")
        if not provider_url or not api_key:
            raise DeliveryError("SMS provider is not configured")
        response = _post_json(
            provider_url,
            {
                "to": parent.phone,
                "text": body,
                "sender": getattr(settings, "SMS_SENDER", "SwimCRM"),
            },
            headers={"Authorization": f"Bearer {api_key}"},
        )
        message_id = response.get("message_id") or response.get("id") or ""
        return {"provider_message_id": str(message_id), "raw": response}


def _post_json(url, payload, headers=None):
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            **(headers or {}),
        },
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise DeliveryError(f"HTTP {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise DeliveryError(str(exc.reason)) from exc


BACKENDS = {
    Channel.EMAIL: EmailBackend(),
    Channel.TELEGRAM: TelegramBackend(),
    Channel.SMS: SmsBackend(),
}
