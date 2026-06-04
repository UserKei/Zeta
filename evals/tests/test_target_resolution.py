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
    def test_uses_explicit_agent_id_without_listing_resources(self):
        client = FakeClient()

        targets = resolve_evaluation_targets(
            client,
            agent_id="explicit-agent",
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(targets.agent_id, "explicit-agent")
        self.assertEqual(client.knowledge_base_requests, 0)
        self.assertEqual(client.agent_requests, 0)

    def test_resolves_default_agent_by_name(self):
        targets = resolve_evaluation_targets(
            FakeClient(),
            agent_id=None,
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(targets.agent_id, "agent-1")

    def test_does_not_list_knowledge_bases_for_agent_centric_eval(self):
        client = FakeClient()

        resolve_evaluation_targets(
            client,
            agent_id=None,
            agent_name="GitLab Handbook Expert",
        )

        self.assertEqual(client.knowledge_base_requests, 0)
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
