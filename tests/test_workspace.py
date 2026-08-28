import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "validate_workspace", ROOT / "scripts" / "validate_workspace.py"
)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)


class WorkspaceContractTests(unittest.TestCase):
    def test_public_fixture_set_is_valid(self):
        self.assertEqual(validator.main(), 0)

    def test_fixture_data_is_explicitly_synthetic(self):
        for path in validator.DATA_ROOT.glob("*/dashboard.json"):
            data = json.loads(path.read_text())
            self.assertEqual(data["source"], "Synthetic demonstration data")
            self.assertTrue(data["source_url"].startswith("https://example.com/"))

    def test_renderer_has_no_private_vault_paths(self):
        source = (ROOT / "demo-vault/Resources/Views/election-race/view.js").read_text()
        self.assertNotIn("2026 Michigan", source)
        self.assertNotIn("tombunting", source.lower())
        self.assertIn("input?.dataRoot", source)


if __name__ == "__main__":
    unittest.main()
