from pathlib import Path
import unittest
from unittest.mock import patch

from evals.ragas import run_ragas


class EnvLoadingTest(unittest.TestCase):
    def test_load_environment_reads_project_root_env_only(self):
        loaded_paths: list[Path] = []

        def fake_load_dotenv(path):
            loaded_paths.append(path)
            return True

        with patch.object(run_ragas, "load_dotenv", fake_load_dotenv):
            run_ragas.load_environment()

        self.assertEqual(loaded_paths, [Path(".env")])

    def test_dataset_default_is_not_read_from_environment(self):
        with (
            patch.dict(
                "os.environ",
                {"ZETA_EVAL_DATASET": "evals/datasets/legacy.jsonl"},
            ),
            patch("sys.argv", ["run_ragas.py"]),
        ):
            args = run_ragas.parse_args()

        self.assertEqual(
            args.dataset,
            "evals/datasets/gitlab-handbook.sample.jsonl",
        )

    def test_ragas_model_config_defaults_to_deepseek_judge_and_dashscope_embedding(self):
        with patch.dict(
            "os.environ",
            {
                "DEEPSEEK_API_KEY": "deepseek-key",
                "DASHSCOPE_API_KEY": "dashscope-key",
            },
            clear=True,
        ):
            config = run_ragas.read_ragas_model_config()

        self.assertEqual(config.api_key, "deepseek-key")
        self.assertEqual(config.base_url, "https://api.deepseek.com")
        self.assertEqual(config.model, "deepseek-v4-flash")
        self.assertEqual(config.judge_thinking, "disabled")
        self.assertEqual(config.embedding_api_key, "dashscope-key")
        self.assertEqual(config.embedding_base_url, "https://dashscope.aliyuncs.com/api/v1")
        self.assertEqual(config.embedding_model, "text-embedding-v4")

    def test_ragas_model_config_allows_overrides(self):
        with patch.dict(
            "os.environ",
            {
                "ZETA_EVAL_JUDGE_API_KEY": "judge-key",
                "ZETA_EVAL_JUDGE_BASE_URL": "https://judge.example.com/v1",
                "ZETA_EVAL_JUDGE_MODEL": "judge-model",
                "ZETA_EVAL_JUDGE_THINKING": "enabled",
                "ZETA_EVAL_EMBEDDING_API_KEY": "embedding-key",
                "ZETA_EVAL_EMBEDDING_BASE_URL": "https://embedding.example.com/v1",
                "ZETA_EVAL_EMBEDDING_MODEL": "embedding-model",
            },
            clear=True,
        ):
            config = run_ragas.read_ragas_model_config()

        self.assertEqual(config.api_key, "judge-key")
        self.assertEqual(config.base_url, "https://judge.example.com/v1")
        self.assertEqual(config.model, "judge-model")
        self.assertEqual(config.judge_thinking, "enabled")
        self.assertEqual(config.embedding_api_key, "embedding-key")
        self.assertEqual(config.embedding_base_url, "https://embedding.example.com/v1")
        self.assertEqual(config.embedding_model, "embedding-model")

    def test_ragas_model_config_requires_judge_api_key(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            self.assertRaisesRegex(RuntimeError, "DEEPSEEK_API_KEY"),
        ):
            run_ragas.read_ragas_model_config()

    def test_ragas_model_config_requires_embedding_api_key(self):
        with (
            patch.dict("os.environ", {"DEEPSEEK_API_KEY": "deepseek-key"}, clear=True),
            self.assertRaisesRegex(RuntimeError, "DASHSCOPE_API_KEY"),
        ):
            run_ragas.read_ragas_model_config()

    def test_create_ragas_judge_llm_passes_thinking_extra_body(self):
        calls = []

        class FakeChatOpenAI:
            def __init__(self, **kwargs):
                calls.append(kwargs)

        config = run_ragas.RagasModelConfig(
            api_key="deepseek-key",
            base_url="https://api.deepseek.com",
            model="deepseek-v4-flash",
            judge_thinking="disabled",
            embedding_api_key="dashscope-key",
            embedding_base_url="https://dashscope.aliyuncs.com/api/v1",
            embedding_model="text-embedding-v4",
        )

        llm = run_ragas.create_ragas_judge_llm(config, chat_openai_cls=FakeChatOpenAI)

        self.assertIsInstance(llm, FakeChatOpenAI)
        self.assertEqual(
            calls,
            [
                {
                    "api_key": "deepseek-key",
                    "base_url": "https://api.deepseek.com",
                    "model": "deepseek-v4-flash",
                    "temperature": 0,
                    "extra_body": {"thinking": {"type": "disabled"}},
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
