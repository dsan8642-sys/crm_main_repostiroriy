# Implementation Roadmap

## Purpose

This document translates `CRM_CORE_SPEC.md` into an execution-oriented roadmap.
It is intended for planning delivery, splitting work into phases, and tracking
dependencies across architecture, backend, frontend, and operations work.

## Delivery Principles

- Keep Django as the system of record.
- Implement core business rules before convenience features.
- Prefer append-only and auditable flows for financial and attendance logic.
- Build admin workflows before client-facing polish.
- Avoid moving critical logic into low-code tooling.
- Treat multilingual and multi-location support as first-class, not as a late
  patch.

## Phase 0: Architecture Lock

### Goal

Finalize the operational baseline before active feature implementation.

### Deliverables

- approved `CRM_CORE_SPEC.md`;
- approved data model baseline;
- approved role and permissions matrix;
- approved module boundaries between Django and optional NocoBase surfaces;
- approved environment strategy for local, staging, and production.

### Key Tasks

- freeze business rules that are already known;
- resolve open questions that block schema design;
- define naming conventions for entities and statuses;
- define API strategy for admin, parent, and trainer flows;
- define logging, audit, and retention rules.

### Dependencies

- product decisions;
- operational constraints;
- hosting assumptions.

### Exit Criteria

- no unresolved questions that block schema or service design;
- one agreed source-of-truth architecture.

## Phase 1: Data Model and Domain Services

### Goal

Build the reliable backend foundation.

### Deliverables

- Django models for core entities;
- migrations for PostgreSQL;
- service-layer domain logic for scheduling, subscriptions, billing,
  notifications, and payroll foundations;
- audit logging for sensitive and financial actions.

### Key Tasks

- implement identity and role models;
- implement locations, groups, session types, and subscription types;
- implement students, parent accounts, emergency contacts, and tags;
- implement sessions, participants, waitlist, reschedule, and cancellation logs;
- implement attendance and attendance history;
- implement subscriptions, freeze periods, and append-only session ledger;
- implement charges, payments, payment allocation, and receipt metadata;
- implement notification templates, rules, quiet hours, and delivery log;
- implement payroll scheme and payroll rule models;
- implement archive flags on major business entities.

### Dependencies

- phase 0 signoff;
- final status dictionaries;
- agreement on grace period and ledger semantics.

### Risks

- schema churn from unresolved business rules;
- overloading models with UI concerns too early.

### Exit Criteria

- migrations apply cleanly;
- core models and service contracts are stable enough for feature work.

## Phase 2: Admin Core Workflows

### Goal

Make the system usable for internal operations.

### Deliverables

- admin workflows for families, students, groups, sessions, attendance,
  subscriptions, charges, payments, and notifications;
- archive/read-only flows;
- import/export baseline;
- debtors and operational dashboard basics.

### Key Tasks

- build create/edit flows for parent accounts and students;
- build session scheduling and session management flows;
- build attendance marking flows;
- build subscription creation, freeze, and adjustment flows;
- build charge creation and payment confirmation flows;
- build notification template and rule management flows;
- build quiet hours configuration UI;
- build debtors and upcoming-expiry admin views;
- build archive actions for supported entities.

### Dependencies

- phase 1 data model and service layer;
- permissions matrix.

### Risks

- admin UI attempts to bypass service-layer rules;
- weak audit coverage on manual actions.

### Exit Criteria

- an admin can operate the business without direct DB intervention;
- all critical admin actions go through logged backend flows.

## Phase 3: Parent and Trainer Portals

### Goal

Deliver role-specific daily-use interfaces.

### Deliverables

- parent portal;
- trainer portal;
- access rules enforced through API and UI;
- multilingual content rendering.

### Parent Portal Scope

- view own children only;
- view schedule;
- view attendance;
- view payments and subscription state;
- view remaining sessions and grace period;
- optionally upload payment proof metadata flow if retained in scope.

### Trainer Portal Scope

- view own sessions;
- view own groups;
- mark attendance;
- view only operational data relevant to teaching;
- no access to client finances.

### Dependencies

- phase 2 admin flows;
- stable API contracts;
- localization support.

