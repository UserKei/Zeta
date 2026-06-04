import tempfile
import unittest
from pathlib import Path

from evals.site_export import export_ragas_reports_for_docs


class SiteExportTest(unittest.TestCase):
    def test_exports_ragas_reports_and_generates_docs_index(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            reports_dir = root / "evals" / "reports"
            docs_site_dir = root / "docs-site"
            reports_dir.mkdir(parents=True)

            (reports_dir / "ragas-report-20260604-141149.md").write_text(
                "\n".join(
                    [
                        "# Zeta RAG Evaluation Report",
                        "",
                        "## Ragas Scores",
                        "",
                        "| Metric | Average |",
                        "| --- | ---: |",
                        "| answer_relevancy | 0.9500 |",
                        "| context_precision | 0.5400 |",
                        "| context_recall | 0.7000 |",
                        "| faithfulness | 0.9200 |",
                        "",
                    ]
                ),
                encoding="utf-8",
            )
            (reports_dir / "ragas-report-20260604-141149.csv").write_text(
                "case_id,answer_relevancy\ncase-1,0.95\n",
                encoding="utf-8",
            )

            export_ragas_reports_for_docs(
                reports_dir=reports_dir,
                docs_site_dir=docs_site_dir,
            )

            public_report = (
                docs_site_dir
                / "public"
                / "eval-reports"
                / "ragas"
                / "ragas-report-20260604-141149.md"
            )
            public_csv = public_report.with_suffix(".csv")
            index_page = docs_site_dir / "eval-reports" / "index.md"
            latest_page = docs_site_dir / "eval-reports" / "latest.md"
            deepeval_dir = (
                docs_site_dir / "public" / "eval-reports" / "deepeval"
            )

            self.assertTrue(public_report.exists())
            self.assertTrue(public_csv.exists())
            self.assertTrue(deepeval_dir.exists())
            self.assertIn(
                "| 2026-06-04 14:11:49 | 0.9500 | 0.5400 | 0.7000 | 0.9200 |",
                index_page.read_text(encoding="utf-8"),
            )
            self.assertIn(
                "./ragas/ragas-report-20260604-141149.md",
                index_page.read_text(encoding="utf-8"),
            )
            self.assertIn(
                "# Zeta RAG Evaluation Report",
                latest_page.read_text(encoding="utf-8"),
            )

    def test_writes_empty_index_when_no_reports_exist(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            docs_site_dir = root / "docs-site"

            export_ragas_reports_for_docs(
                reports_dir=root / "evals" / "reports",
                docs_site_dir=docs_site_dir,
            )

            index_page = docs_site_dir / "eval-reports" / "index.md"
            latest_page = docs_site_dir / "eval-reports" / "latest.md"

            self.assertIn(
                "暂时还没有可展示的 Ragas 报告。",
                index_page.read_text(encoding="utf-8"),
            )
            self.assertIn(
                "暂时还没有可展示的 Ragas 报告。",
                latest_page.read_text(encoding="utf-8"),
            )

    def test_uses_published_ragas_reports_when_runtime_reports_are_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            published_ragas_dir = root / "evals" / "published-reports" / "ragas"
            docs_site_dir = root / "docs-site"
            published_ragas_dir.mkdir(parents=True)

            (published_ragas_dir / "ragas-report-20260604-141149.md").write_text(
                "\n".join(
                    [
                        "# Published Ragas Report",
                        "",
                        "## Ragas Scores",
                        "",
                        "| Metric | Average |",
                        "| --- | ---: |",
                        "| answer_relevancy | 0.9178 |",
                        "| context_precision | 0.7311 |",
                        "| context_recall | 0.8667 |",
                        "| faithfulness | 0.9274 |",
                        "",
                    ]
                ),
                encoding="utf-8",
            )
            (published_ragas_dir / "ragas-report-20260604-141149.csv").write_text(
                "case_id,answer_relevancy\ncase-1,0.9178\n",
                encoding="utf-8",
            )

            export_ragas_reports_for_docs(
                reports_dir=root / "evals" / "reports",
                docs_site_dir=docs_site_dir,
                published_ragas_dir=published_ragas_dir,
            )

            index_page = docs_site_dir / "eval-reports" / "index.md"
            latest_page = docs_site_dir / "eval-reports" / "latest.md"
            public_report = (
                docs_site_dir
                / "public"
                / "eval-reports"
                / "ragas"
                / "ragas-report-20260604-141149.md"
            )

            self.assertTrue(public_report.exists())
            self.assertIn("0.7311", index_page.read_text(encoding="utf-8"))
            self.assertIn(
                "# Published Ragas Report",
                latest_page.read_text(encoding="utf-8"),
            )

    def test_index_mentions_deepeval_status(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            docs_site_dir = root / "docs-site"

            export_ragas_reports_for_docs(
                reports_dir=root / "evals" / "reports",
                docs_site_dir=docs_site_dir,
            )

            index_page = docs_site_dir / "eval-reports" / "index.md"

            self.assertIn("## DeepEval 报告", index_page.read_text(encoding="utf-8"))
            self.assertIn(
                "暂时还没有可展示的 DeepEval 报告。",
                index_page.read_text(encoding="utf-8"),
            )

    def test_exports_deepeval_html_reports_and_links_them_from_index(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            reports_dir = root / "evals" / "reports"
            published_deepeval_dir = (
                root / "evals" / "published-reports" / "deepeval"
            )
            docs_site_dir = root / "docs-site"
            reports_dir.mkdir(parents=True)
            published_deepeval_dir.mkdir(parents=True)

            (published_deepeval_dir / "deepeval-report-20260604-142000.html").write_text(
                "<html><body>DeepEval baseline</body></html>",
                encoding="utf-8",
            )
            (published_deepeval_dir / "deepeval-report-20260604-142000.json").write_text(
                '{"name":"DeepEval baseline"}',
                encoding="utf-8",
            )

            export_ragas_reports_for_docs(
                reports_dir=reports_dir,
                docs_site_dir=docs_site_dir,
                published_deepeval_dir=published_deepeval_dir,
            )

            public_html = (
                docs_site_dir
                / "public"
                / "eval-reports"
                / "deepeval"
                / "deepeval-report-20260604-142000.html"
            )
            public_json = public_html.with_suffix(".json")
            index_page = docs_site_dir / "eval-reports" / "index.md"

            self.assertTrue(public_html.exists())
            self.assertTrue(public_json.exists())
            self.assertIn("## DeepEval 报告", index_page.read_text(encoding="utf-8"))
            self.assertIn(
                "./deepeval/deepeval-report-20260604-142000.html",
                index_page.read_text(encoding="utf-8"),
            )


if __name__ == "__main__":
    unittest.main()
