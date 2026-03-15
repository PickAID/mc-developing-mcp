import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mcp_server"))

DB = ROOT / "data" / "minecraft_sources.sqlite"
DOCS_DB = ROOT / "data" / "minecraft_docs.sqlite"


def _skip_if_no_db():
    if not DB.exists():
        raise unittest.SkipTest(f"Production DB not found at {DB}; skipping integration queries")


class TestKnownGoodQueries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _skip_if_no_db()
        from server import MCPServer
        cls.s = MCPServer()

    def test_living_hurt_event_exists(self):
        r = self.s.get_class_detail({"version": "1.20.1", "loader": "forge", "class_name": "LivingHurtEvent"})
        self.assertIsNotNone(r)
        self.assertEqual(r["class_name"], "LivingHurtEvent")

    def test_living_hurt_event_has_methods(self):
        r = self.s.get_class_detail({"version": "1.20.1", "loader": "forge", "class_name": "LivingHurtEvent"})
        self.assertIn("methods", r)
        names = [m["name"] for m in r["methods"]]
        self.assertTrue(any("Amount" in n or "Damage" in n or "amount" in n or "damage" in n for n in names),
                        f"LivingHurtEvent should have getAmount/setAmount-style methods; got {names}")

    def test_item_stack_methods(self):
        r = self.s.get_class_detail({"version": "1.20.1", "loader": "forge", "class_name": "ItemStack"})
        self.assertIsNotNone(r)
        self.assertIn("methods", r)

    def test_search_living_hurt_returns_results(self):
        r = self.s.search({"version": "1.20.1", "loader": "forge", "query": "LivingHurtEvent"})
        self.assertGreater(len(r), 0)
        class_names = [row.get("class_name", "") for row in r]
        self.assertTrue(any("LivingHurt" in n for n in class_names), f"Expected LivingHurt* in results; got {class_names}")

    def test_find_class_forge_hooks(self):
        r = self.s.find_class({"version": "1.20.1", "loader": "forge", "class_name": "ForgeHooks"})
        self.assertIsNotNone(r)

    def test_find_implementations_imod_bus_event(self):
        r = self.s.find_implementations({"version": "1.20.1", "loader": "forge", "interface_or_class": "IModBusEvent"})
        self.assertGreaterEqual(len(r), 10, f"Expected 10+ IModBusEvent implementors, got {len(r)}")

    def test_get_hierarchy_living_hurt(self):
        r = self.s.get_hierarchy({"version": "1.20.1", "loader": "forge", "class_name": "LivingHurtEvent"})
        self.assertIsNotNone(r)

    def test_read_source_returns_content(self):
        fc = self.s.find_class({"version": "1.20.1", "loader": "forge", "class_name": "LivingHurtEvent"})
        if not fc:
            self.skipTest("LivingHurtEvent not found")
        r = self.s.read_source({"version": "1.20.1", "loader": "forge", "path": fc["rel_path"], "start": 1, "end": 30})
        self.assertTrue(r.get("content"), "read_source should return non-empty content")
        self.assertIn("LivingHurtEvent", r["content"])

    def test_list_events_returns_forge_events(self):
        r = self.s.list_events({"version": "1.20.1", "loader": "forge", "limit": 10})
        self.assertGreater(len(r), 0)

    def test_search_methods_fts_exact(self):
        r = self.s.search_methods({"version": "1.20.1", "loader": "kubejs", "query": "addRecipe"})
        names = [row["method_name"] for row in r]
        self.assertTrue(any("addRecipe" in n for n in names), f"Expected addRecipe; got {names}")

    def test_search_methods_camelcase_fallback(self):
        r = self.s.search_methods({"version": "1.20.1", "loader": "forge", "query": "onLivingHurt"})
        self.assertIsInstance(r, list)

    def test_smart_search_returns_preview_when_requested(self):
        r = self.s.smart_search({"version": "1.20.1", "loader": "forge", "query": "LivingHurtEvent",
                                  "top_k": 1, "include_source": True, "source_lines": 20})
        source_entries = [e for e in r if "rel_path" in e]
        self.assertGreaterEqual(len(source_entries), 1)
        self.assertTrue(source_entries[0].get("source_preview"), "smart_search with include_source should return source_preview")

    def test_search_by_annotation_mod_bus(self):
        r = self.s.search_by_annotation({"version": "1.20.1", "loader": "forge",
                                          "annotation": "Mod.EventBusSubscriber"})
        self.assertIsInstance(r, list)

    def test_diff_versions_item_stack(self):
        r = self.s.diff_versions({
            "class_name": "ItemStack",
            "version_a": "1.20.1", "loader_a": "forge",
            "version_b": "1.21.1", "loader_b": "neoforge",
        })
        self.assertIn("methods_added", r)
        self.assertIn("methods_removed", r)
        self.assertIn("fields_added", r)
        self.assertIn("fields_removed", r)

    def test_kubejs_event_exists(self):
        r = self.s.search({"version": "1.20.1", "loader": "kubejs", "query": "RecipesEventJS"})
        self.assertGreater(len(r), 0)

    def test_find_usages_returns_list(self):
        r = self.s.find_usages({"version": "1.20.1", "loader": "forge", "class_name": "LivingHurtEvent"})
        self.assertIsInstance(r, list)
        if r:
            first = r[0]
            self.assertIn("rel_path", first)
            self.assertIn("ref_type", first)
            self.assertIn("class_name", first)

    def test_find_usages_with_ref_type_filter(self):
        r = self.s.find_usages({"version": "1.20.1", "loader": "forge",
                                 "class_name": "LivingHurtEvent", "ref_type": "import"})
        self.assertIsInstance(r, list)
        for row in r:
            self.assertEqual(row["ref_type"], "import")

    def test_versions_has_expected_loaders(self):
        r = self.s.versions({})
        pairs = {(row["version"], row["loader"]) for row in r}
        self.assertIn(("1.20.1", "forge"), pairs)
        self.assertIn(("1.20.1", "kubejs"), pairs)
        self.assertIn(("1.21.1", "neoforge"), pairs)

    def test_list_package_forge_events(self):
        r = self.s.list_package({"version": "1.20.1", "loader": "forge",
                                  "package_prefix": "net.minecraftforge.event"})
        self.assertGreater(len(r), 0)


class TestKnownGoodDocsQueries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not DOCS_DB.exists():
            raise unittest.SkipTest("Docs DB not found; skipping")
        from server import MCPServer
        cls.s = MCPServer()

    def test_search_docs_kubejs_recipe(self):
        r = self.s.search_docs({"query": "recipe", "library": "kubejs"})
        self.assertGreater(len(r), 0)
        self.assertTrue(any("recipe" in row.get("title", "").lower() or "recipe" in row.get("snippet", "").lower()
                            for row in r), "search_docs should return recipe-related docs")


if __name__ == "__main__":
    unittest.main()
