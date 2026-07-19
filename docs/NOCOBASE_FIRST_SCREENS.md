# NocoBase First Screens Blueprint

This document turns the hybrid boundary into the first practical NocoBase admin
screens. The source of truth is `docs/NOCOBASE_FIRST_SCREENS.json`; this file is
the human-readable companion.

The operator build pack is `docs/NOCOBASE_SCREEN_BUILD_PACK.json`. It maps each
approved screen to NocoBase routes, data sources, blocks, allowed actions, and
roles. The build pack is intentionally not a full NocoBase export; it is the
repeatable assembly contract for configuring the first screens without
guesswork.

## Rule

Build the first NocoBase pages only from Django bridge/config APIs:

- read-only data uses `NOCOBASE_BRIDGE_TOKEN`;
- guarded configuration writes use `NOCOBASE_CONFIG_TOKEN`;
- direct SQL/table editing is not allowed for payments, ledger, attendance,
  receipts, audit history, payroll calculations, or notification delivery logs.

## Phase 1 Screens

### Operations Status

- Endpoint: `GET /api/nocobase/ops-status/`
- Token: `NOCOBASE_BRIDGE_TOKEN`
- Mode: read-only
- Purpose: show queue health, failed notifications, receipt cleanup backlog,
  Celery beat status, and `ok/warning/critical`.

### Client Directory

- Endpoint: `GET /api/nocobase/clients/?q=&active=true&limit=200`
- Token: `NOCOBASE_BRIDGE_TOKEN`
- Mode: read-only
- Purpose: show participant, parent contact, balance, latest payment summary,
  and active subscription summary without medical notes, receipt files, or
  payment comments.

### Debtors

- Endpoint: `GET /api/nocobase/debtors/`
- Token: `NOCOBASE_BRIDGE_TOKEN`
- Mode: read-only
- Purpose: monitor debtors from Django billing service output.

### Quiet Hours

- Endpoints: `/api/nocobase/config/quiet-hours/...`
- Token: `NOCOBASE_CONFIG_TOKEN`
- Mode: guarded config
- Purpose: manage notification quiet-hours windows through Django validation.

### Notification Templates and Rules

- Endpoints:
  - `/api/nocobase/config/notification-templates/...`
  - `/api/nocobase/config/notification-rules/...`
- Token: `NOCOBASE_CONFIG_TOKEN`
- Mode: guarded config
- Purpose: manage base notification message templates and scheduling offsets
  through Django validation. Delivery logs, retry actions, provider message IDs,
  and deduplication keys remain Django-controlled.

### Locations and Session Types

- Endpoints:
  - `/api/nocobase/config/locations/...`
  - `/api/nocobase/config/session-types/...`
- Token: `NOCOBASE_CONFIG_TOKEN`
- Mode: guarded config
- Purpose: manage operational location and supported session-type dictionaries
  for admin UI, payroll setup, and future schedule dropdowns. Existing session
  history, attendance, and payroll calculation results are not mutated from
  NocoBase.

### Payroll Rules

- Endpoints:
  - `/api/nocobase/config/payroll/schemes/...`
  - `/api/nocobase/config/payroll/rules/...`
  - `/api/nocobase/config/payroll/assignments/`
- Token: `NOCOBASE_CONFIG_TOKEN`
- Mode: guarded config
- Purpose: configure schemes, rule formulas, and trainer assignments. Payroll
  calculation results remain Django-controlled.

### Payroll Periods Reporting

- Endpoints:
  - `GET /api/nocobase/payroll/periods/`
  - `GET /api/nocobase/payroll/periods/<id>/`
- Token: `NOCOBASE_BRIDGE_TOKEN`
- Mode: read-only
- Purpose: show payroll periods, trainer totals, and calculation lines generated
  by Django. NocoBase cannot create, recalculate, approve, export, or pay payroll
  periods.

### Localization

- Endpoints:
  - `/api/nocobase/config/languages/...`
  - `/api/nocobase/config/dictionary-keys/...`
  - `/api/nocobase/config/dictionary-translations/...`
  - `/api/nocobase/config/notification-template-translations/...`
- Token: `NOCOBASE_CONFIG_TOKEN`
- Mode: guarded config
- Purpose: manage interface labels, dictionaries, notification template
  translations, and language availability.

## Deferred Screens

Do not build these as direct NocoBase editors yet:

- payroll period calculation, approval, export, or payout actions;
- any payment, ledger, attendance, receipt, or audit editor.

These require either a new guarded Django API or an explicit boundary decision
before NocoBase can manage them.

## Verification

Run:

```powershell
.\scripts\verify-nocobase-blueprint.cmd
.\scripts\verify-nocobase-build-pack.cmd
.\scripts\verify-nocobase-api-smoke.cmd
```

The verifier checks that every endpoint referenced by the blueprint exists in
the Django API contract and has a matching response schema in
`swimcrm/portal/nocobase_contract.py`. This keeps the NocoBase screen blueprint
aligned with the JSON keys Django is allowed to expose, including sensitive-field
exclusions.

The build-pack verifier checks that every approved screen has an assembly plan,
that all data sources match the blueprint endpoints and tokens, and that
read-only screens do not accidentally gain write actions.

The API smoke verifier executes focused Django tests for the NocoBase
bridge/config layer and confirms that build-pack list data sources still return
responses matching `swimcrm/portal/nocobase_contract.py`.
