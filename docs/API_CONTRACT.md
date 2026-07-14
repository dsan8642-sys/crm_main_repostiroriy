# SwimCRM API contract

Last updated: 2026-07-06

This document is the human-readable companion to:

- `GET /api/admin/api-contract/`
- `swimcrm/portal/contract.py`

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
