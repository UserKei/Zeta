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
            default_knowledge_base_id="kb-1",
            default_agent_id="agent-1",
            default_top_k=5,
        )

        self.assertFalse(client.retrieval_test_called)
        self.assertEqual(result.contexts, [])
        self.assertEqual(result.retrieved_documents, [])


if __name__ == "__main__":
    unittest.main()
