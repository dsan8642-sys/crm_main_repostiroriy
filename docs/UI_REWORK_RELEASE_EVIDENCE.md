# UI rework release evidence

Дата cutover: 2026-07-21 (Europe/Warsaw).

## Идентификация релиза

- Ветка: `codex/hybrid-admin-release-candidate`.
- Production application commit: `10e8022f68fa7250ae48fe33d12defb2c931e1ed`.
- Release archive: `swimcrm-release-10e8022f68fa.zip`.
- Archive SHA-256: `f7a2ea5e67b1439a7c354107a9a93f23f4905c244f34af285272efc8291647ee`.
- Tracked files: `452`.
- Tracked file list SHA-256: `8abe20ee79081c77dd655e661a1da9473598fc192e4e715006c91ec97f0fde2b`.
- Production release directory: `C:\SwimCRM\releases\swimcrm-release-10e8022f68fa`.

## Automated checks

- GitHub Actions run: https://github.com/dsan8642-sys/crm_main_repostiroriy/actions/runs/29867167130
- `release-check`: success, job `88758162529`.
- `postgres-backend-check`: success, job `88758162446`.
- Backend locally: `273` tests passed, `1` skipped.
- Operations readiness locally: `62` tests passed.
- Frontend production build: success.
- Frontend Playwright: `10/10` passed across desktop and mobile projects.
- Isolated target-host backend on port `18000`: `/api/health/` returned HTTP `200`.

## Backup and restore

- Pre-cutover backup directory: `C:\SwimCRM\backups\pre-c1a3294-20260721-215610`.
- PostgreSQL dump: `swimcrm.dump`, `184896` bytes.
- Dump SHA-256: `77C9EAC7A8EE459A5E8C487B866B373532986C1B0C2D088D8DE7DCEED424B01C`.
- `pg_restore --list`: success, `453` lines.
- Restore drill: dump restored into a separate temporary PostgreSQL database.
- Restore verification: `50` public tables found.
- Temporary restore database was removed after verification.
- Previous release and pre-cutover Caddy/Django runner files remain available for rollback.

## Production checks

- Public URL: https://crm.200-234-237-144.sslip.io/
- HTTPS root: HTTP `200`.
- HTTPS `/api/health/`: HTTP `200`, backend status `ok`.
- New production JS asset `index-DHBoChRh.js`: HTTP `200`.
- Live desktop render: SwimCRM login screen loaded without blank shell.
- Live mobile viewport `390x844`: login screen loaded correctly.
- Browser console errors after live load: `0`.
- Services after cutover: Django running, Caddy running, PostgreSQL running.
- Django NSSM `AppDirectory` points to the production release above.
- Внешние low-code UI-сервисы: `0`; активный интерфейс построен только на собственном frontend.
- Django stderr after restart contains only the normal Waitress startup message.

## Scope note

Production credentials were not changed and no hidden test administrator was created. Authenticated UI flows are covered by the desktop/mobile Playwright suite and backend tests; live smoke verifies the deployed shell, HTTPS routing, backend health, static assets and responsive login screen.
