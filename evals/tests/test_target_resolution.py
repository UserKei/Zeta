import unittest

from evals.ragas.run_ragas import resolve_evaluation_targets


class FakeClient:
    def __init__(self):
        self.knowledge_base_requests = 0
        self.agent_requests = 0

    def list_knowledge_bases(self):
        self.knowledge_base_requests += 1
        return [
            {"id": "kb-1", "name": "GitLab Handbook"},
            {"id": "kb-2", "name": "Other KB"},
        ]

    def list_agents(self):
        self.agent_requests += 1
        return [
            {"id": "agent-1", "name": "GitLab Handbook Expert"},
            {"id": "agent-2", "name": "Other Agent"},
        ]


class TargetResolutionTest(unittest.TestCase):
    def test_uses_explicit_ids_without_listing_resources(self):
        client = FakeClient()

        targets = resolve_evaluation_targets(
            client,
            knowledge_base_id="explicit-kb",
            agent_id="explicit-agent",
            knowledge_base_name="GitLab Handbook",
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(targets.knowledge_base_id, "explicit-kb")
        self.assertEqual(targets.agent_id, "explicit-agent")
        self.assertEqual(client.knowledge_base_requests, 0)
        self.assertEqual(client.agent_requests, 0)

    def test_resolves_default_resources_by_name(self):
        targets = resolve_evaluation_targets(
            FakeClient(),
            knowledge_base_id=None,
            agent_id=None,
            knowledge_base_name="GitLab Handbook",
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(targets.knowledge_base_id, "kb-1")
        self.assertEqual(targets.agent_id, "agent-1")

    def test_raises_clear_error_when_default_resource_is_missing(self):
        with self.assertRaisesRegex(RuntimeError, "pnpm import:markdown-corpus"):
            resolve_evaluation_targets(
                FakeClient(),
                knowledge_base_id=None,
                agent_id=None,
                knowledge_base_name="Missing KB",
                agent_name="GitLab Handbook Expert",
            )


if __name__ == "__main__":
    unittest.main()
