# Legacy H2O migration runbook

This is a one-off production operation. It does not use the normal UI import and does not change public APIs or database schema.

## Files

- Approved source workbook: `migration_approval_final.xlsx`
- Stable-ID mapping JSON: `production-mapping-candidates.json`
- Final approved balance JSON: `final-balance-review.json`
- Generated immutable manifest: `manifest.json`
- Dry-run, commit, backup, restore-check and reconciliation reports are stored outside the release tree.

## Hard gates

1. All 293 approved legacy rows have a stable `Student.id`, or an explicitly approved alias to one canonical legacy ID.
2. Legacy IDs `603302` and `605680` are the only excluded legacy profiles.
3. Duda Aleksander and Duda Jakub are separate `CREATE` rows with separate new family accounts.
4. Every final balance row is approved; partial PLN is archive-only and never rounded into the migration.
5. The target database still contains every mapped `Student.id`, and every current session total equals the approved review value.
6. The source workbook and target snapshot SHA-256 values match.

The manifest builder fails closed if any gate is incomplete:

```powershell
python manage.py seal_legacy_migration_manifest `
  --source-workbook C:\migration\migration_approval_final.xlsx `
  --mapping-json C:\migration\production-mapping-candidates.json `
  --balance-review-json C:\migration\final-balance-review.json `
  --run-id legacy-h2o-2026-08-09 `
  --output C:\migration\manifest.json
```

Run this only after copying the approved inputs to the isolated rehearsal database or production window. It reads the live target state, embeds its SHA-256 in the manifest, and fails if a mapped identity or approved balance has drifted. The sealed manifest must never be edited afterwards.

## Dry-run

```powershell
python manage.py import_legacy_migration `
  --dry-run `
  --manifest C:\migration\manifest.json `
  --source-workbook C:\migration\migration_approval_final.xlsx `
  --actor-id 1 `
  --report C:\migration\dry-run-report.json
```

No database row is created by dry-run. Any identity, balance, workbook hash, target snapshot, exclusion, duplicate target, approval or PLN mismatch aborts validation.

## Commit

Compute the canonical manifest SHA-256 printed by dry-run and pass the exact confirmation string:

```powershell
python manage.py import_legacy_migration `
  --commit `
  --manifest C:\migration\manifest.json `
  --source-workbook C:\migration\migration_approval_final.xlsx `
  --actor-id 1 `
  --run-id legacy-h2o-2026-08-09 `
  --confirm "COMMIT legacy-h2o-2026-08-09 <manifest_sha256>" `
  --report C:\migration\commit-report.json
```

The commit runs in one `transaction.atomic()` block. It never edits or deletes payments, attendance, charges, groups or existing ledger entries. It appends at most one manual balance correction per affected participant and records one immutable run marker. A repeated run of the same manifest reports zero operations; reuse of the run ID with different content is rejected.

## Production sequence

1. Deploy and test the release without running the import.
2. Restore a fresh production backup to an isolated database; build the manifest, dry-run, commit and reconcile there.
3. During the production window stop Django writers, keep PostgreSQL and Caddy running, create a fresh backup and verify restoration.
4. Build a fresh snapshot-backed manifest, repeat dry-run, then execute one commit.
5. Start Django and smoke-test existing/new participants, positive/negative balances and protected history.
6. Before reopening CRM, restore the pre-run backup if reconciliation fails. After reopening, restore requires a new writer stop and separate approval because later user actions would be lost.
