# SwimCRM API contract

Last updated: 2026-07-26

This document is the human-readable companion to:

- `GET /api/openapi.json`
- `GET /api/admin/api-contract/` (authenticated compatibility endpoint)
- `swimcrm/portal/openapi.py`
- `swimcrm/portal/admin_settings_views.py` for the admin settings API
  handlers

The public OpenAPI endpoint is the canonical machine-readable route and method
contract. The authenticated compatibility endpoint returns the same schema.

## Conventions

- Auth: Django session auth.
- Errors: API errors return JSON: `{"error": ...}`.
- Dates: `YYYY-MM-DD`.
- Datetimes: ISO 8601 with timezone, for example `2026-06-01T17:00:00+02:00`.
- Money: backend stores minor units in `amount_minor`, for example `24000` = `240,00 PLN`.
- Public terminology is `client` and `participant`.
- Internal legacy model names may still contain `ParentAccount` or `Student`.

## Roles

| Role | Prefix |
|---|---|
| Client | `/api/client/` |
| Trainer | `/api/trainer/` |
| Admin | `/api/admin/` |

## Health and Readiness

- `GET /api/health/` is a public liveness endpoint for uptime checks. It does
  not touch business data or expose operational details.
- `GET /api/admin/readiness/` is admin-only and returns production readiness
  checks for the Django backend: database connectivity, pending migrations,
  writable `MEDIA_ROOT`, runtime path placement, and default language.
- `GET /api/admin/ops-status/` is admin-only and returns operational backlog
  signals: notification queue health, failed sends, receipt cleanup backlog,
  Celery beat schedule, and redacted worker configuration.

## Admin Settings API

The admin settings API exposes low-risk reference configuration surfaces that
are edited from the SwimCRM admin UI Settings screen. All endpoints require an
authenticated administrator session; there is no separate bridge or config
token.

Supported write surfaces:

- `GET|POST /api/admin/settings/locations/`
- `GET|PATCH|PUT|DELETE /api/admin/settings/locations/<id>/`
- `GET|POST /api/admin/settings/session-types/`
- `GET|PATCH|PUT|DELETE /api/admin/settings/session-types/<id>/`
- `POST /api/admin/settings/session-types/split/restore/`
- `GET|POST /api/admin/settings/languages/`
- `GET|PATCH|PUT|DELETE /api/admin/settings/languages/<id>/`
- `GET|POST /api/admin/settings/dictionary-keys/`
- `GET|PATCH|PUT|DELETE /api/admin/settings/dictionary-keys/<id>/`
- `GET|POST /api/admin/settings/dictionary-translations/`
- `GET|PATCH|PUT|DELETE /api/admin/settings/dictionary-translations/<id>/`
- `GET|POST /api/admin/settings/notification-template-translations/`
- `GET|PATCH|PUT|DELETE /api/admin/settings/notification-template-translations/<id>/`

Notification templates/rules, quiet hours, and payroll schemes/rules/assignments
are managed through their dedicated `/api/admin/notifications/` and
`/api/admin/payroll/` endpoints. All settings writes still pass through Django
model validation, and none of them can touch payment confirmation, ledger,
attendance mutation, payroll period calculation, audit logs, or receipt files.

Settings query validation:

- `/api/admin/settings/notification-template-translations/`: `template_id`
  must be an integer when provided, and `language_code` filters case-insensitively.
- `/api/admin/settings/dictionary-translations/`: `language_code` filters
  case-insensitively and `domain` filters by dictionary key domain.
- Invalid settings filters return JSON `400` errors and do not mutate data.

## Admin Import API

Imports use a server-owned two-phase batch:

- Standard kinds are `trainers`, `groups`, `clients`, `payments`, and
  `attendance`. Every kind also exists in the standard CSV/XLSX export registry.
