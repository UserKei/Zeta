import tempfile
import unittest
from pathlib import Path

from evals.site_export import export_ragas_reports_for_docs


class SiteExportTest(unittest.TestCase):
    def test_exports_ragas_reports_and_generates_latest_page(self):
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
                include_local_reports=True,
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
            legacy_latest_page = docs_site_dir / "eval-reports" / "latest.md"
            latest_page = docs_site_dir / "eval-reports" / "ragas" / "latest.md"
            deepeval_dir = (
                docs_site_dir / "public" / "eval-reports" / "deepeval"
            )

            self.assertTrue(public_report.exists())
            self.assertTrue(public_csv.exists())
            self.assertTrue(deepeval_dir.exists())
            self.assertFalse(index_page.exists())
            self.assertFalse(legacy_latest_page.exists())
            self.assertIn(
                "# Zeta RAG Evaluation Report",
                latest_page.read_text(encoding="utf-8"),
            )
            self.assertIn(
                "./ragas-report-20260604-141149.md",
                latest_page.read_text(encoding="utf-8"),
            )

    def test_writes_empty_latest_pages_when_no_reports_exist(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            docs_site_dir = root / "docs-site"

            export_ragas_reports_for_docs(
                reports_dir=root / "evals" / "reports",
                docs_site_dir=docs_site_dir,
            )

            index_page = docs_site_dir / "eval-reports" / "index.md"
            legacy_latest_page = docs_site_dir / "eval-reports" / "latest.md"
            ragas_latest_page = (
                docs_site_dir / "eval-reports" / "ragas" / "latest.md"
            )
            deepeval_latest_page = (
                docs_site_dir / "eval-reports" / "deepeval" / "latest.md"
            )

            self.assertFalse(index_page.exists())
            self.assertFalse(legacy_latest_page.exists())
            self.assertIn(
                "暂时还没有可展示的 Ragas 报告。",
                ragas_latest_page.read_text(encoding="utf-8"),
            )
            self.assertIn(
                "暂时还没有可展示的 DeepEval 报告。",
                deepeval_latest_page.read_text(encoding="utf-8"),
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

            latest_page = docs_site_dir / "eval-reports" / "ragas" / "latest.md"
            public_report = (
                docs_site_dir
                / "public"
                / "eval-reports"
                / "ragas"
                / "ragas-report-20260604-141149.md"
            )

            self.assertTrue(public_report.exists())
            self.assertIn(
                "# Published Ragas Report",
                latest_page.read_text(encoding="utf-8"),
            )

    def test_does_not_mix_local_reports_by_default(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            reports_dir = root / "evals" / "reports"
            published_ragas_dir = root / "evals" / "published-reports" / "ragas"
            docs_site_dir = root / "docs-site"
            reports_dir.mkdir(parents=True)
            published_ragas_dir.mkdir(parents=True)

            (reports_dir / "ragas-report-20260604-150000.md").write_text(
                "\n".join(
                    [
                        "# Local Ragas Report",
                        "",
                        "| Metric | Average |",
                        "| --- | ---: |",
                        "| answer_relevancy | 0.1000 |",
                        "| context_precision | 0.1000 |",
                        "| context_recall | 0.1000 |",
                        "| faithfulness | 0.1000 |",
                    ]
                ),
                encoding="utf-8",
            )
            (published_ragas_dir / "ragas-report-20260604-141149.md").write_text(
                "\n".join(
                    [
                        "# Published Ragas Report",
                        "",
                        "| Metric | Average |",
                        "| --- | ---: |",
                        "| answer_relevancy | 0.9000 |",
                        "| context_precision | 0.9000 |",
                        "| context_recall | 0.9000 |",
                        "| faithfulness | 0.9000 |",
                    ]
                ),
                encoding="utf-8",
            )

            export_ragas_reports_for_docs(
                reports_dir=reports_dir,
                docs_site_dir=docs_site_dir,
                published_ragas_dir=published_ragas_dir,
            )

            latest_text = (
                docs_site_dir / "eval-reports" / "ragas" / "latest.md"
            ).read_text(encoding="utf-8")

            self.assertIn("published", latest_text)
            self.assertIn("# Published Ragas Report", latest_text)
            self.assertNotIn("# Local Ragas Report", latest_text)
            self.assertFalse(
                (
                    docs_site_dir
                    / "public"
                    / "eval-reports"
                    / "ragas"
                    / "ragas-report-20260604-150000.md"
                ).exists()
            )

    def test_can_include_local_reports_explicitly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            reports_dir = root / "evals" / "reports"
            published_ragas_dir = root / "evals" / "published-reports" / "ragas"
            docs_site_dir = root / "docs-site"
            reports_dir.mkdir(parents=True)
            published_ragas_dir.mkdir(parents=True)

            (reports_dir / "ragas-report-20260604-150000.md").write_text(
                "\n".join(
                    [
                        "# Local Ragas Report",
                        "",
                        "| Metric | Average |",
                        "| --- | ---: |",
                        "| answer_relevancy | 0.1000 |",
                        "| context_precision | 0.1000 |",
                        "| context_recall | 0.1000 |",
                        "| faithfulness | 0.1000 |",
                    ]
                ),
                encoding="utf-8",
            )
            (published_ragas_dir / "ragas-report-20260604-141149.md").write_text(
                "\n".join(
                    [
                        "# Published Ragas Report",
                        "",
                        "| Metric | Average |",
                        "| --- | ---: |",
                        "| answer_relevancy | 0.9000 |",
                        "| context_precision | 0.9000 |",
                        "| context_recall | 0.9000 |",
                        "| faithfulness | 0.9000 |",
                    ]
                ),
                encoding="utf-8",
            )

            export_ragas_reports_for_docs(
                reports_dir=reports_dir,
                docs_site_dir=docs_site_dir,
                published_ragas_dir=published_ragas_dir,
                include_local_reports=True,
            )

            latest_text = (
                docs_site_dir / "eval-reports" / "ragas" / "latest.md"
            ).read_text(encoding="utf-8")

            self.assertIn("local", latest_text)
            self.assertIn("# Local Ragas Report", latest_text)
            self.assertTrue(
                (
                    docs_site_dir
                    / "public"
                    / "eval-reports"
                    / "ragas"
                    / "ragas-report-20260604-150000.md"
                ).exists()
            )

    def test_writes_empty_deepeval_latest_page_when_no_report_exists(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            docs_site_dir = root / "docs-site"

            export_ragas_reports_for_docs(
                reports_dir=root / "evals" / "reports",
                docs_site_dir=docs_site_dir,
            )

            deepeval_latest_page = (
                docs_site_dir / "eval-reports" / "deepeval" / "latest.md"
            )

            self.assertIn(
                "暂时还没有可展示的 DeepEval 报告。",
                deepeval_latest_page.read_text(encoding="utf-8"),
            )

    def test_generates_deepeval_markdown_report_from_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            reports_dir = root / "evals" / "reports"
            published_deepeval_dir = (
                root / "evals" / "published-reports" / "deepeval"
            )
            docs_site_dir = root / "docs-site"
            reports_dir.mkdir(parents=True)
            published_deepeval_dir.mkdir(parents=True)

            source_html = published_deepeval_dir / "deepeval-report-20260604-142000.html"
            source_html.write_text(
                "<html><body>DeepEval baseline</body></html>",
                encoding="utf-8",
            )
            (published_deepeval_dir / "deepeval-report-20260604-142000.json").write_text(
                "\n".join(
                    [
                        "{",
                        '  "testCases": [',
                        "    {",
                        '      "name": "test_case_0",',
                        '      "input": "What is Zeta?",',
                        '      "actualOutput": "Zeta is an AI knowledge base.",',
                        '      "expectedOutput": "Zeta manages knowledge bases and agents.",',
                        '      "retrievalContext": ["context one", "context two"],',
                        '      "success": false,',
                        '      "metricsData": [',
                        "        {",
                        '          "name": "Answer Relevancy",',
                        '          "score": 0.8,',
                        '          "success": true,',
                        '          "reason": "The answer is mostly relevant."',
                        "        },",
                        "        {",
                        '          "name": "Faithfulness",',
                        '          "score": 0.4,',
                        '          "success": false,',
                        '          "reason": "The answer missed one key fact."',
                        "        }",
                        "      ]",
                        "    }",
                        "  ],",
                        '  "metricsScores": [',
                        '    {"metric": "Answer Relevancy", "scores": [0.8], "passes": 1, "fails": 0, "errors": 0},',
                        '    {"metric": "Faithfulness", "scores": [0.4], "passes": 0, "fails": 1, "errors": 0},',
                        '    {"metric": "Contextual Precision", "scores": [0.6], "passes": 1, "fails": 0, "errors": 0},',
                        '    {"metric": "Contextual Recall", "scores": [0.7], "passes": 1, "fails": 0, "errors": 0}',
                        "  ],",
                        '  "testPassed": 0,',
                        '  "testFailed": 1,',
                        '  "runDuration": 12.5',
                        "}",
                    ]
                ),
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
            markdown_page = (
                docs_site_dir
                / "eval-reports"
                / "deepeval"
                / "deepeval-report-20260604-142000.md"
            )
            latest_page = docs_site_dir / "eval-reports" / "deepeval" / "latest.md"
            index_page = docs_site_dir / "eval-reports" / "index.md"

            self.assertFalse(public_html.exists())
            self.assertTrue(public_json.exists())
            self.assertTrue(markdown_page.exists())
            self.assertTrue(latest_page.exists())
            self.assertFalse(index_page.exists())
            self.assertIn("# DeepEval 报告", markdown_page.read_text(encoding="utf-8"))
            self.assertIn(
                "# 最新 DeepEval 报告",
                latest_page.read_text(encoding="utf-8"),
            )
            self.assertIn("What is Zeta?", markdown_page.read_text(encoding="utf-8"))
            self.assertIn("0.8000", markdown_page.read_text(encoding="utf-8"))
            self.assertIn("The answer missed one key fact.", markdown_page.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
