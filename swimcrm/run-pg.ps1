# Run manage.py against the local PostgreSQL dev database.
# On PostgreSQL the trainer-overlap GIST exclusion constraint is active
# (scheduling migration 0002) — SQLite can't enforce it. Dev-only credentials.
#
# Usage:
#   .\run-pg.ps1 migrate
#   .\run-pg.ps1 runserver 127.0.0.1:8000
#   .\run-pg.ps1 test tests
$env:POSTGRES_DB       = "swimcrm"
$env:POSTGRES_USER     = "postgres"
$env:POSTGRES_PASSWORD = "postgres"
$env:POSTGRES_HOST     = "127.0.0.1"
$env:POSTGRES_PORT     = "5432"
$env:PYTHONIOENCODING  = "utf-8"
& "$PSScriptRoot\.venv\Scripts\python.exe" "$PSScriptRoot\manage.py" @args