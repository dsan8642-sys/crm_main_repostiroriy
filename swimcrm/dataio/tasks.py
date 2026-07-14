from celery import shared_task

from .backup import create_postgres_backup


@shared_task(name="dataio.tasks.backup_postgres")
def backup_postgres_task():
    backup_file = create_postgres_backup()
    return {"backup_file": str(backup_file)}
