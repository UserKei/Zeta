import unittest

from evals.ragas.reporting import (
    EvaluationCaseResult,
    build_summary,
    has_expected_document_hit,
    render_markdown_report,
)


class ReportingTest(unittest.TestCase):
    def test_build_summary_counts_failures_and_hit_rate(self):
        results = [
            EvaluationCaseResult(
                case_id="case-1",
                question="什么是 MFA?",
                answer="MFA 是多因素认证。",
                contexts=["MFA 需要短信或认证器。"],
                expected_documents=["it-faq"],
                retrieved_documents=["it-faq"],
                citations_count=1,
                scores={"faithfulness": 0.9},
            ),
            EvaluationCaseResult(
                case_id="case-2",
                question="报销审批需要谁批准?",
                answer="",
                contexts=[],
                expected_documents=["expense-policy"],
                retrieved_documents=["it-faq"],
                citations_count=0,
                scores={},
                error="empty answer",
            ),
        ]

        summary = build_summary(results)

        self.assertEqual(summary.total_cases, 2)
        self.assertEqual(summary.succeeded_cases, 1)
        self.assertEqual(summary.failed_cases, 1)
        self.assertEqual(summary.expected_document_hit_rate, 0.5)
        self.assertEqual(summary.empty_answer_count, 1)
        self.assertEqual(summary.empty_citation_count, 1)

    def test_render_markdown_report_includes_scores_and_failures(self):
        summary = build_summary(
            [
                EvaluationCaseResult(
                    case_id="case-1",
                    question="什么是 MFA?",
                    answer="MFA 是多因素认证。",
                    contexts=["MFA 需要短信或认证器。"],
                    expected_documents=["it-faq"],
                    retrieved_documents=["it-faq"],
                    citations_count=1,
                    scores={"faithfulness": 0.9},
                )
            ]
        )

        report = render_markdown_report(summary)

        self.assertIn("# Zeta RAG Evaluation Report", report)
        self.assertIn("| Total cases | 1 |", report)
        self.assertIn("| faithfulness | 0.9000 |", report)

    def test_render_markdown_report_includes_ragas_error_note(self):
        summary = build_summary(
            [
                EvaluationCaseResult(
                    case_id="case-1",
                    question="什么是 MFA?",
                    answer="MFA 是多因素认证。",
                    contexts=["MFA 需要短信或认证器。"],
                    expected_documents=["it-faq"],
                    retrieved_documents=["it-faq"],
                    citations_count=1,
                    scores={},
                )
            ]
        )

        report = render_markdown_report(
            summary,
            ragas_error="DEEPSEEK_API_KEY is required",
        )

        self.assertIn("## Ragas Status", report)
        self.assertIn("DEEPSEEK_API_KEY is required", report)

    def test_render_markdown_report_includes_retrieval_diagnostics(self):
        summary = build_summary(
            [
                EvaluationCaseResult(
                    case_id="case-low",
                    question="What does the page cover?",
                    answer="It covers handbook maintenance.",
                    contexts=["context 1", "context 2", "context 3"],
                    expected_documents=["content/handbook/about/maintenance.md"],
                    retrieved_documents=[
                        "content/handbook/about/maintenance.md",
                        "content/handbook/about/maintenance.md",
                        "content/handbook/about/handbook-usage.md",
                    ],
                    citations_count=2,
                    scores={"context_precision": 0.0, "context_recall": 0.5},
                ),
                EvaluationCaseResult(
                    case_id="case-all-same",
                    question="What is the board page for?",
                    answer="It describes board meetings.",
                    contexts=["context 1", "context 2"],
                    expected_documents=["content/handbook/board-meetings/_index.md"],
                    retrieved_documents=[
                        "content/handbook/board-meetings/_index.md",
                        "content/handbook/board-meetings/_index.md",
                    ],
                    citations_count=1,
                    scores={"context_precision": 0.25, "context_recall": 1.0},
                ),
            ]
        )

        report = render_markdown_report(summary)

        self.assertIn("## Retrieval Diagnostics", report)
        self.assertIn("| Average unique retrieved documents | 1.50 |", report)
        self.assertIn("| Average duplicate document slots | 1.00 |", report)
        self.assertIn("| Single-document topK cases | 1 |", report)
        self.assertIn("`case-all-same`", report)
        self.assertIn("## Lowest Context Precision Cases", report)
        self.assertIn(
            "| `case-low` | 0.0000 | 0.5000 | "
            "`content/handbook/about/maintenance.md` | "
            "`content/handbook/about/maintenance.md`; "
            "`content/handbook/about/handbook-usage.md` |",
            report,
        )

    def test_expected_document_hit_accepts_import_relative_paths(self):
        self.assertTrue(
            has_expected_document_hit(
                ["content/handbook/about/contributing.md"],
                ["Content/Handbook/About/Contributing.md"],
            )
        )


if __name__ == "__main__":
    unittest.main()
