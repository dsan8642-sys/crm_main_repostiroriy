from datetime import timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.db.models import Count, Min, Q
from django.db.models.functions import Coalesce
from django.utils import timezone

from billing.models import ReceiptFile
from config.celery import app as celery_app
from notifications.models import Channel, DeliveryStatus, NotificationLog


EXPECTED_BEAT_TASKS = {
    "notifications.tasks.run_due_jobs",
    "billing.tasks.purge_expired_receipts_task",
    "dataio.tasks.backup_postgres",
}


def _redact_url(value):
    if not value:
        return ""
    parsed = urlsplit(value)
    if not parsed.scheme:
        return "configured"
    host = parsed.hostname or ""
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return f"{parsed.scheme}://{host}{parsed.path or ''}"


def _status_counts():
    counts = {status: 0 for status in DeliveryStatus.values}
    rows = NotificationLog.objects.values("status").annotate(count=Count("id"))
    counts.update({row["status"]: row["count"] for row in rows})
    return counts


def _channel_status_counts():
    counters = {
        channel: {status: 0 for status in DeliveryStatus.values}
        for channel in Channel.values
    }
    rows = NotificationLog.objects.values("channel", "status").annotate(count=Count("id"))
    for row in rows:
        counters.setdefault(row["channel"], {status: 0 for status in DeliveryStatus.values})
        counters[row["channel"]][row["status"]] = row["count"]
    return counters


def _latest_failure_payload():
    failure = (
        NotificationLog.objects
        .filter(status=DeliveryStatus.FAILED)
        .order_by("-last_attempt_at", "-created_at", "-id")
        .first()
    )
    if not failure:
        return None
    return {
        "id": failure.id,
        "event_type": failure.event_type,
        "channel": failure.channel,
        "error": (failure.error or "")[:300],
        "last_attempt_at": (
            timezone.localtime(failure.last_attempt_at).isoformat()
            if failure.last_attempt_at else None
        ),
        "created_at": timezone.localtime(failure.created_at).isoformat(),
    }


def _notification_queue(now):
    due_filter = (
        Q(status=DeliveryStatus.QUEUED, scheduled_at__lte=now) |
        Q(status=DeliveryStatus.DEFERRED, scheduled_at__lte=now)
    )
    due = NotificationLog.objects.filter(due_filter)
    future = NotificationLog.objects.filter(
        status__in=[DeliveryStatus.QUEUED, DeliveryStatus.DEFERRED],
        scheduled_at__gt=now,
    )
    failed_since = now - timedelta(hours=24)
    failed_last_24h = NotificationLog.objects.filter(
        status=DeliveryStatus.FAILED,
    ).filter(Q(last_attempt_at__gte=failed_since) | Q(created_at__gte=failed_since)).count()

    oldest_due = due.aggregate(value=Min("scheduled_at"))["value"]
    oldest_due_age_minutes = None
    if oldest_due:
        oldest_due_age_minutes = int((now - oldest_due).total_seconds() // 60)

    return {
        "by_status": _status_counts(),
        "by_channel": _channel_status_counts(),
        "due_pending": due.count(),
        "scheduled_future": future.count(),
        "failed_last_24h": failed_last_24h,
        "oldest_due_at": timezone.localtime(oldest_due).isoformat() if oldest_due else None,
        "oldest_due_age_minutes": oldest_due_age_minutes,
        "latest_failure": _latest_failure_payload(),
    }


def _receipt_cleanup(now):
    cutoff = now - timedelta(days=settings.RECEIPT_RETENTION_DAYS)
    expired = (
        ReceiptFile.objects
        .filter(is_deleted=False)
        .annotate(retention_anchor_value=Coalesce("decided_at", "uploaded_at"))
        .filter(retention_anchor_value__lte=cutoff)
        .count()
    )
    return {
        "retention_days": settings.RECEIPT_RETENTION_DAYS,
        "expired_receipts_waiting_cleanup": expired,
    }


def _beat_schedule():
    tasks = []
    configured_task_names = set()
    for name, entry in sorted(celery_app.conf.beat_schedule.items()):
        task = entry.get("task", "")
        configured_task_names.add(task)
        tasks.append({
            "name": name,
            "task": task,
            "schedule": str(entry.get("schedule")),
        })
    missing = sorted(EXPECTED_BEAT_TASKS - configured_task_names)
    return {
        "tasks": tasks,
        "missing_expected_tasks": missing,
        "ok": not missing,
    }


def _worker_config():
    return {
        "broker": _redact_url(settings.CELERY_BROKER_URL),
        "result_backend": _redact_url(settings.CELERY_RESULT_BACKEND),
        "timezone": settings.CELERY_TIMEZONE,
    }


def build_ops_status(now=None):
    now = now or timezone.now()
    notifications = _notification_queue(now)
    receipts = _receipt_cleanup(now)
    beat = _beat_schedule()

    warnings = []
    critical = []

    due_age = notifications["oldest_due_age_minutes"]
    if due_age is not None and due_age >= 60:
        critical.append("notification_queue_due_over_60_minutes")
    elif due_age is not None and due_age >= 30:
        warnings.append("notification_queue_due_over_30_minutes")

    if notifications["failed_last_24h"]:
        warnings.append("notification_failures_last_24h")
    if receipts["expired_receipts_waiting_cleanup"]:
        warnings.append("expired_receipts_waiting_cleanup")
    if not beat["ok"]:
        critical.append("celery_beat_missing_expected_tasks")

    status = "critical" if critical else "warning" if warnings else "ok"

    return {
        "ok": status == "ok",
        "status": status,
        "generated_at": timezone.localtime(now).isoformat(),
        "service": "swimcrm",
        "component": "operations",
        "notifications": notifications,
        "receipt_cleanup": receipts,
        "celery": {
            "worker_config": _worker_config(),
            "beat_schedule": beat,
        },
        "warnings": warnings,
        "critical": critical,
    }
