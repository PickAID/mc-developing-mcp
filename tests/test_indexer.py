import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from index_sources import SourceIndexer, Corpus, FileInfo, ClassInfo, MethodInfo, FieldInfo, EventInfo


def _make_corpus(src_dir: Path, version="1.20.1", loader="forge") -> Corpus:
    return Corpus(version=version, loader=loader, source_dirs=[src_dir], source_root=src_dir)


def _build_fixture_db(db_path: Path) -> SourceIndexer:
    indexer = SourceIndexer(db_path, rebuild=True)
    fixtures = ROOT / "tests" / "fixtures"
    corpus = _make_corpus(fixtures, version="test", loader="test")
    indexer.index_corpus(corpus)
    indexer.optimize()
    return indexer


class TestIndexerBasic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        db = Path(cls.tmp.name) / "test.sqlite"
        cls.indexer = _build_fixture_db(db)
        cls.conn = cls.indexer.conn

    @classmethod
    def tearDownClass(cls):
        cls.indexer.conn.close()
        cls.tmp.cleanup()

    def _count(self, table: str, where: str = "", params: tuple = ()) -> int:
        sql = f"SELECT COUNT(*) FROM {table}"
        if where:
            sql += f" WHERE {where}"
        return self.conn.execute(sql, params).fetchone()[0]

    def test_files_indexed(self):
        count = self._count("source_files", "version=? AND loader=?", ("test", "test"))
        self.assertGreaterEqual(count, 2, "Expected at least 2 fixture Java files")

    def test_classes_indexed(self):
        count = self._count("source_classes", "version=? AND loader=?", ("test", "test"))
        self.assertGreaterEqual(count, 2)

    def test_methods_indexed(self):
        count = self._count("source_methods", "version=? AND loader=?", ("test", "test"))
        self.assertGreaterEqual(count, 4, "Fixtures define several methods each")

    def test_item_stack_class_found(self):
        row = self.conn.execute(
            "SELECT class_name, superclass FROM source_files WHERE version=? AND loader=? AND class_name=?",
            ("test", "test", "ItemStack"),
        ).fetchone()
        self.assertIsNotNone(row, "ItemStack should be indexed")

    def test_living_hurt_event_class_found(self):
        row = self.conn.execute(
            "SELECT class_name FROM source_files WHERE version=? AND loader=? AND class_name=?",
            ("test", "test", "LivingHurtEvent"),
        ).fetchone()
        self.assertIsNotNone(row, "LivingHurtEvent should be indexed")

    def test_interfaces_junction_table(self):
        count = self._count("source_class_interfaces", "interface_name=?", ("java.io.Serializable",))
        self.assertGreaterEqual(count, 1, "ItemStack implements Serializable")

    def test_methods_fts_populated(self):
        count = self._count("source_methods_fts")
        methods = self._count("source_methods", "version=? AND loader=?", ("test", "test"))
        self.assertEqual(count, methods, "source_methods_fts row count must equal source_methods")

    def test_source_content_stored(self):
        count = self._count("source_content")
        self.assertGreaterEqual(count, 2)

    def test_fts_search_works(self):
        rows = self.conn.execute(
            "SELECT class_name FROM source_fts WHERE source_fts MATCH 'LivingHurtEvent' AND version='test' LIMIT 5"
        ).fetchall()
        names = [r[0] for r in rows]
        self.assertTrue(any("LivingHurtEvent" in n for n in names), f"FTS should find LivingHurtEvent, got: {names}")

    def test_rebuild_is_idempotent(self):
        tmp2 = tempfile.TemporaryDirectory()
        try:
            db2 = Path(tmp2.name) / "test2.sqlite"
            idx2 = _build_fixture_db(db2)
            c1 = self.conn.execute("SELECT COUNT(*) FROM source_methods WHERE version='test'").fetchone()[0]
            c2 = idx2.conn.execute("SELECT COUNT(*) FROM source_methods WHERE version='test'").fetchone()[0]
            self.assertEqual(c1, c2, "Rebuilding should produce identical counts")
            idx2.conn.close()
        finally:
            tmp2.cleanup()


class TestIndexerFlushDeletion(unittest.TestCase):
    def test_reindex_same_file_no_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "del.sqlite"
            fixtures = ROOT / "tests" / "fixtures"
            corpus = _make_corpus(fixtures, version="del_test", loader="del_test")
            indexer = SourceIndexer(db, rebuild=True)
            indexer.index_corpus(corpus)
            c1 = indexer.conn.execute(
                "SELECT COUNT(*) FROM source_methods WHERE version='del_test'"
            ).fetchone()[0]
            indexer.index_corpus(corpus)
            c2 = indexer.conn.execute(
                "SELECT COUNT(*) FROM source_methods WHERE version='del_test'"
            ).fetchone()[0]
            self.assertEqual(c1, c2, "Re-indexing the same files must not duplicate rows")
            indexer.conn.close()


if __name__ == "__main__":
    unittest.main()
