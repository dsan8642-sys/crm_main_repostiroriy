# SwimCRM operations

## Background jobs

Preferred production mode:

```bat
scripts\celery-worker.cmd
scripts\celery-beat.cmd
```

Required environment:

```powershell
DJANGO_ENV=production
DEBUG=0
POSTGRES_DB=swimcrm
POSTGRES_USER=<production db user>
POSTGRES_PASSWORD=<production db password>
POSTGRES_HOST=<production db host>
POSTGRES_PORT=5432
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0
BACKUP_DIR=C:\SwimCRMRuntime\backups
NOCOBASE_BRIDGE_TOKEN=<production bridge token>
NOCOBASE_CONFIG_TOKEN=<production config token>
NOCOBASE_APP_ENV=production
NOCOBASE_APP_KEY=<long random app key>
NOCOBASE_APP_ROOT=C:\SwimCRMRuntime\nocobase-app
NOCOBASE_APP_PORT=13000
NOCOBASE_DB_HOST=<production db host>
NOCOBASE_DB_PORT=5432
NOCOBASE_DB_DATABASE=nocobase_hybrid
NOCOBASE_DB_USER=<production nocobase db user>
NOCOBASE_DB_PASSWORD=<production nocobase db password>
NOCOBASE_ROOT_USERNAME=<admin username>
NOCOBASE_ROOT_EMAIL=<admin email>
NOCOBASE_ROOT_PASSWORD=<strong initial/root password>
NOCOBASE_STORAGE_DIR=C:\SwimCRMRuntime\nocobase-storage
SECURE_SSL_REDIRECT=1
TRUST_PROXY_SSL_HEADER=1
CSRF_TRUSTED_ORIGINS=https://crm.example.com
```

Production wrappers fail fast when required PostgreSQL/Celery variables are
missing instead of silently using local development defaults.

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
`ALLOWED_HOSTS`, then verifies the source tree has no blocked runtime artifacts
and the GitHub release workflow still contains the required full-stack and
PostgreSQL CI jobs.

To validate only the CI workflow structure while diagnosing release failures:

```powershell
.\scripts\verify-ci-release-workflow.cmd
```

CI runs a dedicated PostgreSQL backend job (`postgres-backend-check`) against a
PostgreSQL service container. When the local PostgreSQL service is available,
run the same extended gate before release approval:

```powershell
.\scripts\release-check-backend.ps1 -Postgres
```

The PostgreSQL run verifies the database-level
`excl_trainer_time_overlap` constraint in addition to the normal suite.

For a full-stack release candidate, run the combined gate:

```powershell
.\scripts\release-check-full.cmd
```

This runs the backend gate plus frontend dependency install, high-severity
dependency audit, Vite production build, Playwright Chromium install/check, and
Playwright smoke tests. Frontend dependency install uses the repository-local
`.npm-cache` to avoid relying on the user's global npm cache.
Use `-SkipFrontendInstall` only when `frontend\node_modules` is already known
to match `frontend\package-lock.json`.

CI may run the same gate with `-AllowMissingLocalNocoBaseRuntime` because
`swimcrm-hybrid\source` is an ignored local runtime tree and is not part of a
clean source checkout. Do not use that flag for the final pre-deploy check on a
prepared release host; the normal gate should fingerprint the downloaded local
NocoBase runtime.

## Live hybrid smoke check

After deploying or restarting the production host, run the live hybrid smoke
check against the real URLs:

```powershell
$env:DJANGO_BASE_URL="https://crm.example.com"
$env:NOCOBASE_BASE_URL="https://nocobase.example.com"
$env:NOCOBASE_BRIDGE_TOKEN="<production bridge token>"
$env:NOCOBASE_CONFIG_TOKEN="<production config token>"
scripts\check-hybrid-health.cmd -RequireHttps -RequireOpsOk
```

The script verifies:

- public Django liveness at `/api/health/`;
- Django's NocoBase bridge health at `/api/nocobase/health/`;
- Django's NocoBase operations snapshot at `/api/nocobase/ops-status/`;
- Django's NocoBase guarded config API at `/api/nocobase/config/languages/`;
- NocoBase process health at `/api/__health_check`.

