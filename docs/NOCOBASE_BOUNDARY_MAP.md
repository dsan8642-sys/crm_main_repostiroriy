# NocoBase Boundary Map

## Purpose

This document defines what can be safely managed in NocoBase and what must stay
inside the Django backend.

The goal is to use NocoBase only where it reduces admin overhead without
weakening business correctness.

## Core Rule

NocoBase is optional and supportive.

It must not become the primary source of truth for:

- subscription balance logic;
- attendance deduction logic;
- payment confirmation logic;
- debt calculation;
- payroll calculation;
- audit history;
- quiet-hours delivery behavior.

## Decision Framework

A module is a good NocoBase candidate if all of the following are true:

- it is CRUD-heavy;
- it does not own append-only financial or attendance history;
- incorrect edits would not silently corrupt core business logic;
- it can be validated at the boundary by Django if needed;
- operations staff benefit from editing it without code changes.

A module should stay in Django if any of the following are true:

- it drives money, balance, or payroll calculations;
- it encodes non-trivial domain rules;
- it requires idempotency or deferred execution behavior;
- it is part of audit-sensitive history;
- it needs strong transactional guarantees.

## Keep in Django

### Mandatory Django Source of Truth

- `Subscription`
- `FreezePeriod`
- `SessionLedgerEntry`
- `ManualLedgerAdjustment`
- `AttendanceRecord`
- `AttendanceChangeLog`
- `Charge`
- `Payment`
- `PaymentAllocation`
- `ReceiptMetadata`
- `NotificationDelivery`
- `Consent`
- `PayrollCalculation`
- `PayrollAdjustment`
- `AuditLogEntry`
- `SensitiveActionLog`
- `ClientDataExport`

### Mandatory Django Service Logic

- subscription grace period logic;
- attendance deductions;
- manual session balance adjustment flows;
- payment confirmation and allocation;
- debtors calculation;
- quiet-hours defer-to-next-window behavior;
- payroll engine;
- archive enforcement;
- waitlist promotion logic if it affects core session assignment behavior;
- import commit/rollback flows.

## Good Candidates for NocoBase

### High Confidence

These are strong candidates for NocoBase-backed admin management screens:

- `Location`
- `SessionType`
- `StudentTag`
- `NotificationTemplate`
- `NotificationTemplateTranslation`
- `NotificationRule`
- `QuietHoursPolicy`
- `PayrollScheme`
- `PayrollRule`
- `Language`
- `DictionaryKey`
- `DictionaryTranslation`

Why:

- mostly configuration-driven;
- mostly CRUD;
- admin users benefit from editing them directly;
- mistakes are recoverable if Django still validates downstream behavior.

### Medium Confidence

These can be surfaced in NocoBase only if Django still controls write paths or
critical validations:

- `Group`
- `SubscriptionType`
- `RecurringTemplate`
- `WaitlistEntry`
- `ExportJob`
- `ImportBatch` visibility

Why medium:

- they influence operational behavior more directly;
- invalid edits could affect scheduling, pricing, or reporting.

## Recommended Boundary by Module

### Accounts

Keep in Django:

- users;
- auth;
- parent accounts;
- trainer profiles;
- permissions.

Do not move to NocoBase as source of truth.

### Catalog

Best split:

- Django owns model and validation;
- NocoBase can manage admin CRUD for:
  - locations;
  - session types;
  - selected reference dictionaries.

### Students

Keep core student and family data in Django.

Possible NocoBase use:

- read-only or lightly editable back-office lists;
- tags and categorization.

### Scheduling

Keep core scheduling in Django.

Possible NocoBase use:

- support screens for recurring-template maintenance if validation stays
  backend-side;
- operational dashboards.

Avoid making NocoBase the direct controller of final session state unless Django
services still enforce conflicts and business rules.

### Attendance

Keep fully in Django.

Reason:

- attendance impacts balance and potentially payroll;
- history must remain correct and auditable.

### Subscriptions

Keep fully in Django.

Reason:

- append-only ledger;
- grace period;
- freeze logic;
- manual adjustments;
- audit and balance correctness.

### Billing

Keep fully in Django.

Reason:

- confirmed-payment semantics;
- partial allocations;
- debt calculation;
- immutable financial history.

### Notifications

Split model:

Keep in Django:

- delivery queue;
- scheduling;
- deferred send logic;
- delivery log;
- consent handling.

Possible NocoBase surfaces:

- template editing;
- template translations;
- notification rules;
- quiet-hours policies.

### Payroll

Split model:

Keep in Django:

- calculation engine;
- payroll output;
- adjustments;
- historical payroll records.

Possible NocoBase surfaces:

- payroll schemes;
- rule configuration by session type.

### Localization

Strong NocoBase candidate for editing:

- languages;
- dictionary entries;
- template translations.

Django should still validate required keys and fallback behavior.

### Audit and Compliance

Keep fully in Django.

Reason:

- audit trails should not be editable through low-code admin tools.

## Recommended Integration Style

If NocoBase is introduced, prefer this architecture:

- Django remains the canonical backend and database owner.
- NocoBase is used as an admin/configuration interface over selected tables.
- Critical write actions still go through Django services or validated APIs.
- NocoBase should not directly mutate ledger, payment, payroll, or audit tables
  without backend validation.

## Safe Usage Patterns

### Pattern 1: Config Editor

Use NocoBase for:

- template maintenance;
- quiet-hours configuration;
- payroll rule configuration;
- dictionary translations;
- location metadata.

For guarded config writes, use `/api/nocobase/config/...` with
`NOCOBASE_CONFIG_TOKEN`. Do not reuse the read-only bridge token for write
operations.

Localization config is included in this safe write surface:

- languages;
- dictionary keys;
- dictionary translations;
- notification template translations.

### Pattern 2: Operational Dashboard

Use NocoBase for:

- admin list views;
- filters;
- non-critical cross-entity visibility;
- read-heavy operational reporting shells.

### Pattern 3: Guarded CRUD

If NocoBase edits a model that influences behavior:

- Django should validate the write;
- or the table should have strict DB constraints;
- or the change should flow through a controlled API.

## Anti-Patterns

Do not use NocoBase as the primary place to:

- confirm or reject payments;
- adjust remaining sessions;
- mutate attendance history;
- calculate payroll;
- manage audit logs;
- control final debt balances;
- enforce quiet-hours scheduling behavior.

## Final Boundary Recommendation

### Use NocoBase For

- admin-facing configuration;
- localized content management;
- dictionaries;
- selected CRUD-heavy internal lists;
- low-risk operations dashboards.

### Do Not Use NocoBase For

- financial source of truth;
- attendance source of truth;
- ledger source of truth;
- payroll computation;
- audit storage;
- sensitive history management.

## Rollout Recommendation

If adopted, introduce NocoBase only after the Django domain model and services
are stable enough.

Suggested adoption order:

1. dictionaries and translations;
2. notification templates and rules;
3. quiet-hours policies;
4. payroll scheme configuration;
5. selected admin support screens.

Do not start the project by moving core business logic into NocoBase.
