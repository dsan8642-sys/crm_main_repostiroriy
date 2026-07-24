# SwimCRM API contract

Last updated: 2026-07-15

This document is the human-readable companion to:

- `GET /api/admin/api-contract/`
- `swimcrm/portal/contract.py`
- `swimcrm/portal/admin_settings_views.py` for the admin settings API
  handlers

The endpoint is admin-only and returns the machine-readable route list, resource fields,
roles and basic request hints.

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
- `GET /api/admin/api-contract/` returns this contract in machine-readable form.

## Validation Notes

- `participant_id` is the preferred public field name. Some old internal paths may still use `student_id`.
- A client can have at most one `is_account_holder=true` participant.
- A schedule session must be either group-based or individual, not both.
- A trainer cannot have overlapping non-cancelled sessions.
- Ledger entries are append-only; use `POST /api/admin/subscriptions/<id>/adjust/` for corrections.
