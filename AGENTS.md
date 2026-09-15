# SwimCRM agent guide

## Read first

1. `README.md` — product and basic commands.
2. `PROJECT_MAP.md` — code ownership and role navigation.
3. `DECISIONS.md` — binding business decisions.
4. The task-specific document linked from `docs/README.md`.

## Architecture boundaries

- Django is the only backend and source of business truth.
- Keep HTTP concerns in `swimcrm/portal/`; keep business rules in the relevant
  domain `services.py`; keep persistence in models and migrations.
- Frontend bootstrap/auth lives in `frontend/src/App.jsx`; URL state and shell
  navigation live in `frontend/src/app/AppShell.jsx`; role/view registration
  lives in `frontend/src/app/runtime.jsx`; pages live in `app/screens/`.
- `design/` is the editable design-system source. `frontend/src/design/` is a
  generated runtime copy. After design changes run
  `scripts\sync-design-frontend.ps1` and `scripts\verify-design-runtime.ps1`.
- `swimcrm/audit/` is application code. Root `audit/` contains local QA
  artifacts and must never be imported by runtime code.

## Change checklist

- Preserve unrelated working-tree changes.
- Add or update tests at the layer where the behavior is guaranteed.
- For API changes update URL/view, OpenAPI, frontend contract/mapper and tests.
- Verify admin, trainer and client visibility when navigation or payloads change.
- Check desktop and mobile layouts for shared UI changes.
- Do not put credentials, production exports or personal data in tracked files.
- Commit, push, release artifact creation and production deployment require
  separate explicit decisions.

## Standard checks

```powershell
cd swimcrm
.\.venv\Scripts\python.exe manage.py test tests --noinput

cd ..\frontend
npm.cmd test
npm.cmd run build
npm.cmd run test:smoke
```

For a release candidate run `scripts\release-check-full.ps1` from the repository
root. A passing local check is not evidence of deployment.

When a module, primary page or route family changes, update `PROJECT_MAP.md` in
the same change.