### Risks

- leaking financial or unrelated client data through permissive endpoints;
- mixing role-specific logic into frontend only.

### Exit Criteria

- parent and trainer can complete their core workflows without admin help;
- role restrictions are enforced backend-side.

## Phase 4: Notifications and Automation

### Goal

Make the system operationally efficient.

### Deliverables

- scheduled reminders;
- deferred sending for quiet hours;
- multilingual notification rendering;
- retry-safe delivery log;
- event-driven and scheduled notification behavior.

### Key Tasks

- wire payment reminders;
- wire upcoming-expiry reminders;
- wire schedule change notifications;
- implement quiet hours deferral logic;
- implement idempotent message scheduling and retry handling;
- allow location-aware notification configuration.

### Dependencies

- phase 1 notification model;
- phase 3 role-aware user data access.

### Risks

- duplicate sends;
- quiet hours logic conflicting with user timezone assumptions;
- localization mismatch between user and template.

### Exit Criteria

- delivery logs show predictable, auditable message scheduling behavior;
- no night sending when quiet hours forbid it.

## Phase 5: Payroll Engine

### Goal

Support operational payroll calculations for trainers.

### Deliverables

- payroll schemes;
- session-type payroll rules;
- payroll period calculation;
- adjustments and exports;
- admin payroll review interface.

### Key Tasks

- implement rules by session type;
- implement group-session minimum threshold and extra-client payouts;
- implement fixed rules for `individual` and `split`;
- handle substitute trainer attribution;
- handle cancelled/rescheduled session policy once finalized;
- generate payroll calculations by period;
- support manual payroll adjustments.

### Dependencies

- sessions, attendance, and trainer assignments;
- resolved payroll rules for substitutions and cancellations.

### Risks

- payroll ambiguity around trainer replacement and split attendance;
- retroactive scheme changes affecting past calculations.

### Exit Criteria

- admin can generate trainer payroll per period from system data;
- payroll calculations are reproducible and auditable.

## Phase 6: Reporting, Import, and Operational Maturity

### Goal

Improve maintainability and business visibility.

### Deliverables

- financial and attendance reporting;
- payroll reporting;
- import/export tools;
- archive and data export support;
- production operations readiness.

### Key Tasks

- implement revenue and debt reports;
- implement attendance reports;
- implement payroll summaries and exports;
- implement import preview and rollback-safe commit;
- implement client data export for sensitive-data workflows;
- define backup, restore, and release procedures for the full stack.

### Dependencies

- stable business data;
- phase 5 payroll outputs.

### Risks

- reporting built on inconsistent intermediate logic;
- operational workflows missing from documentation.

### Exit Criteria

- ops/admin can run reporting and routine maintenance safely;
- release and recovery procedures are documented and repeatable.

## Suggested Workstreams

### Backend

- domain models;
- migrations;
- service layer;
- permissions;
- scheduled jobs;
- payroll engine;
- reporting queries.

### Frontend

- admin flows;
- parent portal;
- trainer portal;
- localization-aware UI;
- archive/read-only presentation.

### Operations

- environment setup;
- secrets and runtime config;
- backups and restore drills;
- release checks;
- monitoring and logs.

### Product and QA

- acceptance criteria by phase;
- edge-case test cases for ledger, payments, quiet hours, and payroll;
- regression matrix for roles and permissions.

## Recommended Implementation Order Inside MVP

1. identity and roles;
2. locations, groups, and session types;
3. parent accounts and students;
4. sessions and attendance;
5. subscriptions and ledger;
6. charges and payments;
7. admin workflows;
8. parent portal;
9. trainer portal;
10. notifications and quiet hours;
11. debtors and dashboard;
12. archive/read-only flows.

## MVP Exit Definition

MVP is complete when:

- admin can run the business using the system;
- parent can view their child data and payment/subscription state;
- trainer can manage attendance for their sessions;
- subscription balance and grace-period logic are correct;
- payments affect balances only when confirmed;
- quiet hours defer restricted notifications;
- audit logging exists for financial and sensitive flows;
- multi-location and multilingual foundations are present.