For release approval, `-RequireOpsOk` requires the operations snapshot to be
exactly `status=ok`. Without that release flag, `status=critical` still fails
the smoke check by default. Use `-AllowOpsCritical` only when diagnosing an
incident, not as a release approval shortcut.

## Production cutover evidence

Before declaring a release production-ready, copy
`docs\PRODUCTION_CUTOVER_EVIDENCE.example.json` to
`docs\PRODUCTION_CUTOVER_EVIDENCE.json` and replace the sample values with real
release evidence:

- release commit SHA and branch;
- local backend and full-stack release gate outputs;
- release source archive builder output proving the reusable source package was
  created from the clean release commit;
- tracked release-source guard output proving required NocoBase and frontend
  manifests are Git-tracked;
- GitHub Actions run URL proving `release-check` passed on the release commit
  and evidence text naming `swimcrm-release-source-<commit-sha>`;
- GitHub Actions `release-check` run artifact named
  `swimcrm-release-source-<commit-sha>` containing the verified source zip and
  manifest;
- GitHub Actions run URL proving `postgres-backend-check` passed on the release commit;
- production environment preflight output;
- live `scripts\check-hybrid-health.cmd -RequireHttps -RequireOpsOk` output from the target host;
- latest backup/restore drill evidence;
- rollback plan acknowledgement.

You can generate a draft from the current Git checkout:

```powershell
scripts\new-production-cutover-evidence.cmd
```

The draft is written to `docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json`.
Rename it to `docs\PRODUCTION_CUTOVER_EVIDENCE.json` only after filling real
evidence. A draft generated from a dirty working tree records
`source_tree=dirty`; final production approval requires a clean release commit.

Validate the filled manifest:

```powershell
scripts\verify-production-cutover-evidence.cmd -RequireCurrentHead
```

By default, the verifier accepts only `environment=production`. Use
`-AllowStaging` only for a staging rehearsal manifest, never for final cutover
approval.

The verifier intentionally rejects placeholders and requires the live hybrid
health evidence to include the guarded config API check
`/api/nocobase/config/languages/`. External CI evidence must use GitHub
Actions run URLs and mention the exact `release_candidate.commit_sha`. For final
approval, run it with `-RequireCurrentHead` so stale evidence for an older
commit or release archive checksum cannot approve the current release
candidate.

Production preflight also enforces minimum secret lengths: `SECRET_KEY` must be
at least 50 characters, while `NOCOBASE_BRIDGE_TOKEN`,
`NOCOBASE_CONFIG_TOKEN`, `NOCOBASE_APP_KEY`, and `NOCOBASE_ROOT_PASSWORD` must
each be at least 32 characters and must not be copied from examples or
release-check placeholders.

The manifest must also include the critical pass fragments from each command,
not just `status=passed`:

- backend release gate: `Backend release checks passed`, `Production readiness
  audit verified`, `NocoBase API build-pack smoke check`, `Tracked release
  source manifests`;
- full-stack release gate: `Full-stack release checks passed`, `found 0
  vulnerabilities`, `Frontend production build`, `Frontend Playwright smoke
  tests`;
- release source archive: `Release source archive written`, `Release source
  manifest written`, `Release source archive manifest verified`, `Release
  source archive contents verified`, exact
  `release_candidate.commit_sha`, and archive `sha256`;
- tracked release-source guard: `Release source manifests verified`, `tracked`;
- production preflight: `Production environment check passed`, `Runtime path
  settings passed`, `PostgreSQL production settings passed`, `Celery
  production settings passed`, `NocoBase production settings passed`, `HTTPS
  reverse-proxy settings passed`;
- live hybrid health: `Hybrid health check passed`, `HTTPS live endpoint
  requirement passed`, `Operations status ok requirement passed`, real
  `https://` Django and NocoBase production URLs, `nocobase_config_health`,
  `/api/nocobase/config/languages/`;
