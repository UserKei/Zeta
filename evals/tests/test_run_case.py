import unittest

from evals.ragas import run_ragas


class FakeZetaClient:
    def __init__(self, chat_payload):
        self.chat_payload = chat_payload
        self.retrieval_test_called = False

    def retrieval_test(self, knowledge_base_id, question, top_k):
        self.retrieval_test_called = True
        return {
            "hits": [
                {
                    "content": "retrieval-test context that the chat model did not see",
                    "documentName": "retrieval-only",
                }
            ]
        }

    def chat(self, agent_id, message, top_k):
        return self.chat_payload


class RunCaseTest(unittest.TestCase):
    def test_collect_case_results_prints_case_progress(self):
        messages = []
        cases = [
            run_ragas.EvaluationCase(
                case_id="case-1",
                question="Question 1",
                reference="Reference 1",
                expected_documents=[],
            ),
            run_ragas.EvaluationCase(
                case_id="case-2",
                question="Question 2",
                reference="Reference 2",
                expected_documents=[],
            ),
        ]

        def fake_run_case(**kwargs):
            case = kwargs["case"]
            return run_ragas.EvaluationCaseResult(
                case_id=case.case_id,
                question=case.question,
                answer="Answer",
                contexts=[],
                expected_documents=[],
                retrieved_documents=[],
                citations_count=0,
                scores={},
            )

        original_run_case = run_ragas.run_case
        run_ragas.run_case = fake_run_case
        try:
            results = run_ragas.collect_case_results(
                client=object(),
                cases=cases,
                default_agent_id="agent-1",
                default_top_k=5,
                progress_writer=messages.append,
            )
        finally:
            run_ragas.run_case = original_run_case

        self.assertEqual([result.case_id for result in results], ["case-1", "case-2"])
        self.assertEqual(
            messages,
            [
                "[Ragas] Running Zeta chat case 1/2: case-1",
                "[Ragas] Running Zeta chat case 2/2: case-2",
            ],
        )

    def test_run_case_uses_only_chat_hits_as_ragas_contexts(self):
        client = FakeZetaClient(
            {
                "assistantMessage": {
                    "content": "The answer was generated without returned hits.",
                    "citations": [],
                },
                "hits": [],
            }
        )
        case = run_ragas.EvaluationCase(
            case_id="case-1",
            question="What is the handbook?",
            reference="The handbook describes company practices.",
            expected_documents=["content/handbook/_index.md"],
        )

        result = run_ragas.run_case(
            client=client,
            case=case,
            default_agent_id="agent-1",
            default_top_k=5,
        )

        self.assertFalse(client.retrieval_test_called)
        self.assertEqual(result.contexts, [])
        self.assertEqual(result.retrieved_documents, [])

    def test_run_case_includes_document_and_chunk_titles_in_contexts(self):
        client = FakeZetaClient(
            {
                "assistantMessage": {
                    "content": "The acquisitions handbook explains acquisition goals.",
                    "citations": [{"id": "citation-1"}],
                },
                "hits": [
                    {
                        "documentName": "Acquisitions Handbook",
                        "documentPath": "content/handbook/acquisitions/_index.md",
                        "title": "Overview",
                        "content": "GitLab pursues acquisitions to accelerate its roadmap.",
                    }
                ],
            }
        )
        case = run_ragas.EvaluationCase(
            case_id="case-2",
            question="What is GitLab's key goal when pursuing acquisitions?",
            reference="GitLab pursues acquisitions to accelerate its roadmap.",
            expected_documents=["content/handbook/acquisitions/_index.md"],
        )

        result = run_ragas.run_case(
            client=client,
            case=case,
            default_agent_id="agent-1",
            default_top_k=5,
        )

        self.assertEqual(
            result.contexts,
            [
                "Acquisitions Handbook\n"
                "Overview\n"
                "GitLab pursues acquisitions to accelerate its roadmap."
            ],
        )
        self.assertEqual(
            result.retrieved_documents,
            ["content/handbook/acquisitions/_index.md"],
        )

    def test_run_case_requires_agent_not_knowledge_base(self):
        client = FakeZetaClient(
            {
                "assistantMessage": {
                    "content": "The answer.",
                    "citations": [],
                },
                "hits": [],
            }
        )
        case = run_ragas.EvaluationCase(
            case_id="case-3",
            question="What is the handbook?",
            reference="The handbook describes company practices.",
            expected_documents=[],
        )

        result = run_ragas.run_case(
            client=client,
            case=case,
            default_agent_id=None,
            default_top_k=5,
        )

        self.assertEqual(result.error, "agent_id is required")
        self.assertFalse(client.retrieval_test_called)


if __name__ == "__main__":
    unittest.main()
