# Release Candidate Readiness Snapshot

Generated: 2026-07-19T14:11:16+02:00

## Current Verdict

The project is locally release-candidate ready, but not yet production-ready.

Local backend, frontend, NocoBase hybrid, audit, and operational guard checks
pass. The remaining blockers are release formalization and external production
evidence:

- the working tree is not clean, so a release source archive cannot be built;
- there is no real `docs/PRODUCTION_CUTOVER_EVIDENCE.json`;
- there is no verified GitHub Actions run URL for the final release commit;
- there is no target-host production/staging preflight evidence;
- there is no live hybrid health evidence from the target host;
- there is no production/staging hybrid backup/restore drill evidence.

## Verified Local Gates

- `scripts\verify-ci-release-workflow.cmd` passed.
- `scripts\verify-release-tree.cmd` passed.
- `scripts\verify-frontend-release.cmd` passed:
  - dependency install passed;
  - dependency audit reported `found 0 vulnerabilities`;
  - Vite production build passed;
  - Playwright smoke tests passed, 6/6.
- `scripts\release-check-backend.cmd` passed:
  - SQLite backend tests passed, 231 tests, 1 skipped;
  - production deploy check passed;
  - production environment preflight check passed;
  - release artifact scan passed;
  - API contract docs check passed;
  - CI workflow check passed;
  - operational wrapper guards passed;
  - NocoBase prerequisite/runtime/blueprint/build-pack/API smoke checks passed;
  - production readiness audit passed;
  - hybrid cutover readiness audit passed;
  - backup/restore guards passed.

## Confirmed Local Blocker

`scripts\build-release-source.cmd` currently fails by design:

```text
Release source archive requires a clean git work tree. Commit or stash local changes first.
```

This is expected and correct. The release source archive must be built only from
a clean release commit so the generated manifest, archive checksum, and
production cutover evidence can reference one immutable source state.

## Required Next Steps

1. Review and stage the intended release changes.
2. Create a release commit from the clean source state.
3. Run `scripts\verify-local-release-candidate.cmd`.
4. Before the release commit exists, run
   `scripts\verify-local-release-candidate.cmd -PlanOnly` to inspect dirty
   tree counts, grouped release-review domains, production-critical changed
   paths, branch state, explicit release blockers, and remaining production
   evidence gaps.
5. If diagnosing manually, run `scripts\build-release-source.cmd` and then
   `scripts\verify-release-source-archive.cmd <manifest-path>`.
6. Push the release commit and verify GitHub Actions `release-check` and
   `postgres-backend-check` on that exact commit.
7. Run target-host `scripts\check-production-env.cmd`.
8. Run target-host `scripts\check-hybrid-health.cmd`.
9. Run target-host hybrid backup/restore drill and verify checksum-backed backup
   evidence.
10. Fill `docs\PRODUCTION_CUTOVER_EVIDENCE.json`.
11. Run `scripts\verify-production-cutover-evidence.cmd`.
