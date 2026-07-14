# SwimCRM operations

## Background jobs

Preferred production mode:

```bat
scripts\celery-worker.cmd
scripts\celery-beat.cmd
```

Required environment:

```powershell
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0
```

Celery beat jobs:

- `notifications.tasks.run_due_jobs` every 10 minutes: due notifications and receipt cleanup.
- `billing.tasks.purge_expired_receipts_task` nightly at 03:15: extra receipt cleanup safety net.
- `dataio.tasks.backup_postgres` nightly at 02:00: PostgreSQL custom-format backup.

Schedule can be adjusted with:

```powershell
DUE_JOBS_CRON_MINUTE=*/10
PURGE_RECEIPTS_CRON_HOUR=3
PURGE_RECEIPTS_CRON_MINUTE=15
POSTGRES_BACKUP_CRON_HOUR=2
POSTGRES_BACKUP_CRON_MINUTE=0
BACKUP_DIR=C:\SwimCRMRuntime\backups
```

Fallback without Celery/Redis:

```bat
scripts\run-due-jobs.cmd
scripts\backup-postgres-django.cmd
```

Run `scripts\run-due-jobs.cmd` every 5-15 minutes from Windows Task Scheduler
or cron. Run `scripts\backup-postgres-django.cmd` nightly. The due-jobs command:

- queues/sends due notifications;
- deletes expired receipt files;
- is safe to run repeatedly.

## Backend release checks

Before packaging or deploying, run:

```powershell
.\scripts\release-check-backend.ps1
```

This runs the SQLite backend test suite and a production-like
`manage.py check --deploy` with explicit `SECRET_KEY`, `DEBUG=0`, and
`ALLOWED_HOSTS`, then verifies the source tree has no blocked runtime artifacts.

When the local PostgreSQL service is available, run the extended gate:

```powershell
.\scripts\release-check-backend.ps1 -Postgres
```

The PostgreSQL run verifies the database-level
`excl_trainer_time_overlap` constraint in addition to the normal suite.

## Observability

The backend logs to stdout/stderr with structured console lines:

```text
ts=<timestamp> level=<level> logger=<logger> module=<module> message=<message>
```

Production can tune verbosity with:

```powershell
LOG_LEVEL=INFO
AXES_LOG_LEVEL=WARNING
```

Important loggers:

- `django.request`: unhandled request errors;
- `django.security`: Django security events;
- `audit`: domain audit events mirrored from `AuditLogEntry`.

Keep application logs together with reverse-proxy logs. During an incident,
preserve both logs and `AuditLogEntry` rows before remediation.

Audit coverage already includes admin/client/trainer operations such as
payments, subscriptions, attendance, schedule changes, catalog changes,
client/trainer archive/update actions, imports, privacy export/anonymization,
and consent-aware workflows.

## Release checklist

Before creating a production package:

- run `scripts\release-check-backend.cmd`;
- run `scripts\release-check-backend.cmd -Postgres` when PostgreSQL is available;
- run `npm.cmd run build` from `frontend\`;
- run `npm.cmd run test:smoke` from `frontend\`;
- run `scripts\verify-release-tree.cmd`;
- on the production host, run `scripts\check-production-env.cmd` with real environment variables;
- confirm `DEBUG=0`, strong `SECRET_KEY`, explicit `ALLOWED_HOSTS`, and runtime paths outside the source tree;
- confirm `backups/`, `receipts/`, `swimcrm/receipts/`, `swimcrm/db.sqlite3`, frontend `dist/`, `node_modules/`, backend `.venv/`, old archives, and temporary backlog files are not included in the package;
- confirm Celery beat or cron runs due jobs, receipt cleanup, and PostgreSQL backups;
- verify the latest PostgreSQL backup restore with `scripts\verify-pg-restore.cmd`;
- keep `docs\RODO_GDPR.md` aligned with the actual retention and incident process.

## Admin 2FA

Production defaults to `ADMIN_2FA_REQUIRED=1` when `DEBUG=0`.

Setup:

```powershell
python manage.py setup_admin_otp admin
```

Add the shown secret/URI to an authenticator app, then confirm:

```powershell
python manage.py setup_admin_otp admin --code 123456
```

Reset device:

```powershell
python manage.py setup_admin_otp admin --reset
```

## Runtime files

Production backups and user uploads must live outside the application source
tree. Use a host-managed runtime directory, for example:

```powershell
C:\SwimCRMRuntime\backups
C:\SwimCRMRuntime\staticfiles
C:\SwimCRMRuntime\uploads
```

Do not package `backups/`, `receipts/`, `swimcrm/receipts/`,
`swimcrm/db.sqlite3`, frontend `dist/`, `node_modules/`, backend `.venv/`, or
old project archives into production source releases.

Production environment:

```powershell
SWIMCRM_RUNTIME_DIR=C:\SwimCRMRuntime
STATIC_ROOT=C:\SwimCRMRuntime\staticfiles
MEDIA_ROOT=C:\SwimCRMRuntime\uploads
MEDIA_URL=/media/
```

`DEBUG=0` refuses to start if `STATIC_ROOT` or `MEDIA_ROOT` points inside the
application source tree. Receipt uploads are saved below
`MEDIA_ROOT\receipts\YYYY\MM\` with restrictive Django file permissions.

Web server rules:

- serve `STATIC_ROOT` as public static assets;
- do not execute scripts from `STATIC_ROOT` or `MEDIA_ROOT`;
- do not expose `MEDIA_ROOT\receipts` as a browsable public directory;
- serve receipt files only through authenticated application views if a future
  download workflow is added.

Retention:

- `notifications.tasks.run_due_jobs` runs receipt cleanup every 10 minutes;
- `billing.tasks.purge_expired_receipts_task` runs a nightly safety cleanup;
- manual check: `python manage.py purge_receipts`.

## PostgreSQL backup

Create a custom-format backup:

```powershell
.\scripts\backup-pg.ps1 -OutDir C:\SwimCRMRuntime\backups
```

If PowerShell script execution is blocked on Windows, use the cmd wrapper:

```bat
scripts\backup-pg.cmd C:\SwimCRMRuntime\backups
```

Verify restore into a temporary database:

```powershell
.\scripts\verify-pg-restore.ps1 -BackupFile C:\SwimCRMRuntime\backups\swimcrm-YYYYMMDD-HHMMSS.dump
```

Or with the cmd wrapper:

```bat
scripts\verify-pg-restore.cmd C:\SwimCRMRuntime\backups\swimcrm-YYYYMMDD-HHMMSS.dump
```

The restore check creates `swimcrm_restore_check`, verifies `django_migrations`
and `excl_trainer_time_overlap`, then drops the temporary database. Set
`KEEP_TEMP_DB=1` for `verify-pg-restore.cmd` or pass `-KeepTempDb` to the
PowerShell script if the restored DB must be inspected manually.

Recommended policy:

- daily backup;
- keep daily backups for 14 days;
- keep weekly backups for 8 weeks;
- verify restore at least weekly;
- store a copy outside the application server.

## PostgreSQL DB-level trainer conflict check

Run tests on PostgreSQL:

```powershell
cd .\swimcrm
.\run-pg.ps1 migrate
.\run-pg.ps1 test tests
```

The PostgreSQL-only test verifies `excl_trainer_time_overlap`, the GIST
constraint blocking trainer overlaps at database level.
