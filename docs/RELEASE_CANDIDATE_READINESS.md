# Release Candidate Readiness

This document is the stable release-candidate procedure. It intentionally does
not contain a generated timestamp, commit SHA, archive name, archive checksum,
or test count. Those values change on every release commit and must come from
the generated handoff/evidence artifacts:

- `docs\RELEASE_HANDOFF.json`
- `docs\PRODUCTION_CUTOVER_EVIDENCE.draft.json`
- `releases\swimcrm-release-<short-sha>.manifest.json`

## Verdict

The project can be treated as a local release candidate only when all local
gates below pass from a clean Git worktree.

It is production-ready only after the external evidence gates are also captured
in `docs\PRODUCTION_CUTOVER_EVIDENCE.json` and verified.

## Local Release Candidate Gate

Run this from the repository root after committing the intended release state:

```powershell
.\scripts\verify-local-release-candidate.cmd -ForceArtifactOverwrite
```

The local gate must:

- require a clean Git worktree;
- run backend tests and production deploy checks;
- run production environment guard checks with safe synthetic values;
- validate API contract docs and CI workflow structure;
- validate operational wrappers;
- validate NocoBase prerequisites, runtime guards, first-screen blueprint, and
  screen build pack;
- run the NocoBase API build-pack smoke suite;
- run production readiness and hybrid cutover audits;
- run backup/restore guard checks;
- run frontend dependency install, dependency audit, production build, and
  Playwright smoke tests;
- build a source archive from `git archive HEAD`;
- verify the release archive manifest and SHA256 checksum.

The command prints the current release commit SHA and archive SHA256. Do not
copy older values from this document.

## Handoff Gate

After the local release candidate gate passes, create and verify the generated
handoff:

```powershell
.\scripts\new-production-cutover-evidence.cmd -Force -LocalBackendPassed -LocalFullStackPassed -ReleaseArchivePassed -ArchiveSha256 <sha256> -ArchiveManifest releases\swimcrm-release-<short-sha>.manifest.json
.\scripts\new-release-handoff.cmd -Force
.\scripts\verify-release-handoff.cmd
```

The handoff verifier confirms that:

- `docs\RELEASE_HANDOFF.json` matches the current `HEAD`;
- the release archive manifest matches the current `HEAD`;
- the handoff archive SHA256 matches the manifest and archive file;
- release blockers and Git remote state match the current release plan;
- the external cutover action list is still present.

## External Production Evidence

Production approval requires evidence that cannot be invented locally:

- Git remote configured and release branch pushed;
- GitHub Actions `release-check` run URL for the exact release commit;
- GitHub Actions `postgres-backend-check` run URL for the exact release commit;
- target-host `scripts\check-production-env.cmd` output with real production
  environment variables;
- target-host `scripts\check-hybrid-health.cmd` output proving Django,
  NocoBase bridge/config APIs, ops status, and NocoBase process health;
- target-host hybrid backup/restore drill evidence with checksum-backed backup
  verification;
- rollback plan acknowledgement.

Fill `docs\PRODUCTION_CUTOVER_EVIDENCE.json` only after collecting real
external evidence:

```powershell
.\scripts\verify-production-cutover-evidence.cmd
.\scripts\verify-local-release-candidate.cmd -RequireProductionEvidence
```

## Plan-Only Check

Use this when you need a fast status without long checks:

```powershell
.\scripts\verify-local-release-candidate.cmd -PlanOnly
```

The plan reports:

- clean/dirty Git state;
- branch and detached-HEAD state;
- configured Git remotes;
- grouped release-review domains;
- production-critical changed paths;
- whether production cutover evidence exists;
- explicit remaining release blockers.

## Rule Of Thumb

- If `verify-local-release-candidate.cmd` passes without
  `-RequireProductionEvidence`, the project is locally release-candidate ready.
- If `verify-release-handoff.cmd` passes, the release handoff is fresh for the
  current commit/archive.
- If `verify-local-release-candidate.cmd -RequireProductionEvidence` passes,
  the project has the repository evidence required for production approval.