- `POST /api/admin/import/<kind>/preview/` accepts a CSV/XLSX file plus optional
  JSON `mapping`. It returns `batch_id`, `expires_at`, schema metadata, proposed
  mapping, source examples, required/unused columns, file fingerprint warning,
  per-row stable key/status/errors/warnings/action and editable field metadata.
- Own SwimCRM exports are recognized through `schema_version`, `exported_at`,
  `source_system`, and `entity_type`; unsupported or inconsistent metadata is
  rejected. External files use the same alias registry and may override mapping.
- `PATCH /api/admin/import/<kind>/<batch_id>/rows/<row_index>/` changes only
  contract-approved `data`, relation overrides, or the row exclusion flag.
  Consecutive patches merge with existing manual corrections; changing a relation
  never discards an earlier data edit (and vice versa).
- `POST /api/admin/import/<kind>/<batch_id>/rows/bulk/` applies the same checked
  patch to explicit source-row indices. Protected fields cannot be edited.
- `GET /api/admin/import/client-search/?q=...` searches clients for manual
  payment/attendance assignment. A manual choice is retained during every later
  server revalidation.
- `POST /api/admin/import/<kind>/commit/` accepts only `batch_id` and
  `selected_indices`, plus the documented payment/attendance confirmations.
- Preview batches expire after 30 minutes, belong to the administrator who
  created them, and can be committed once.
- Commit rebuilds and validates the preview from server-held source data inside
  a database transaction. Browser-supplied `rows`, `status`, `data`, or
  `resolved` fields are rejected.
- Server-held source rows are removed from the batch after a successful commit.
- Batch results retain the file hash, source/schema, mode, mapping, manual
  corrections, counts, created/updated IDs, rollback strategy, and sanitized
  row report. The initiating administrator can download that report at
  `GET /api/admin/import/batches/<batch_id>/report/csv|xlsx/`.
- `groups` preview additionally accepts
  `import_mode=create_only|update_existing|upsert`. The default is
  `create_only`; update rows include an old-to-new diff.
- Client and group batches have explicit, dependency-aware rollback endpoints.
  Group rollback deletes only unchanged records created by that batch and
  restores updated groups only when their post-import snapshot is unchanged.
  Payments and attendance remain immutable; their batch exposes the required
  auditable compensating strategy instead of deleting history.
- Attendance preview accepts `effect_mode=history_only|apply_financial`; the
  default is `history_only`.
- `history_only` creates immutable attendance history without changing
  subscription balances or creating visit charges. This policy remains attached
  to the attendance record during later status corrections.
- `apply_financial` is stored in the server-owned batch and commit additionally
  requires `confirm_financial_effects=true`. The committed mode, result, and
  acting administrator are recorded in the audit log.
- Import/export payloads never contain role, permission, password, OTP, direct
  balance, or other privilege fields. Payments and attendance are committed
  through existing domain services, not direct balance writes.

Notification delivery chooses `NotificationTemplateTranslation` by
`ParentAccount.preferred_language`, then falls back to the default language and
finally to the base template.

## Core Admin Flow

### Create Adult Client

`POST /api/admin/clients/`

```json
{
  "client_type": "adult",
  "account": {
    "username": "anna.nowak",
    "first_name": "Anna",
    "last_name": "Nowak",
    "email": "anna@example.com",
    "phone": "+48555111111"
  }
}
```

Creates a client account and an account-holder participant with `is_account_holder=true`.

### Create Family Client

`POST /api/admin/clients/`

```json
{
  "client_type": "family",
  "account": {
    "username": "family.kowalski",
    "first_name": "Marta",
    "last_name": "Kowalska",
    "email": "family@example.com",
    "phone": "+48555222222"
  },
  "participant": {
    "first_name": "Jan",
    "last_name": "Kowalski",
    "birth_date": "2016-05-10",
    "group_id": 1
  }
}
```

### Create Subscription With Charge

`POST /api/admin/participants/<id>/subscriptions/`

