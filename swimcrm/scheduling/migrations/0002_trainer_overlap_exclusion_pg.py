"""Rule 5 (DB-level, race-safe): a trainer cannot overlap in time.

PostgreSQL enforces this with a GIST exclusion constraint over
(trainer_id, tstzrange(start_at, end_at)) among non-cancelled sessions.
On SQLite (local/dev/tests) this is a no-op; the application-level check in
scheduling.services.check_trainer_conflict still applies everywhere.
"""
from django.db import migrations


PG_UP = [
    "CREATE EXTENSION IF NOT EXISTS btree_gist;",
    """
    ALTER TABLE scheduling_session
    ADD CONSTRAINT excl_trainer_time_overlap
    EXCLUDE USING gist (
        trainer_id WITH =,
        tstzrange(start_at, end_at) WITH &&
    ) WHERE (is_cancelled = false);
    """,
]
PG_DOWN = [
    "ALTER TABLE scheduling_session DROP CONSTRAINT IF EXISTS excl_trainer_time_overlap;",
]


def apply_pg(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    for sql in PG_UP:
        schema_editor.execute(sql)


def revert_pg(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    for sql in PG_DOWN:
        schema_editor.execute(sql)


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0001_initial")]
    operations = [migrations.RunPython(apply_pg, revert_pg)]
