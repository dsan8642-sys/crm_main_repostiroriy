import tempfile
import json
import importlib.util
import subprocess
from datetime import timedelta
from pathlib import Path

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from billing.models import Payment, PaymentStatus, ReceiptFile
from notifications.models import Channel, DeliveryStatus, EventType, NotificationLog
from common.readiness import build_readiness_report

from . import factories as f


REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_cutover_evidence_verifier():
    verifier_path = REPO_ROOT / "scripts" / "verify_production_cutover_evidence.py"
    spec = importlib.util.spec_from_file_location(
        "verify_production_cutover_evidence",
        verifier_path,
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_release_source_manifest_verifier():
    verifier_path = REPO_ROOT / "scripts" / "verify_release_source_manifests.py"
    spec = importlib.util.spec_from_file_location(
        "verify_release_source_manifests",
        verifier_path,
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_ci_release_workflow_verifier():
    verifier_path = REPO_ROOT / "scripts" / "verify_ci_release_workflow.py"
    spec = importlib.util.spec_from_file_location(
        "verify_ci_release_workflow",
        verifier_path,
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProductionCutoverEvidenceVerifierRule(SimpleTestCase):
    def setUp(self):
        self.verifier = _load_cutover_evidence_verifier()
        self.example_path = REPO_ROOT / "docs" / "PRODUCTION_CUTOVER_EVIDENCE.example.json"

    def _write_manifest(self, payload):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        path = Path(temp_dir.name) / "cutover-evidence.json"
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    def _example_payload(self):
        with self.example_path.open("r", encoding="utf-8-sig") as handle:
            return json.load(handle)

    def test_example_cutover_evidence_is_valid_when_examples_are_allowed(self):
        errors = self.verifier.validate(self.example_path, allow_example=True)

        self.assertEqual(errors, [])

    def test_cutover_evidence_can_be_required_to_match_current_head(self):
        payload = self._example_payload()
        stale_sha = "fedcbafedcbafedcbafedcbafedcbafedcbafedc"

        errors = self.verifier.validate(
            self._write_manifest(payload),
            allow_example=True,
            expected_commit_sha=stale_sha,
        )

        self.assertIn(
            f"release_candidate.commit_sha must match current HEAD ({stale_sha})",
            errors,
        )

    def test_cutover_evidence_can_be_required_to_match_current_archive_sha256(self):
        payload = self._example_payload()
        expected_sha = "b" * 64

        errors = self.verifier.validate(
            self._write_manifest(payload),
            allow_example=True,
            expected_archive_sha256=expected_sha,
        )

        self.assertIn(
            f"release_source_archive: evidence must include current release archive sha256 ({expected_sha})",
            errors,
        )

    def test_cutover_evidence_requires_tracked_release_source_guard(self):
        payload = self._example_payload()
        payload["required_evidence"] = [
            item for item in payload["required_evidence"]
            if item["id"] != "tracked_release_source_guard"
        ]

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn("missing required evidence id: tracked_release_source_guard", errors)

    def test_cutover_evidence_requires_release_source_archive(self):
        payload = self._example_payload()
        payload["required_evidence"] = [
            item for item in payload["required_evidence"]
            if item["id"] != "release_source_archive"
        ]

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn("missing required evidence id: release_source_archive", errors)

    def test_cutover_evidence_requires_target_host_release_install(self):
        payload = self._example_payload()
        payload["required_evidence"] = [
            item for item in payload["required_evidence"]
            if item["id"] != "target_host_release_install"
        ]

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn("missing required evidence id: target_host_release_install", errors)

    def test_cutover_evidence_requires_target_host_install_fragments(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "target_host_release_install"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "NocoBase app root outside source tree. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "target_host_release_install: missing evidence fragment: NocoBase app root outside source tree",
            errors,
        )

    def test_cutover_evidence_requires_source_archive_release_sha(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "release_source_archive"
        )
        item["summary"] = "Release source archive was built from a clean release commit."
        item["output_excerpt"] = item["output_excerpt"].replace(
            payload["release_candidate"]["commit_sha"],
            "fedcbafedcbafedcbafedcbafedcbafedcbafedc",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "release_source_archive: evidence must mention release_candidate.commit_sha",
            errors,
        )

    def test_cutover_evidence_requires_source_archive_sha256(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "release_source_archive"
        )
        item["output_excerpt"] = (
            "Release source archive written: releases\\swimcrm-release-0123456789ab.zip. "
            "Release source manifest written: releases\\swimcrm-release-0123456789ab.manifest.json."
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "release_source_archive: missing evidence fragment: sha256",
            errors,
        )
        self.assertIn(
            "release_source_archive: evidence must include archive sha256",
            errors,
        )

    def test_cutover_evidence_requires_source_archive_manifest_verification(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "release_source_archive"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "Release source archive manifest verified. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "release_source_archive: missing evidence fragment: Release source archive manifest verified",
            errors,
        )

    def test_cutover_evidence_requires_source_archive_content_verification(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "release_source_archive"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "Release source archive contents verified. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "release_source_archive: missing evidence fragment: Release source archive contents verified",
            errors,
        )

    def test_cutover_evidence_requires_source_archive_tracked_file_list_verification(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "release_source_archive"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "Release source archive tracked file list verified. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "release_source_archive: missing evidence fragment: Release source archive tracked file list verified",
            errors,
        )

    def test_cutover_evidence_requires_source_archive_file_list_fingerprint(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "release_source_archive"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "tracked_file_count: 1234. ",
            "",
        ).replace(
            "tracked_file_list_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "release_source_archive: missing evidence fragment: tracked_file_count",
            errors,
        )
        self.assertIn(
            "release_source_archive: evidence must include tracked_file_count",
            errors,
        )
        self.assertIn(
            "release_source_archive: missing evidence fragment: tracked_file_list_sha256",
            errors,
        )
        self.assertIn(
            "release_source_archive: evidence must include tracked_file_list_sha256",
            errors,
        )

    def test_cutover_evidence_requires_target_host_file_list_fingerprint(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "target_host_release_install"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "tracked_file_count: 1234. ",
            "",
        ).replace(
            "tracked_file_list_sha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "target_host_release_install: missing evidence fragment: tracked_file_count",
            errors,
        )
        self.assertIn(
            "target_host_release_install: evidence must include tracked_file_count",
            errors,
        )
        self.assertIn(
            "target_host_release_install: missing evidence fragment: tracked_file_list_sha256",
            errors,
        )
        self.assertIn(
            "target_host_release_install: evidence must include tracked_file_list_sha256",
            errors,
        )

    def test_cutover_evidence_rejects_non_github_ci_url_or_missing_release_sha(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "github_full_stack_release_job"
        )
        item["evidence_url"] = "https://ci.example.invalid/run/123"
        item["summary"] = "GitHub Actions release-check job passed."

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "github_full_stack_release_job: evidence_url must be a GitHub Actions run URL",
            errors,
        )
        self.assertIn(
            "github_full_stack_release_job: evidence must mention release_candidate.commit_sha",
            errors,
        )

    def test_cutover_evidence_requires_release_archive_artifact_name_in_github_evidence(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "github_full_stack_release_job"
        )
        item["summary"] = item["summary"].replace(
            " and uploaded artifact swimcrm-release-source-0123456789abcdef0123456789abcdef01234567",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "github_full_stack_release_job: missing evidence fragment: swimcrm-release-source-",
            errors,
        )

    def test_cutover_evidence_requires_postgres_backend_job_name_in_github_evidence(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "github_postgres_backend_job"
        )
        item["summary"] = item["summary"].replace(
            "postgres-backend-check",
            "backend",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "github_postgres_backend_job: missing evidence fragment: postgres-backend-check",
            errors,
        )

    def test_cutover_evidence_requires_frontend_audit_pass_fragment(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "local_full_stack_release_gate"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "found 0 vulnerabilities. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "local_full_stack_release_gate: missing evidence fragment: found 0 vulnerabilities",
            errors,
        )

    def test_cutover_evidence_requires_hybrid_backup_checksum_fragments(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "hybrid_backup_restore_drill"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "Django dump sha256 OK: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "hybrid_backup_restore_drill: missing evidence fragment: Django dump sha256 OK",
            errors,
        )

    def test_cutover_evidence_requires_hybrid_backup_sha256_values(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "hybrid_backup_restore_drill"
        )
        item["output_excerpt"] = (
            "Hybrid backup set written. backup_set_dir nocobase_database. "
            "Django dump sha256 OK. NocoBase dump sha256 OK. "
            "Django dump list OK. NocoBase dump list OK. Restore verification OK. "
            "Hybrid backup set verification OK."
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "hybrid_backup_restore_drill: evidence must include Django and NocoBase dump SHA256 values",
            errors,
        )

    def test_cutover_evidence_requires_complete_rollback_acknowledgement(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "rollback_plan_acknowledged"
        )
        item["summary"] = item["summary"].replace(
            "stop writers, ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "rollback_plan_acknowledged: missing evidence fragment: stop writers",
            errors,
        )

    def test_cutover_evidence_requires_https_reverse_proxy_preflight_fragment(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "production_env_preflight"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "HTTPS reverse-proxy settings passed. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "production_env_preflight: missing evidence fragment: HTTPS reverse-proxy settings passed",
            errors,
        )

    def test_cutover_evidence_requires_https_live_health_fragment(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "live_hybrid_health"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "HTTPS live endpoint requirement passed. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "live_hybrid_health: missing evidence fragment: HTTPS live endpoint requirement passed",
            errors,
        )

    def test_cutover_evidence_requires_live_ops_ok_fragment(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "live_hybrid_health"
        )
        item["output_excerpt"] = item["output_excerpt"].replace(
            "Operations status ok requirement passed. ",
            "",
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "live_hybrid_health: missing evidence fragment: Operations status ok requirement passed",
            errors,
        )

    def test_cutover_evidence_requires_live_health_production_urls(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "live_hybrid_health"
        )
        item["summary"] = "Live Django and NocoBase health passed."
        item["output_excerpt"] = (
            "HTTPS live endpoint requirement passed. Hybrid health check passed. "
            "nocobase_config_health /api/nocobase/config/languages/"
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertIn(
            "live_hybrid_health: evidence must include Django and NocoBase https:// production URLs",
            errors,
        )

    def test_cutover_evidence_rejects_localhost_live_health_urls(self):
        payload = self._example_payload()
        item = next(
            row for row in payload["required_evidence"]
            if row["id"] == "live_hybrid_health"
        )
        item["summary"] = "Live health passed on https://localhost and https://127.0.0.1."
        item["output_excerpt"] = (
            "Django health check passed: https://localhost/api/health/. "
            "NocoBase process health check passed: https://127.0.0.1/api/__health_check. "
            "HTTPS live endpoint requirement passed. Hybrid health check passed. "
            "nocobase_config_health /api/nocobase/config/languages/"
        )

        errors = self.verifier.validate(self._write_manifest(payload), allow_example=True)

        self.assertTrue(
            any(error.startswith("live_hybrid_health: evidence URL must be a real production host") for error in errors),
            errors,
        )

    def test_cutover_evidence_generator_can_prefill_local_archive_evidence(self):
        generator = (REPO_ROOT / "scripts" / "new_production_cutover_evidence.py").read_text(encoding="utf-8-sig")

        self.assertIn("release_archive_passed", generator)
        self.assertIn("archive_sha256", generator)
        self.assertIn("_archive_manifest_data", generator)
        self.assertIn("Release source archive manifest verified", generator)
        self.assertIn("Release source archive contents verified", generator)
        self.assertIn("Release source archive tracked file list verified", generator)
        self.assertIn("tracked_file_count", generator)
        self.assertIn("tracked_file_list_sha256", generator)
        self.assertIn("Tracked release-source guard passed", generator)
        self.assertIn("swimcrm-release-source-<commit-sha>", generator)
        self.assertIn("postgres-backend-check", generator)
        self.assertIn("HTTPS reverse-proxy settings passed", generator)
        self.assertIn("check-hybrid-health.cmd -RequireHttps -RequireOpsOk", generator)
        self.assertIn("target_host_release_install", generator)
        self.assertIn("manual target-host release install", generator)
        self.assertIn("NocoBase app root outside source tree", generator)
        self.assertIn("HTTPS live endpoint requirement passed", generator)
        self.assertIn("Operations status ok requirement passed", generator)
        self.assertIn("production-django-host", generator)
        self.assertIn("production-nocobase-host", generator)
        self.assertIn("<64-hex-sha256>", generator)
        self.assertIn("stop writers", generator)
        self.assertIn("migrate --check", generator)


class ReleaseSourceManifestVerifierRule(SimpleTestCase):
    def setUp(self):
        self.verifier = _load_release_source_manifest_verifier()

    def _make_repo(self, tracked):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        repo = Path(temp_dir.name)
        (repo / "frontend").mkdir()
        for rel_path in self.verifier.REQUIRED_RELEASE_FILES:
            (repo / rel_path).write_text("{}\n", encoding="utf-8")
        subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True, text=True)
        if tracked:
            subprocess.run(["git", "add", *self.verifier.REQUIRED_RELEASE_FILES], cwd=repo, check=True, capture_output=True, text=True)
        else:
            subprocess.run(["git", "add", "frontend/package.json", "frontend/package-lock.json"], cwd=repo, check=True, capture_output=True, text=True)
        return repo

    def test_release_source_manifests_pass_when_required_files_are_tracked(self):
        errors = self.verifier.validate(self._make_repo(tracked=True), require_tracked=True)

        self.assertEqual(errors, [])

    def test_release_source_manifests_fail_when_root_tooling_is_untracked(self):
        errors = self.verifier.validate(self._make_repo(tracked=False), require_tracked=True)

        self.assertIn("package.json: required release manifest is not tracked by git", errors)
        self.assertIn("package-lock.json: required release manifest is not tracked by git", errors)


class CiReleaseWorkflowVerifierRule(SimpleTestCase):
    def setUp(self):
        self.verifier = _load_ci_release_workflow_verifier()
        self.workflow_path = REPO_ROOT / ".github" / "workflows" / "release-check.yml"

    def _write_workflow(self, text):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        path = Path(temp_dir.name) / "release-check.yml"
        path.write_text(text, encoding="utf-8")
        return path

    def _workflow_text(self):
        return self.workflow_path.read_text(encoding="utf-8-sig")

    def test_current_release_workflow_is_valid(self):
        errors = self.verifier.validate(self.workflow_path)

        self.assertEqual(errors, [])

    def test_release_workflow_requires_postgres_manifest_guard(self):
        text = self._workflow_text()
        text = text.replace(
            '\n      - name: Verify release source manifests\n        run: python scripts/verify_release_source_manifests.py --require-tracked\n\n      - name: Install backend dependencies\n',
            '\n      - name: Install backend dependencies\n',
        )

        errors = self.verifier.validate(self._write_workflow(text))

        self.assertIn(
            "missing PostgreSQL tracked release source manifest check: "
            r"python scripts/verify_release_source_manifests\.py --require-tracked",
            errors,
        )

    def test_release_workflow_requires_manifest_guard_after_python_setup(self):
        text = self._workflow_text()
        postgres_marker = "  postgres-backend-check:"
        before_postgres, postgres_block = text.split(postgres_marker, 1)
        step = (
            "\n      - name: Verify release source manifests\n"
            "        run: python scripts/verify_release_source_manifests.py --require-tracked\n"
        )
        postgres_block = postgres_block.replace(step + "\n", "\n", 1)
        postgres_block = postgres_block.replace(
            "\n      - name: Set up Python\n",
            step + "\n      - name: Set up Python\n",
            1,
        )

        errors = self.verifier.validate(self._write_workflow(before_postgres + postgres_marker + postgres_block))

        self.assertIn(
            "invalid order for PostgreSQL Python setup before tracked manifest check: "
            "expected 'actions/setup-python@v5' before "
            "'python scripts/verify_release_source_manifests.py --require-tracked'",
            errors,
        )

    def test_release_workflow_requires_source_archive_builder_after_manifest_guard(self):
        text = self._workflow_text()
        text = text.replace(
            "\n      - name: Build release source archive\n"
            "        shell: pwsh\n"
            "        run: .\\scripts\\build-release-source.ps1\n",
            "",
        )

        errors = self.verifier.validate(self._write_workflow(text))

        self.assertIn(
            r"missing release source archive builder: build-release-source\.ps1",
            errors,
        )

    def test_release_workflow_requires_source_archive_verifier(self):
        text = self._workflow_text()
        text = text.replace(
            "\n      - name: Verify release source archive\n"
            "        shell: pwsh\n"
            "        run: |\n"
            "          $shortSha = (git rev-parse --short=12 HEAD).Trim()\n"
            "          .\\scripts\\verify-release-source-archive.ps1 \"releases\\swimcrm-release-$shortSha.manifest.json\"\n",
            "",
        )

        errors = self.verifier.validate(self._write_workflow(text))

        self.assertIn(
            r"missing release source archive verifier: verify-release-source-archive\.ps1",
            errors,
        )

    def test_release_workflow_requires_verified_source_archive_before_node_artifacts(self):
        text = self._workflow_text()
        verifier_step = (
            "\n      - name: Verify release source archive\n"
            "        shell: pwsh\n"
            "        run: |\n"
            "          $shortSha = (git rev-parse --short=12 HEAD).Trim()\n"
            "          .\\scripts\\verify-release-source-archive.ps1 \"releases\\swimcrm-release-$shortSha.manifest.json\"\n"
        )
        text = text.replace(verifier_step, "", 1)
        text = text.replace(
            "        uses: actions/setup-node@v4\n",
            "        uses: actions/setup-node@v4\n" + verifier_step,
            1,
        )

        errors = self.verifier.validate(self._write_workflow(text))

        self.assertIn(
            "invalid order for verified release source archive before artifact upload: "
            "expected 'verify-release-source-archive.ps1' before 'actions/upload-artifact@v4'",
            errors,
        )

    def test_release_workflow_uploads_verified_source_archive_artifact(self):
        text = self._workflow_text()
        text = text.replace(
            "\n      - name: Upload verified release source archive\n"
            "        uses: actions/upload-artifact@v4\n"
            "        with:\n"
            "          name: swimcrm-release-source-${{ github.sha }}\n"
            "          path: |\n"
            "            releases/swimcrm-release-*.zip\n"
            "            releases/swimcrm-release-*.manifest.json\n"
            "          if-no-files-found: error\n"
            "          retention-days: 14\n",
            "",
        )

        errors = self.verifier.validate(self._write_workflow(text))

        self.assertIn(
            r"missing release source archive artifact upload: actions/upload-artifact@v4",
            errors,
        )

    def test_release_workflow_requires_artifact_upload_after_archive_verifier(self):
        text = self._workflow_text()
        upload_step = (
            "\n      - name: Upload verified release source archive\n"
            "        uses: actions/upload-artifact@v4\n"
            "        with:\n"
            "          name: swimcrm-release-source-${{ github.sha }}\n"
            "          path: |\n"
            "            releases/swimcrm-release-*.zip\n"
            "            releases/swimcrm-release-*.manifest.json\n"
            "          if-no-files-found: error\n"
            "          retention-days: 14\n"
        )
        text = text.replace(upload_step, "", 1)
        text = text.replace(
            "\n      - name: Verify release source archive\n",
            upload_step + "\n      - name: Verify release source archive\n",
            1,
        )

        errors = self.verifier.validate(self._write_workflow(text))

        self.assertIn(
            "invalid order for verified release source archive before artifact upload: "
            "expected 'verify-release-source-archive.ps1' before 'actions/upload-artifact@v4'",
            errors,
        )


class ReleaseSourceArchiveBuilderRule(SimpleTestCase):
    def test_release_source_archive_builder_requires_clean_tracked_source(self):
        script = (REPO_ROOT / "scripts" / "build-release-source.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("clean git work tree", script)
        self.assertIn("git archive", script)
        self.assertIn("-SourceOnly", script)
        self.assertIn("-RequireTrackedReleaseFiles", script)
        self.assertIn("commit_sha", script)
        self.assertIn("Get-FileHash", script)
        self.assertIn("archive_sha256", script)
        self.assertIn("tracked_file_count", script)
        self.assertIn("tracked_file_list_sha256", script)
        self.assertIn("ls-tree -r --name-only HEAD", script)


class ReleaseSourceArchiveVerifierRule(SimpleTestCase):
    def test_release_source_archive_verifier_checks_manifest_and_hash(self):
        script = (REPO_ROOT / "scripts" / "verify-release-source-archive.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("archive_sha256", script)
        self.assertIn("Get-FileHash", script)
        self.assertIn("Release source archive manifest verified", script)
        self.assertIn("commit_sha", script)
        self.assertIn("source_tree", script)
        self.assertIn("rev-parse HEAD", script)
        self.assertIn("commit_sha must match current HEAD", script)
        self.assertIn("short_sha must match current HEAD", script)
        self.assertIn("ZipFile", script)
        self.assertIn("Release source archive contents verified", script)
        self.assertIn("Release source archive tracked file list verified", script)
        self.assertIn("tracked_file_count", script)
        self.assertIn("tracked_file_list_sha256", script)
        self.assertIn("tracked file count mismatch", script)
        self.assertIn("tracked file list sha256 mismatch", script)
        self.assertIn("ls-tree -r --name-only HEAD", script)
        self.assertIn("Release source archive file list must match git ls-tree HEAD", script)
        self.assertIn("blocked runtime/generated entry", script)
        self.assertIn("frontend/package-lock.json", script)


class LocalReleaseCandidateVerifierRule(SimpleTestCase):
    def test_release_candidate_readiness_doc_is_stable_not_a_stale_snapshot(self):
        doc = (REPO_ROOT / "docs" / "RELEASE_CANDIDATE_READINESS.md").read_text(encoding="utf-8-sig")

        self.assertIn("This document is the stable release-candidate procedure", doc)
        self.assertIn("verify-local-release-candidate.cmd -ForceArtifactOverwrite", doc)
        self.assertIn("verify-release-handoff.cmd", doc)
        self.assertIn("verify-local-release-candidate.cmd -RequireProductionEvidence", doc)
        self.assertIn("operator checklist covers every external action", doc)
        self.assertIn("stop_if_missing=true", doc)
        self.assertNotIn("Generated:", doc)
        self.assertNotIn("working tree is not clean, so a release source archive cannot be built", doc)
        self.assertNotIn("231 tests", doc)

    def test_local_release_candidate_verifier_requires_clean_source_archive_and_optional_evidence(self):
        script = (REPO_ROOT / "scripts" / "verify-local-release-candidate.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("clean git work tree", script)
        self.assertIn("release-check-full.ps1", script)
        self.assertIn("verify-release-source-manifests.ps1", script)
        self.assertIn("build-release-source.ps1", script)
        self.assertIn("verify-release-source-archive.ps1", script)
        self.assertIn("PRODUCTION_CUTOVER_EVIDENCE.json", script)
        self.assertIn("RequireProductionEvidence", script)
        self.assertIn("RequireCurrentHead", script)
        self.assertIn("PlanOnly", script)
        self.assertIn("git_status", script)
        self.assertIn("release_review", script)
        self.assertIn("production_critical_changes", script)
        self.assertIn("release_blockers", script)
        self.assertIn("branch_state", script)
        self.assertIn("repository_remote", script)
        self.assertIn("missing_git_remote", script)
        self.assertIn("detached_head", script)
        self.assertIn("Get-ReleaseReviewCategory", script)
        self.assertIn("Get-ReleaseBlockers", script)
        self.assertIn("planned_release_candidate_steps", script)
        self.assertIn("configure_git_remote", script)
        self.assertIn("push_release_branch", script)
        self.assertIn("capture_github_actions_release_check_url", script)
        self.assertIn("capture_github_actions_postgres_backend_check_url", script)
        self.assertIn("install_release_archive_on_target_host", script)
        self.assertIn("run_target_host_production_env_preflight", script)
        self.assertIn("run_target_host_live_hybrid_health", script)
        self.assertIn("run_target_host_hybrid_backup_restore_drill", script)
        self.assertIn("fill_docs_production_cutover_evidence_json", script)
        self.assertIn("run_scripts_verify_production_cutover_evidence_cmd", script)

    def test_cutover_evidence_wrapper_revalidates_current_release_archive(self):
        script = (REPO_ROOT / "scripts" / "verify-production-cutover-evidence.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("RequireCurrentHead", script)
        self.assertIn("verify-release-source-archive.ps1", script)
        self.assertIn("Current release archive verification failed", script)
        self.assertIn("--expected-archive-sha256", script)

    def test_release_handoff_generator_captures_archive_remote_and_pending_actions(self):
        script = (REPO_ROOT / "scripts" / "new-release-handoff.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("RELEASE_HANDOFF.json", script)
        self.assertIn("verify-local-release-candidate.ps1", script)
        self.assertIn("release_source_archive", script)
        self.assertIn("archive_sha256", script)
        self.assertIn("tracked_file_count", script)
        self.assertIn("tracked_file_list_sha256", script)
        self.assertIn("repository_remote", script)
        self.assertIn("pending_external_actions", script)
        self.assertIn("operator_checklist", script)
        self.assertIn("install_release_archive_on_target_host", script)
        self.assertIn("Release archive extracted on target host", script)
        self.assertIn("Backend dependencies installed", script)
        self.assertIn("NocoBase app root outside source tree", script)
        self.assertIn("expected_evidence", script)
        self.assertIn("stop_if_missing", script)
        self.assertIn("HTTPS reverse-proxy settings passed", script)
        self.assertIn("real https:// Django production URL", script)
        self.assertIn("real https:// NocoBase production URL", script)
        self.assertIn("64-character SHA256", script)
        self.assertIn("Rollback plan reviewed", script)
        self.assertIn("Release source archive contents verified", script)
        self.assertIn("Release source archive tracked file list verified", script)
        self.assertIn("tracked_file_count", script)
        self.assertIn("tracked_file_list_sha256", script)
        self.assertIn("migrate --check", script)

    def test_release_handoff_verifier_catches_stale_archive_and_blocker_drift(self):
        script = (REPO_ROOT / "scripts" / "verify-release-handoff.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("RELEASE_HANDOFF.json", script)
        self.assertIn("verify-release-source-archive.ps1", script)
        self.assertIn("verify-local-release-candidate.ps1", script)
        self.assertIn("Release handoff is stale", script)
        self.assertIn("Release handoff blockers drifted", script)
        self.assertIn("archive_sha256", script)
        self.assertIn("tracked_file_count", script)
        self.assertIn("tracked_file_list_sha256", script)
        self.assertIn("repository_remote", script)
        self.assertIn("pending_external_actions", script)
        self.assertIn("operator_checklist", script)
        self.assertIn("install_release_archive_on_target_host", script)
        self.assertIn("Backend dependencies installed", script)
        self.assertIn("NocoBase storage outside source tree", script)
        self.assertIn("is missing expected_evidence", script)
        self.assertIn("must stop if evidence is missing", script)
        self.assertIn("Assert-ChecklistEvidenceContains", script)
        self.assertIn("real https:// Django production URL", script)
        self.assertIn("64-character SHA256", script)
        self.assertIn("stop writers", script)
        self.assertIn("Release source archive contents verified", script)
        self.assertIn("Release source archive tracked file list verified", script)
        self.assertIn("tracked_file_count", script)
        self.assertIn("tracked_file_list_sha256", script)

    def test_operational_wrapper_guard_includes_standalone_postgres_backup_cmd(self):
        verifier = (REPO_ROOT / "scripts" / "verify-operational-wrappers.ps1").read_text(encoding="utf-8-sig")
        wrapper = (REPO_ROOT / "scripts" / "backup-pg.cmd").read_text(encoding="utf-8-sig")
        restore_wrapper = (REPO_ROOT / "scripts" / "verify-pg-restore.cmd").read_text(encoding="utf-8-sig")

        self.assertIn("backup-pg.cmd", verifier)
        self.assertIn("verify-pg-restore.cmd", verifier)
        self.assertIn("verify-pg-restore.ps1", verifier)
        self.assertIn("POSTGRES_PASSWORD must not use the development default", wrapper)
        self.assertIn("backup-pg.ps1", wrapper)
        self.assertIn("verify-pg-restore.ps1", restore_wrapper)
        self.assertNotIn("POSTGRES_PASSWORD=postgres", restore_wrapper)
        self.assertNotIn("pg_restore.exe", restore_wrapper)

    def test_live_hybrid_health_supports_https_required_release_mode(self):
        script = (REPO_ROOT / "scripts" / "check-hybrid-health.ps1").read_text(encoding="utf-8-sig")
        handoff = (REPO_ROOT / "scripts" / "new-release-handoff.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("RequireHttps", script)
        self.assertIn("DJANGO_BASE_URL must use https://", script)
        self.assertIn("NOCOBASE_BASE_URL must use https://", script)
        self.assertIn("HTTPS live endpoint requirement passed", script)
        self.assertIn("RequireOpsOk", script)
        self.assertIn("Operations status must be ok when -RequireOpsOk is set", script)
        self.assertIn("Operations status ok requirement passed", script)
        self.assertIn("check-hybrid-health.cmd -RequireHttps -RequireOpsOk", handoff)

    def test_hybrid_cutover_audit_uses_release_health_plan(self):
        script = (REPO_ROOT / "scripts" / "verify-hybrid-cutover-readiness.ps1").read_text(encoding="utf-8-sig")
        release_check = (REPO_ROOT / "scripts" / "release-check-backend.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("check-hybrid-health.ps1", script)
        self.assertIn("-RequireHttps -RequireOpsOk -PlanOnly", script)
        self.assertIn("Hybrid health plan check", release_check)
        self.assertIn("-RequireHttps -RequireOpsOk -PlanOnly", release_check)

    def test_nocobase_runtime_requires_strong_production_app_key(self):
        runtime = (REPO_ROOT / "scripts" / "run-nocobase-runtime.ps1").read_text(encoding="utf-8-sig")
        verifier = (REPO_ROOT / "scripts" / "verify-nocobase-runtime.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("Assert-ProductionSecret", runtime)
        self.assertIn("Assert-ProductionSecret -Name \"NOCOBASE_APP_KEY\"", runtime)
        self.assertIn("Assert-ProductionSecret -Name \"NOCOBASE_DB_PASSWORD\"", runtime)
        self.assertIn("Assert-ProductionSecret -Name \"NOCOBASE_ROOT_PASSWORD\"", runtime)
        self.assertIn("must be a real production secret at least 32 characters long", runtime)
        self.assertIn("release-check", runtime)
        self.assertIn("short-key", verifier)
        self.assertIn("NocoBase production app key strength guard passed", verifier)
        self.assertIn("short-root-password", verifier)
        self.assertIn("NocoBase production root password strength guard passed", verifier)

    def test_production_env_preflight_requires_strong_nocobase_secrets(self):
        preflight = (REPO_ROOT / "scripts" / "check-production-env.ps1").read_text(encoding="utf-8-sig")
        release_check = (REPO_ROOT / "scripts" / "release-check-backend.ps1").read_text(encoding="utf-8-sig")

        self.assertIn("Assert-RealProductionSecret", preflight)
        self.assertIn("SECRET_KEY\" -Value $secret -MinLength 50", preflight)
        self.assertIn("NOCOBASE_BRIDGE_TOKEN\" -Value $bridgeToken -MinLength 32", preflight)
        self.assertIn("NOCOBASE_CONFIG_TOKEN\" -Value $configToken -MinLength 32", preflight)
        self.assertIn("NOCOBASE_APP_KEY\" -Value $nocobaseAppKey -MinLength 32", preflight)
        self.assertIn("NOCOBASE_ROOT_PASSWORD\" -Value $nocobaseRootPassword -MinLength 32", preflight)
        self.assertIn("prodpreflightbridgeTOKEN123456789012", release_check)
        self.assertIn("prodpreflightnocobaseappkey123456789012", release_check)


class HealthAndReadinessRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="readiness_admin")
        self.parent = f.make_parent(username="readiness_parent")

    def test_public_health_is_anonymous_and_minimal(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["service"], "swimcrm")
        self.assertNotIn("checks", payload)

    def test_admin_readiness_requires_admin(self):
        anonymous = self.client.get("/api/admin/readiness/")
        self.client.force_login(self.parent.user)
        parent = self.client.get("/api/admin/readiness/")

        self.assertEqual(anonymous.status_code, 403)
        self.assertEqual(parent.status_code, 403)

    def test_admin_readiness_reports_backend_checks(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(
                MEDIA_ROOT=media_root,
                NOCOBASE_BRIDGE_TOKEN="test-bridge-token",
                NOCOBASE_CONFIG_TOKEN="test-config-token",
            ):
                self.client.force_login(self.admin)
                response = self.client.get("/api/admin/readiness/")

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["checks"]["database"]["ok"])
        self.assertTrue(payload["checks"]["migrations"]["ok"])
        self.assertTrue(payload["checks"]["media_root"]["ok"])
        self.assertIn("nocobase_bridge_token", payload["checks"])
        self.assertTrue(payload["checks"]["nocobase_first_screens"]["ok"])
        self.assertEqual(payload["checks"]["nocobase_first_screens"]["screens_count"], 9)
        self.assertTrue(payload["checks"]["nocobase_screen_build_pack"]["ok"])
        self.assertEqual(payload["checks"]["nocobase_screen_build_pack"]["screens_count"], 9)
        self.assertNotIn("NOCOBASE_BRIDGE_TOKEN", str(payload))

    def test_production_readiness_requires_nocobase_tokens(self):
        with tempfile.TemporaryDirectory() as runtime_dir:
            with override_settings(
                DEBUG=False,
                RUNTIME_DIR=runtime_dir,
                MEDIA_ROOT=runtime_dir,
                NOCOBASE_BRIDGE_TOKEN="",
                NOCOBASE_CONFIG_TOKEN="",
            ):
                report = build_readiness_report()

        self.assertFalse(report["ok"])
        self.assertFalse(report["checks"]["nocobase_bridge_token"]["ok"])
        self.assertTrue(report["checks"]["nocobase_bridge_token"]["required"])
        self.assertFalse(report["checks"]["nocobase_config_token"]["ok"])

    def test_admin_ops_status_reports_operational_backlog(self):
        now = timezone.now()
        NotificationLog.objects.create(
            recipient=self.parent,
            event_type=EventType.MASS_MAILING,
            channel=Channel.EMAIL,
            status=DeliveryStatus.DEFERRED,
            scheduled_at=now - timedelta(minutes=65),
        )
        NotificationLog.objects.create(
            recipient=self.parent,
            event_type=EventType.MASS_MAILING,
            channel=Channel.SMS,
            status=DeliveryStatus.FAILED,
            scheduled_at=now - timedelta(minutes=5),
            last_attempt_at=now - timedelta(minutes=2),
            error="provider timeout",
        )
        student = f.make_student(parent=self.parent)
        payment = Payment.objects.create(
            student=student,
            amount_minor=1000,
            currency="PLN",
            paid_at=now.date(),
            status=PaymentStatus.PENDING,
        )
        ReceiptFile.objects.create(
            payment=payment,
            uploaded_by=self.parent,
            uploaded_at=now - timedelta(days=40),
        )

        self.client.force_login(self.admin)
        response = self.client.get("/api/admin/ops-status/")

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload["status"], "critical")
        self.assertEqual(payload["notifications"]["due_pending"], 1)
        self.assertEqual(payload["notifications"]["failed_last_24h"], 1)
        self.assertEqual(payload["receipt_cleanup"]["expired_receipts_waiting_cleanup"], 1)
        self.assertIn("notification_queue_due_over_60_minutes", payload["critical"])
        self.assertIn("notifications.tasks.run_due_jobs", str(payload["celery"]["beat_schedule"]))

    @override_settings(NOCOBASE_BRIDGE_TOKEN="bridge-secret")
    def test_nocobase_ops_status_uses_bridge_token(self):
        missing = self.client.get("/api/nocobase/ops-status/")
        ok = self.client.get(
            "/api/nocobase/ops-status/",
            HTTP_AUTHORIZATION="Bearer bridge-secret",
        )

        self.assertEqual(missing.status_code, 403)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["component"], "operations")
