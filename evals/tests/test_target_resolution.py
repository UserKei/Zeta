import unittest

from evals.ragas.run_ragas import resolve_evaluation_targets


class FakeClient:
    def __init__(self):
        self.knowledge_base_requests = 0
        self.agent_requests = 0

    def list_knowledge_bases(self):
        self.knowledge_base_requests += 1
        return [
            {
                "id": "kb-1",
                "name": "GitLab Handbook",
                "rerankerModelId": "rerank-1",
            },
            {"id": "kb-2", "name": "Other KB"},
        ]

    def list_agents(self):
        self.agent_requests += 1
        return [
            {
                "id": "agent-1",
                "name": "GitLab Handbook Expert",
                "knowledgeBases": [{"id": "kb-1", "name": "GitLab Handbook"}],
            },
            {"id": "agent-2", "name": "Other Agent"},
        ]


class TargetResolutionTest(unittest.TestCase):
    def test_uses_explicit_agent_id_and_enriches_metadata(self):
        client = FakeClient()

        targets = resolve_evaluation_targets(
            client,
            agent_id="agent-1",
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(targets.agent_id, "agent-1")
        self.assertEqual(targets.agent_name, "GitLab Handbook Expert")
        self.assertEqual(targets.knowledge_base_names, ["GitLab Handbook"])
        self.assertTrue(targets.rerank_enabled)
        self.assertEqual(client.knowledge_base_requests, 1)
        self.assertEqual(client.agent_requests, 1)

    def test_resolves_default_agent_by_name(self):
        targets = resolve_evaluation_targets(
            FakeClient(),
            agent_id=None,
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(targets.agent_id, "agent-1")
        self.assertEqual(targets.agent_name, "GitLab Handbook Expert")

    def test_lists_knowledge_bases_only_for_report_metadata(self):
        client = FakeClient()

        resolve_evaluation_targets(
            client,
            agent_id=None,
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(client.knowledge_base_requests, 1)
        self.assertEqual(client.agent_requests, 1)

    def test_raises_clear_error_when_default_agent_is_missing(self):
        with self.assertRaisesRegex(RuntimeError, "pnpm import:markdown-corpus"):
            resolve_evaluation_targets(
                FakeClient(),
                agent_id=None,
                agent_name="Missing Agent",
            )


if __name__ == "__main__":
    unittest.main()