- backup/restore drill: `Hybrid backup set written`, `backup_set_dir`,
  `nocobase_database`, `Django dump sha256 OK`, `NocoBase dump sha256 OK`,
  the actual 64-character Django and NocoBase dump SHA256 values,
  `Django dump list OK`, `NocoBase dump list OK`, `Restore verification OK`,
  `Hybrid backup set verification OK`;
- rollback acknowledgement: `Rollback plan reviewed`, `stop writers`,
  `verified backup`, `restore`, `migrate --check`, `restart services`,
  `live smoke`.

## NocoBase runtime

Production NocoBase runtime must be started with explicit environment
variables. Do not use development defaults for database or root credentials:

```powershell
$env:NOCOBASE_APP_ENV="production"
$env:NOCOBASE_APP_KEY="<long random app key>"
$env:NOCOBASE_APP_ROOT="C:\SwimCRMRuntime\nocobase-app"
$env:NOCOBASE_APP_PORT="13000"
$env:NOCOBASE_DB_HOST="<production db host>"
$env:NOCOBASE_DB_PORT="5432"
$env:NOCOBASE_DB_DATABASE="nocobase_hybrid"
$env:NOCOBASE_DB_USER="<production nocobase db user>"
$env:NOCOBASE_DB_PASSWORD="<production nocobase db password>"
$env:NOCOBASE_ROOT_USERNAME="<admin username>"
$env:NOCOBASE_ROOT_EMAIL="<admin email>"
$env:NOCOBASE_ROOT_PASSWORD="<strong initial/root password>"
$env:NOCOBASE_STORAGE_DIR="C:\SwimCRMRuntime\nocobase-storage"
```

The runtime script supports a non-starting plan check:

```powershell
.\scripts\run-nocobase-runtime.ps1 -PlanOnly
```

When `NOCOBASE_APP_ENV=production` or `DJANGO_ENV=production`, the script fails
fast if required secrets are missing, if NocoBase app/database/root secrets are
weak or copied from examples, or if runtime paths point inside the source tree.

## Observability

The backend logs to stdout/stderr with structured console lines:

```text
ts=<timestamp> level=<level> logger=<logger> module=<module> message=<message>
```

Production can tune verbosity with:

```powershell
LOG_LEVEL=INFO
AUDIT_LOG_LEVEL=INFO
AXES_LOG_LEVEL=WARNING
```

Important loggers:

- `django.request`: unhandled request errors;
- `django.security`: Django security events;
- `audit`: domain audit events mirrored from `AuditLogEntry`.

Local release checks set `AUDIT_LOG_LEVEL=WARNING` when it is not already set,
so the gate output stays readable while database audit records and explicit
`assertLogs` checks remain covered. Production should normally keep
`AUDIT_LOG_LEVEL=INFO` unless log volume requires a deliberate override.

Keep application logs together with reverse-proxy logs. During an incident,
preserve both logs and `AuditLogEntry` rows before remediation.

Audit coverage already includes admin/client/trainer operations such as
payments, subscriptions, attendance, schedule changes, catalog changes,
client/trainer archive/update actions, imports, privacy export/anonymization,
and consent-aware workflows.

## Health and readiness

Use `GET /api/health/` for public liveness checks from the reverse proxy,
uptime monitor, or load balancer. It only confirms that the Django process can
serve HTTP.

Use `GET /api/admin/readiness/` after admin login for deeper backend readiness:

- database connectivity;
- pending Django migrations;
- writable `MEDIA_ROOT`;
- runtime path placement outside the source tree in production;
- configured NocoBase bridge and config tokens;
- verified NocoBase first-screens blueprint, API contract, response schemas, and
  Django route resolution;
- configured default language.

The readiness endpoint intentionally does not expose secret values. It only
reports whether each secret is configured and whether it is required in the
current environment.

Use `GET /api/admin/ops-status/` after admin login for operational backlog
monitoring. It reports:

