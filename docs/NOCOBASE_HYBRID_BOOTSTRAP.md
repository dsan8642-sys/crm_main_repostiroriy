# NocoBase Hybrid Bootstrap

## Purpose

This document defines the practical bootstrap path for introducing NocoBase
into the current CRM as part of the hybrid rewrite.

It does not replace `CRM_CORE_SPEC.md`. It turns the architecture decision into
an executable setup path.

## Current Decision

NocoBase is introduced as:

- the primary low-code admin/configuration platform;
- a controlled integration surface over the Django system of record;
- a productivity layer for back-office CRUD, dictionaries, templates, and
  operational configuration.

NocoBase is not introduced as:

- the source of truth for ledger, billing, attendance, payroll calculation, or
  audit history.

## Official NocoBase Setup Baseline

This bootstrap is aligned with the official NocoBase documentation that states:

- `Node.js >= 22`
- `Yarn 1.x`
- install the repository-pinned `@nocobase/cli`
- initialize an app with `nb init --ui`
- local default app access is typically `http://localhost:13000`
- production deployment should be moved behind a reverse proxy with HTTPS

## Actual Local Install Status

As of `2026-07-15`, NocoBase has already been downloaded and initialized inside
this repository.

- env name: `swimcrm-hybrid`
- source path: `C:\Users\clans\.codex\worktrees\1ab2\H2O_CRM_V3\swimcrm-hybrid\source`
- storage path: `C:\Users\clans\.codex\worktrees\1ab2\H2O_CRM_V3\swimcrm-hybrid\source\storage`
- database: PostgreSQL `nocobase_hybrid`
- db host: `localhost:5432`
- db user: `postgres`
- seeded admin email: `admin@swimcrm.local`
- seeded admin username: `admin`

The CLI config in `.nocobase/config.json` is in `setupState = installed`.

Foreground startup has been verified up to the application-ready stage with:

- `Gateway HTTP Server running at http://0.0.0.0:13000/`
- successful PostgreSQL connection
- `app has been started`
- `GET /api/__health_check -> 200` after full startup delay

The supported Windows background helper avoids PM2 and starts the verified
direct runtime through a hidden PowerShell child process. Use `-WaitForHealth`
when the startup must be treated as a deploy/checkpoint action rather than a
fire-and-forget developer convenience:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-nocobase-runtime.ps1 -WaitForHealth
```

The helper writes stdout/stderr logs under the configured NocoBase storage log
directory and fails if the process exits early or `/api/__health_check` does
not become healthy within the startup timeout.

## Recommended Local Hybrid Topology

### Django

Remains responsible for:

- subscriptions;
- session ledger;
- attendance;
- payment confirmation and allocations;
- debt calculation;
- payroll calculations;
- audit logs;
- parent and trainer operational APIs.

### NocoBase

Starts with:

- dictionaries and translations;
- notification templates;
- quiet hours policies;
- payroll schemes and payroll rule configuration;
- selected back-office CRUD interfaces;
- admin dashboards and support views.

### PostgreSQL

Recommended target shape:

- one PostgreSQL server;
- separate databases or schemas for:
  - Django primary app data;
  - NocoBase app data;
- optional external data-source connections from NocoBase to selected Django
  tables/views where read or controlled CRUD is needed.

## Recommended Local Defaults

Use these as the local default values for the hybrid rewrite environment:

- NocoBase env name: `swimcrm-hybrid`
- NocoBase app storage directory: `./swimcrm-hybrid/source`
- NocoBase local port: `13000`
- Django local port: `8000`
- Frontend local port: `5173`

## Bootstrap Steps

### 1. Validate prerequisites

Required:

- Node.js 22 or newer
- Yarn 1.x

Recommended:

- PostgreSQL available locally or on a reachable dev server
- existing Django backend running separately

Machine-check the local prerequisite set with:

```powershell
.\scripts\verify-nocobase-prerequisites.cmd
```

The check accepts the repository-local Yarn binary from `node_modules` when a
global `yarn.cmd` is not installed.

### 2. Install NocoBase CLI

Project-supported path:

```powershell
npm install
.\node_modules\.bin\nb.cmd --version
```

The repository root pins the local tooling used by bootstrap and release checks:

- `@nocobase/cli` `2.1.24`
- `yarn` `1.22.22`

Do not use a global `nb` binary or replace these with floating `latest`, `^`,
or `~` ranges in production release preparation.

### 3. Initialize the NocoBase app

Recommended command:

```powershell
.\scripts\init-nocobase-hybrid.cmd -RunInit
```

During the wizard, use:

- environment identifier: `swimcrm-hybrid`
- app storage directory: `<repo>/swimcrm-hybrid`
- runtime port: `13000`
- database: dedicated PostgreSQL database for NocoBase

### 4. Verify the app

Useful commands:

```powershell
.\node_modules\.bin\nb.cmd env list
.\node_modules\.bin\nb.cmd env info
.\node_modules\.bin\nb.cmd app logs
```

Verified direct runtime command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-nocobase-runtime.ps1
```

