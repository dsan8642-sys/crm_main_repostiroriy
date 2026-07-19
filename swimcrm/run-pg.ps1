# Run manage.py against the local PostgreSQL dev database.
# On PostgreSQL the trainer-overlap GIST exclusion constraint is active
# (scheduling migration 0002) — SQLite can't enforce it. Dev-only credentials.
#
# Usage:
#   .\run-pg.ps1 migrate
#   .\run-pg.ps1 runserver 127.0.0.1:8000
#   .\run-pg.ps1 test tests
$env:POSTGRES_DB       = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "swimcrm" })
$env:POSTGRES_USER     = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" })
$env:POSTGRES_PASSWORD = $(if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "postgres" })
$env:POSTGRES_HOST     = $(if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "127.0.0.1" })
$env:POSTGRES_PORT     = $(if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" })
$env:PYTHONIOENCODING  = "utf-8"
& "$PSScriptRoot\.venv\Scripts\python.exe" "$PSScriptRoot\manage.py" @args