- due/deferred/failed notification queue counts;
- failed notification attempts in the last 24 hours;
- age of the oldest due notification;
- receipt files waiting for retention cleanup;
- configured Celery beat jobs;
- redacted Celery broker/result backend settings.

The same read-only snapshot is available to NocoBase through the bridge:

```http
GET /api/nocobase/ops-status/
Authorization: Bearer <NOCOBASE_BRIDGE_TOKEN>
```

Use this endpoint for the first NocoBase operations dashboard. Treat
`status=critical` as an incident signal. In particular, investigate immediately
when due notifications are older than 60 minutes or expected Celery beat jobs
are missing.

Check NocoBase process health separately:

```powershell
scripts\check-nocobase-health.cmd
```

## Release checklist

Before creating a production package:

- run `scripts\release-check-backend.cmd`;
- run `scripts\verify-ci-release-workflow.cmd` if the GitHub Actions release
  workflow was edited;
- verify the CI `postgres-backend-check` job is green and run
  `scripts\release-check-backend.cmd -Postgres` locally when PostgreSQL is
  available;
- run `scripts\release-check-full.cmd` before approving a full-stack release
  candidate;
- after committing the intended release state, run
  `scripts\verify-local-release-candidate.cmd` to require a clean Git tree, run
  the full-stack release gate, build the source archive, and verify the archive
  manifest/checksum before collecting target-host production evidence;
- before the release commit exists, run
  `scripts\verify-local-release-candidate.cmd -PlanOnly` to print a JSON
  release-candidate plan showing dirty/staged/untracked file counts, grouped
  release-review domains, production-critical changed paths, branch state,
  Git remote state, explicit release blockers, and the remaining production
  evidence gap without running long checks;
- run `scripts\verify-frontend-release.cmd` when validating only the React/Vite
  frontend dependency audit, build, browser install, and Playwright smoke tests;
- run `scripts\verify-hybrid-cutover-readiness.cmd` when you need the
  machine-readable Django + NocoBase cutover evidence matrix separately from
  the full release gate;
- run `scripts\verify-nocobase-prerequisites.cmd`,
  `scripts\verify-nocobase-runtime.cmd`, and
  `scripts\verify-nocobase-blueprint.cmd` when diagnosing NocoBase-specific
  release failures separately from the full gate;
- run `scripts\verify-nocobase-build-pack.cmd` when validating the operator
  assembly plan for the first NocoBase screens separately from the full gate;
- run `scripts\verify-nocobase-api-smoke.cmd` when validating that the first
  NocoBase screen data sources still match live Django response schemas;
- run `scripts\verify-production-readiness-audit.cmd` when validating that the
  business/architecture requirements still have concrete code, test, script, or
  runbook evidence before release;
- after CI and target-host checks are complete, fill
  `docs\PRODUCTION_CUTOVER_EVIDENCE.json` from
  `docs\PRODUCTION_CUTOVER_EVIDENCE.example.json`, or generate a draft with
  `scripts\new-production-cutover-evidence.cmd`, then run
  `scripts\verify-production-cutover-evidence.cmd`;
- when local backend/full-stack/archive checks already passed, generate the
  draft with `scripts\new-production-cutover-evidence.cmd -LocalBackendPassed
  -LocalFullStackPassed -ReleaseArchivePassed -ArchiveSha256 <sha256>
  -ArchiveManifest <manifest-path>` to reduce manual evidence-copy mistakes;
- when handing the release candidate to whoever owns GitHub/production access,
  run `scripts\new-release-handoff.cmd -Force` to write the ignored
  `docs\RELEASE_HANDOFF.json` with current commit, archive checksum, draft
  evidence path, remote state, blockers, pending external actions, and an
  operator checklist with command/evidence/stop-if-missing instructions, then
  run `scripts\verify-release-handoff.cmd` to catch stale handoff files,
  incomplete operator checklist items, or archive checksum mismatches before
  transfer;