For production, configure explicit environment variables first:

```powershell
$env:NOCOBASE_APP_ENV="production"
$env:NOCOBASE_APP_KEY="<long random app key>"
$env:NOCOBASE_DB_HOST="<production db host>"
$env:NOCOBASE_DB_DATABASE="nocobase_hybrid"
$env:NOCOBASE_DB_USER="<production nocobase db user>"
$env:NOCOBASE_DB_PASSWORD="<production nocobase db password>"
$env:NOCOBASE_ROOT_PASSWORD="<strong initial/root password>"
$env:NOCOBASE_STORAGE_DIR="C:\SwimCRMRuntime\nocobase-storage"
```

The runtime script refuses production startup with missing secrets, development
database/root passwords, weak or placeholder `NOCOBASE_APP_KEY` values,
source-tree app roots, or source-tree storage. In production,
`NOCOBASE_APP_KEY` must be a real secret at least 32 characters long and must
not be copied from examples or release-check placeholders. Use `-PlanOnly` to
inspect the effective configuration without starting Node/NocoBase.

The plan also fingerprints the local NocoBase runtime when it is present:

- `@nocobase/app` version;
- local CLI entry path and existence;
- `package.json`;
- `yarn.lock`;
- `node_modules`.

This is intentional because `swimcrm-hybrid/` is a generated local runtime and
is ignored by Git. Production deployments should recreate or copy the runtime
to an explicit `NOCOBASE_APP_ROOT` outside the source tree, then rely on this
plan output and the release checks to verify the effective runtime shape.

This script uses the verified low-level route:

```powershell
Set-Location .\swimcrm-hybrid\source
node.exe .\node_modules\@nocobase\cli-v1\bin\index.js start --launch-mode direct
```

Background helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-nocobase-runtime.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-nocobase-runtime.ps1 -WaitForHealth
```

Health check:

```powershell
.\scripts\check-nocobase-health.cmd
```

Expected result after NocoBase has fully started:

```text
NocoBase health check passed: http://127.0.0.1:13000/api/__health_check
```

After Django and NocoBase are both running, verify the whole hybrid stack:

```powershell
$env:DJANGO_BASE_URL="http://127.0.0.1:8000"
$env:NOCOBASE_BASE_URL="http://127.0.0.1:13000"
$env:NOCOBASE_BRIDGE_TOKEN="<bridge token>"
.\scripts\check-hybrid-health.cmd
```

## Release Hygiene

The local NocoBase runtime is intentionally ignored by Git:

- `.nocobase/`
- `.nocobase-logs/`
- `.npm-cache/`
- `.yarn-cache/`
- `swimcrm-hybrid/`

These directories contain local config, logs, caches, downloaded app files, and
development storage. They must not be committed as application source.

Use the normal release scan for source-package readiness:

```powershell
.\scripts\verify-release-tree.ps1
```

The backend release gate also checks NocoBase prerequisites, runtime guards,
first-screen blueprint validity, and the hybrid cutover evidence matrix:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\release-check-backend.ps1
```

Use strict mode before making a clean distribution snapshot:

```powershell
.\scripts\verify-release-tree.ps1 -Strict
```

Strict mode intentionally fails while local runtime directories are present. For
a clean release snapshot, recreate NocoBase from the tracked scripts and
documented environment instead of packaging local generated files.

## Django Bridge API

Django exposes a read-only bridge for NocoBase under:

```text
/api/nocobase/
```

Set a strong production token:

```powershell
set NOCOBASE_BRIDGE_TOKEN=<long-random-secret>
```

NocoBase should call the bridge with:

```http
Authorization: Bearer <NOCOBASE_BRIDGE_TOKEN>
```

Initial endpoints:

- `GET /api/nocobase/health/`
- `GET /api/nocobase/ops-status/`
- `GET /api/nocobase/clients/?q=&active=true&limit=200`
- `GET /api/nocobase/debtors/`

This bridge is intentionally read-only. It gives NocoBase operational summaries
computed by Django services while keeping direct writes to subscriptions,
payments, attendance, ledger, payroll, and audit history inside Django.

## Django Guarded Config API

NocoBase can also edit approved low-risk configuration through a separate token:

```powershell
set NOCOBASE_CONFIG_TOKEN=<different-long-random-secret>
```

Use this token only for guarded configuration endpoints:

