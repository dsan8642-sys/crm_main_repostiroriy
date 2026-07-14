from celery import shared_task

from .jobs import run_due_jobs
from .services import run_scheduler


@shared_task(name="notifications.tasks.run_notification_scheduler")
def run_notification_scheduler():
    return run_scheduler()


@shared_task(name="notifications.tasks.run_due_jobs")
def run_due_jobs_task():
    return run_due_jobs()