```json
{
  "subscription_type_id": 1,
  "start_date": "2026-07-06",
  "create_charge": true,
  "due_date": "2026-07-06"
}
```

Creates the subscription, posts the initial ledger entry, and optionally creates a charge.

### Create Payment

`POST /api/admin/payments/`

```json
{
  "participant_id": 1,
  "amount_minor": 24000,
  "currency": "PLN",
  "paid_at": "2026-07-06",
  "method": "cash"
}
```

Admin-created payments are confirmed by default. Pass `"status": "pending"` to keep them pending.

### Create Schedule Session

`POST /api/admin/schedule/sessions/`

```json
{
  "group_id": 1,
  "trainer_id": 1,
  "start_at": "2026-07-06T17:00:00+02:00",
  "end_at": "2026-07-06T18:00:00+02:00",
  "location": "Pool A",
  "max_participants": 8
}
```

Trainer overlap is checked by the scheduling service before the session is saved.
Admins may later set `"substitute_trainer_id"` on a concrete session. The
response keeps `"trainer_id"` as the originally scheduled trainer and exposes
`"effective_trainer_id"` as the trainer used for delivery/payroll.

### Check Trainer Conflict

`POST /api/admin/schedule/check-conflict/`

```json
{
  "trainer_id": 1,
  "start_at": "2026-07-06T17:30:00+02:00",
  "end_at": "2026-07-06T18:30:00+02:00",
  "exclude_session_id": 10
}
```

Returns:

```json
{
  "has_conflict": true,
  "error": ["..."]
}
```

or:

```json
{
  "has_conflict": false
}
```

### Configure Quiet Hours

`POST /api/admin/notifications/quiet-hours/`

```json
{
  "channel": "email",
  "starts_at": "22:00",
  "ends_at": "08:00",
  "timezone": "Europe/Warsaw"
}
```

Messages due inside a matching quiet-hours window are stored as `deferred` and
rescheduled to the nearest allowed delivery time by the Django notification
service.

### Configure Payroll Rules

`POST /api/admin/payroll/schemes/`

```json
{
  "name": "Default payroll",
  "location": "Pool A"
}
```

`POST /api/admin/payroll/rules/`

```json
{
  "scheme_id": 1,
  "session_type": "group",
  "rule_type": "group",
  "base_amount_minor": 10000,
  "currency": "PLN",
  "min_clients_threshold": 2,
  "extra_client_amount_minor": 1500
}
```

For `individual` and `split`, use fixed rules:

```json
{
  "scheme_id": 1,
  "session_type": "split",
  "rule_type": "split",
  "base_amount_minor": 9000,
  "currency": "PLN"
}
```

Assign a scheme to a trainer:

`POST /api/admin/payroll/assignments/`

```json
{
  "trainer_id": 1,
  "scheme_id": 1,
  "effective_from": "2026-07-01"
}
```

Calculate a payroll period:

`POST /api/admin/payroll/periods/`

```json
{
  "date_from": "2026-07-01",
  "date_to": "2026-07-31",
  "location": "Pool A"
}
```

Payroll calculations are produced by Django and are reproducible for the same
period. Schemes and rules are managed through the admin payroll endpoints, but
payroll calculation results remain Django-owned.

## Frontend Support Endpoints

- `GET /api/admin/reference/` returns active trainers, groups, subscription types,
  participant search results, and enum choices for forms.
- `GET /api/admin/dashboard/` returns fast aggregate metrics for the admin dashboard.
- `GET /api/openapi.json` and `GET /api/admin/api-contract/` return the canonical
  OpenAPI 3.1 contract.

## Validation Notes

- `participant_id` is the preferred public field name. Some old internal paths may still use `student_id`.
- A client can have at most one `is_account_holder=true` participant.
- A schedule session must be either group-based or individual, not both.
- A trainer cannot have overlapping non-cancelled sessions.
- Ledger entries are append-only; use `POST /api/admin/subscriptions/<id>/adjust/` for corrections.