- `GET|POST /api/nocobase/config/quiet-hours/`
- `GET|PATCH|PUT|DELETE /api/nocobase/config/quiet-hours/<id>/`
- `GET|POST /api/nocobase/config/payroll/schemes/`
- `GET|PATCH|PUT|DELETE /api/nocobase/config/payroll/schemes/<id>/`
- `GET|POST /api/nocobase/config/payroll/rules/`
- `GET|PATCH|PUT|DELETE /api/nocobase/config/payroll/rules/<id>/`
- `GET|POST /api/nocobase/config/payroll/assignments/`
- `GET|POST /api/nocobase/config/languages/`
- `GET|PATCH|PUT|DELETE /api/nocobase/config/languages/<id>/`
- `GET|POST /api/nocobase/config/dictionary-keys/`
- `GET|PATCH|PUT|DELETE /api/nocobase/config/dictionary-keys/<id>/`
- `GET|POST /api/nocobase/config/dictionary-translations/`
- `GET|PATCH|PUT|DELETE /api/nocobase/config/dictionary-translations/<id>/`
- `GET|POST /api/nocobase/config/notification-template-translations/`
- `GET|PATCH|PUT|DELETE /api/nocobase/config/notification-template-translations/<id>/`

These endpoints are intentionally not a general admin API. They do not expose
payment confirmation, ledger adjustments, attendance mutation, payroll period
calculation, audit logs, or receipt files. Django remains responsible for
validation and all business-rule execution.

Expected local outcome:

- app starts normally;
- admin login works;
- app is reachable on `http://localhost:13000`.

### 5. Introduce hybrid boundaries

After bootstrap, configure NocoBase only for the collections and admin surfaces
already approved in `NOCOBASE_BOUNDARY_MAP.md`.

Do not connect or mutate core transactional entities until Django-side service
boundaries are in place.

## First NocoBase Screens to Build

Use `docs/NOCOBASE_FIRST_SCREENS.json` as the source of truth for the first
production-safe NocoBase screens. The initial screens are intentionally built on
Django bridge/config APIs, not direct edits to transactional tables:

- operations status;
- client directory;
- debtors;
- quiet hours;
- notification templates and rules;
- locations and session types;
- payroll rules;
- payroll period reporting;
- localization.

Use `docs/NOCOBASE_SCREEN_BUILD_PACK.json` as the operator build pack for
assembling those screens in NocoBase. It defines routes, data sources, block
types, visible fields, allowed actions, and roles for each screen while keeping
the Django API blueprint as the source of truth for safety boundaries.

Verify the blueprint before release:

```powershell
.\scripts\verify-nocobase-blueprint.cmd
.\scripts\verify-nocobase-build-pack.cmd
.\scripts\verify-nocobase-api-smoke.cmd
```

For a broader machine-readable cutover evidence matrix, run:

```powershell
.\scripts\verify-hybrid-cutover-readiness.cmd
```

The following remain Django-only actions unless a future explicit boundary
decision changes them:

- payroll period calculation;
- payroll approval/export/payout actions.

## First External Data-Source Candidates

If external PostgreSQL data-source integration is used from NocoBase, begin
with read-only or low-risk surfaces:

- student directories for admin visibility;
- groups and trainer support lists;
- debtors summary views;
- notification delivery logs;
- payroll read models or reporting views.

Avoid direct write access from NocoBase into:

- ledger tables;
- attendance source tables;
- payment source tables;
- payroll calculation result tables;
- audit tables.

## Recommended Production Shape

### Application Layer

- Django backend as core business service
- NocoBase as admin/configuration platform
- frontend app for role-specific user experiences

### Runtime Layer

- reverse proxy in front of Django and NocoBase
- HTTPS enabled
- managed environment configuration
- isolated secrets for:
  - Django
  - NocoBase
  - PostgreSQL
  - notification providers

### Data Layer

- PostgreSQL with backup/restore procedures
- explicit migration plan for Django and NocoBase separately
- audit-safe retention on financial and attendance records

Use the full-stack backup wrapper for production operations:

```powershell
.\scripts\backup-hybrid.ps1 -PlanOnly
.\scripts\backup-hybrid.ps1 -OutDir C:\SwimCRMRuntime\backups
```

Use `restore-hybrid.ps1 -PlanOnly` before any destructive restore. Restore
requires `-ConfirmRestore` and should only be run after Django, Celery, scheduled
jobs, and NocoBase are stopped.

## Bootstrap Safety Rules

- never treat NocoBase as the source of truth for financial correctness;
- never bypass Django services for ledger, payment confirmation, payroll, or
  audit-sensitive actions;
- prefer NocoBase for configuration before using it for behavior;
- expose only the minimum required data to NocoBase external sources;
- validate all cross-system writes on the Django side.

## Suggested Immediate Next Steps After Bootstrap

1. Create the NocoBase app environment.
2. Add the first low-risk collections.
3. Define role and permission sets in NocoBase for admin-only configuration.
4. Add a read-safe integration path to selected Django-backed data.
5. Build the first admin support screens in NocoBase:
   - operations status
   - notification templates
   - notification rules
   - quiet hours
   - locations/session types
   - payroll schemes
   - payroll period reporting
   - dictionaries/translations
6. Keep all transactional and financial workflows in Django until parity and
   audit safety are proven.