- if running frontend commands manually instead of the wrapper, run
  `npm.cmd ci --cache ..\.npm-cache`, `npm.cmd run build`, and
  `npm.cmd run test:smoke` from `frontend\`;
- run `scripts\verify-release-tree.cmd -SourceOnly` before packaging source from a
  working tree that already contains local runtime/build directories;
- run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify-release-tree.ps1 -SourceOnly -RequireTrackedReleaseFiles`
  before final cutover approval to confirm the root NocoBase tooling manifests
  and frontend manifests are Git-tracked, not merely present in the local
  worktree;
- run `scripts\verify-release-source-manifests.cmd -RequireTracked` when you
  need the same tracked-manifest guard through an ops/admin-friendly wrapper;
- after the release commit is clean, run `scripts\build-release-source.cmd` to
  produce a source archive from `git archive HEAD`; this wrapper refuses dirty
  worktrees and re-runs the source-only/tracked-manifest guards before writing
  `releases\swimcrm-release-<sha>.zip`;
- verify the produced archive manifest with
  `scripts\verify-release-source-archive.cmd releases\swimcrm-release-<sha>.manifest.json`
  and paste `Release source archive manifest verified`, `Release source archive
  contents verified`, `commit_sha`, and `archive_sha256` into the cutover
  evidence;
- use `scripts\verify-release-tree.cmd -Strict` only as a clean checkout guard
  before dependencies and runtime assets are generated;
- on the production host, run `scripts\check-production-env.cmd` with real environment variables;
- confirm `DEBUG=0`, strong `SECRET_KEY`, explicit `ALLOWED_HOSTS`, and runtime paths outside the source tree;
- confirm `backups/`, `receipts/`, `swimcrm/receipts/`, `swimcrm/db.sqlite3`,
  `releases/`, frontend `dist/`, `node_modules/`, backend `.venv/`, old
  archives, and temporary backlog files are not included in the package;
- confirm `.env`, `docs\PRODUCTION_CUTOVER_EVIDENCE.json`, and
  `docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json` are not included in reusable
  source packages; production cutover evidence is host/release-specific;
- confirm Celery beat or cron runs due jobs, receipt cleanup, and PostgreSQL backups;
- verify the latest hybrid backup set with `scripts\verify-hybrid-backup-set.cmd`;
- when checking a standalone Django dump, verify the latest PostgreSQL backup
  restore with `scripts\verify-pg-restore.cmd <path-to-dump>`;
- verify `GET /api/health/`, `GET /api/admin/readiness/`,
  `GET /api/admin/ops-status/`, and `scripts\check-hybrid-health.cmd` on the
  target host;
- confirm `GET /api/admin/readiness/` reports
  `checks.nocobase_first_screens.ok=true`;
- confirm `GET /api/admin/readiness/` reports
  `checks.nocobase_screen_build_pack.ok=true`;
- keep `docs\RODO_GDPR.md` aligned with the actual retention and incident process.

`scripts\check-production-env.cmd` is the host-level hybrid preflight. It
validates Django security settings, HTTPS reverse-proxy settings, PostgreSQL
credentials, Celery URLs, NocoBase runtime secrets, bridge/config tokens, and
runtime/backup paths before running `manage.py check --deploy`.

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
`swimcrm/db.sqlite3`, `releases/`, frontend `dist/`, `node_modules/`, backend
`.venv/`, or old project archives into production source releases.

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

When `DJANGO_ENV=production`, `backup-pg.ps1` requires explicit PostgreSQL
credentials and an output directory outside the source tree. It refuses the
development password `postgres`.

If PowerShell script execution is blocked on Windows, use the cmd wrapper:

```bat
scripts\backup-pg.cmd C:\SwimCRMRuntime\backups
```

Verify restore into a temporary database:

```powershell
.\scripts\verify-pg-restore.ps1 -BackupFile C:\SwimCRMRuntime\backups\swimcrm-YYYYMMDD-HHMMSS.dump
```

Or with the guarded cmd wrapper. It delegates to `verify-pg-restore.ps1` and
does not set database password defaults itself:

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

## Hybrid Django + NocoBase backup

For production, prefer the full-stack backup wrapper. It captures:

