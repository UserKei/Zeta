import unittest

from evals.ragas.reporting import (
    EvaluationCaseResult,
    build_summary,
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
            ragas_error="OPENAI_API_KEY is required",
        )

        self.assertIn("## Ragas Status", report)
        self.assertIn("OPENAI_API_KEY is required", report)


if __name__ == "__main__":
    unittest.main()
