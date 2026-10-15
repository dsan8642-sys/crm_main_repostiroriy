import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import TestCase, override_settings

from portal import dev_appearance
from . import factories as f


@override_settings(DEBUG=True, ENVIRONMENT="development", ALLOWED_HOSTS=["127.0.0.1", "testserver"])
class DevAppearanceTest(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(dir=Path(__file__).resolve().parents[2] / "backups")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for path in ("design/tokens", "frontend/src/design/tokens"):
            (self.root / path).mkdir(parents=True)
        (self.root / "design/appearance.json").write_text(
            '{"values": {}, "presets": []}\n', encoding="utf-8")
        (self.root / "frontend/src/design/appearance.json").write_text(
            '{"values": {}, "presets": []}\n', encoding="utf-8")
        for path in ("design/tokens/appearance.css", "frontend/src/design/tokens/appearance.css"):
            (self.root / path).write_text("original", encoding="utf-8")
        root_patch = patch.object(dev_appearance, "ROOT", self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)
        self.client.force_login(f.make_admin(username="appearance_admin"))
        self.url = "/api/dev/appearance/"
        self.host = {"HTTP_HOST": "127.0.0.1:8000", "REMOTE_ADDR": "127.0.0.1"}

    def post(self, revision, state):
        return self.client.post(self.url, data=json.dumps({"revision": revision, "state": state}),
                                content_type="application/json", **self.host)

    def test_save_reset_and_reject_invalid_values_without_file_changes(self):
        initial = self.client.get(self.url, **self.host)
        self.assertEqual(initial.status_code, 200)
        initial_revision = initial.json()["revision"]
        values = {"primary": "#123456", "cardPadding": "20px"}
        state = {"values": values, "presets": [{"name": "Мой вариант", "values": values}]}
        saved = self.post(initial_revision, state)
        self.assertEqual(saved.status_code, 200, saved.content)
        css = (self.root / "design/tokens/appearance.css").read_text(encoding="utf-8")
        self.assertIn("--primary: #123456", css)
        self.assertIn(".card-pad { padding: 20px !important; }", css)
        self.assertEqual(css, (self.root / "frontend/src/design/tokens/appearance.css").read_text(encoding="utf-8"))
        self.assertEqual(json.loads((self.root / "design/appearance.json").read_text(encoding="utf-8")), {**state, "overrides": [], "blocks": []})
        self.assertEqual((self.root / "design/appearance.json").read_bytes(), (self.root / "frontend/src/design/appearance.json").read_bytes())
        self.assertEqual(len(list((self.root / "backups/appearance").glob("*.zip"))), 1)

        self.assertEqual(self.post(initial_revision, state).status_code, 409)
        invalid = {"values": {"primary": "red; background: url(x)"}, "presets": []}
        self.assertEqual(self.post(saved.json()["revision"], invalid).status_code, 400)
        self.assertEqual((self.root / "design/tokens/appearance.css").read_text(encoding="utf-8"), css)

        reset = self.post(saved.json()["revision"], {"values": {}, "presets": state["presets"]})
        self.assertEqual(reset.status_code, 200)
        self.assertNotIn("--primary:", (self.root / "design/tokens/appearance.css").read_text(encoding="utf-8"))

    def test_element_override_is_scoped_and_rejects_css_injection(self):
        revision = self.client.get(self.url, **self.host).json()["revision"]
        item = {"route": "admin/overview", "selector": "#root > div:nth-of-type(1) > button:nth-of-type(2)",
                "label": "Кнопка", "properties": {"backgroundColor": "#123456", "paddingLeft": "12px", "marginTop": "8px"}}
        state = {"values": {}, "presets": [], "overrides": [item]}
        saved = self.post(revision, state)
        self.assertEqual(saved.status_code, 200, saved.content)
        css = (self.root / "design/tokens/appearance.css").read_text(encoding="utf-8")
        self.assertIn(':root[data-appearance="custom"][data-appearance-route="admin/overview"] #root > div:nth-of-type(1) > button:nth-of-type(2)', css)
        self.assertIn("background-color: #123456 !important;", css)
        self.assertIn("padding-left: 12px !important;", css)
        self.assertIn("margin-top: 8px !important;", css)
        state["overrides"][0]["selector"] += ", body"
        self.assertEqual(self.post(saved.json()["revision"], state).status_code, 400)
        self.assertEqual((self.root / "design/tokens/appearance.css").read_text(encoding="utf-8"), css)

    def test_text_only_override_is_saved_and_checked(self):
        revision = self.client.get(self.url, **self.host).json()["revision"]
        item = {"route": "admin/overview", "selector": "#root > div:nth-of-type(1) > span:nth-of-type(1)",
                "label": "span", "properties": {}, "text": "Новая надпись", "match": "a" * 64}
        state = {"values": {}, "presets": [], "overrides": [item]}
        saved = self.post(revision, state)
        self.assertEqual(saved.status_code, 200, saved.content)
        self.assertEqual(saved.json()["state"]["overrides"][0]["text"], "Новая надпись")
        self.assertNotIn("span:nth-of-type", (self.root / "design/tokens/appearance.css").read_text(encoding="utf-8"))
        state["overrides"][0]["match"] = "invalid"
        self.assertEqual(self.post(saved.json()["revision"], state).status_code, 400)

    def test_local_blocks_and_visibility_are_saved_without_html_or_css_injection(self):
        revision = self.client.get(self.url, **self.host).json()["revision"]
        block_id = "12345678-1234-1234-1234-123456789abc"
        parent = "#root > div:nth-of-type(1)"
        state = {"values": {}, "presets": [], "blocks": [{"id": block_id, "route": "admin/overview", "parent": parent, "kind": "text", "text": "Новый текст"}],
                 "overrides": [{"route": "admin/overview", "selector": parent, "label": "div", "properties": {}, "visibility": "removed"},
                               {"route": "admin/overview", "selector": f'#root [data-appearance-block-id="{block_id}"]', "label": "Добавленный элемент", "properties": {"color": "#123456"}}]}
        saved = self.post(revision, state)
        self.assertEqual(saved.status_code, 200, saved.content)
        self.assertIn("display: none !important", (self.root / "design/tokens/appearance.css").read_text(encoding="utf-8"))
        self.assertIn(f'[data-appearance-block-id="{block_id}"]', (self.root / "design/tokens/appearance.css").read_text(encoding="utf-8"))
        self.assertEqual(saved.json()["state"]["blocks"], state["blocks"])
        state["blocks"][0]["parent"] = "body"
        self.assertEqual(self.post(saved.json()["revision"], state).status_code, 400)
        state["blocks"][0]["parent"] = parent
        state["blocks"][0]["text"] = "<script>alert(1)</script>"
        self.assertEqual(self.post(saved.json()["revision"], state).status_code, 200)
        state["overrides"][0]["visibility"] = "removed; color: red"
        self.assertEqual(self.post(self.client.get(self.url, **self.host).json()["revision"], state).status_code, 400)

    def test_endpoint_requires_local_debug_admin(self):
        self.assertEqual(self.client.get(self.url, HTTP_HOST="127.0.0.1:8000", REMOTE_ADDR="10.0.0.1").status_code, 404)
        self.assertEqual(self.client.get(self.url, HTTP_HOST="testserver", REMOTE_ADDR="127.0.0.1").status_code, 404)
        with override_settings(DEBUG=False):
            self.assertEqual(self.client.get(self.url, **self.host).status_code, 404)
        self.client.logout()
        self.assertEqual(self.client.get(self.url, **self.host).status_code, 403)
        self.client.force_login(f.make_trainer(username="appearance_trainer").user)
        self.assertEqual(self.client.get(self.url, **self.host).status_code, 403)