- Django PostgreSQL database;
- NocoBase PostgreSQL database;
- Django media/uploads directory;
- NocoBase storage directory;
- a `manifest.json` describing the backup set.

Production backup/restore scripts fail fast when `DJANGO_ENV=production` and
required credentials or runtime paths are missing. In production:

- set `BACKUP_DIR` explicitly and keep it outside the source tree;
- set `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`;
- set `NOCOBASE_DB_DATABASE`, `NOCOBASE_DB_USER`, and `NOCOBASE_DB_PASSWORD`;
- set `MEDIA_ROOT` outside the source tree when media backup/restore is used;
- set `NOCOBASE_STORAGE_DIR` outside the source tree when NocoBase storage
  backup/restore is used;
- never use `POSTGRES_PASSWORD=postgres` or `NOCOBASE_DB_PASSWORD=postgres`.

Dry-run the plan first:

```powershell
.\scripts\backup-hybrid.ps1 -PlanOnly
```

Create a backup set:

```powershell
.\scripts\backup-hybrid.ps1 `
  -OutDir C:\SwimCRMRuntime\backups `
  -DjangoDbName swimcrm `
  -NocoBaseDbName nocobase_hybrid `
  -MediaRoot C:\SwimCRMRuntime\uploads `
  -NocoBaseStorageDir C:\SwimCRMRuntime\nocobase-storage
```

If the local NocoBase runtime uses the repository-local development storage,
use the documented local path only for development backups:

```powershell
.\scripts\backup-hybrid.ps1 -NocoBaseStorageDir .\swimcrm-hybrid\source\storage
```

Do not commit generated backup sets. `verify-release-tree.ps1` blocks `.dump`,
`.zip`, `backups/`, runtime, media, and NocoBase generated directories.

Verify the latest hybrid backup set after creation:

```powershell
.\scripts\verify-hybrid-backup-set.cmd
```

The wrapper finds the latest `hybrid-*` directory in `BACKUP_DIR`, verifies the
manifest, SHA256 checksums for Django/NocoBase dumps and optional media/storage
archives, checks both database dumps with `pg_restore --list`, and runs a
Django restore drill in a temporary PostgreSQL database.

## Hybrid restore

Restore is destructive. Stop all writers before restoring:

- Django web process;
- Celery workers and beat;
- notification jobs;
- NocoBase runtime;
- any admin import/export jobs.

Inspect the restore plan:

```powershell
.\scripts\restore-hybrid.ps1 -BackupSetDir C:\SwimCRMRuntime\backups\hybrid-YYYYMMDD-HHMMSS -PlanOnly
```

Before any real restore, verify the backup set manifest and dump/archive
checksums:

```powershell
.\scripts\verify-hybrid-backup-set.ps1 -BackupSetDir C:\SwimCRMRuntime\backups\hybrid-YYYYMMDD-HHMMSS
```

Run the restore only after confirming the target databases and storage
directories are correct:

```powershell
.\scripts\restore-hybrid.ps1 `
  -BackupSetDir C:\SwimCRMRuntime\backups\hybrid-YYYYMMDD-HHMMSS `
  -DjangoDbName swimcrm `
  -NocoBaseDbName nocobase_hybrid `
  -MediaRoot C:\SwimCRMRuntime\uploads `
  -NocoBaseStorageDir C:\SwimCRMRuntime\nocobase-storage `
  -ConfirmRestore
```

After restore:

- run `cd swimcrm; .\.venv\Scripts\python.exe manage.py migrate --check`;
- start Django and NocoBase;
- run `scripts\check-nocobase-health.cmd`;
- run a smoke test for login, client detail, payment summary, notifications,
  and a read-only NocoBase bridge request.

## PostgreSQL DB-level trainer conflict check

Run tests on PostgreSQL:

```powershell
cd .\swimcrm
.\run-pg.ps1 migrate
.\run-pg.ps1 test tests
```

The PostgreSQL-only test verifies `excl_trainer_time_overlap`, the GIST
constraint blocking trainer overlaps at database level.
