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

    def test_ragas_model_config_defaults_to_dashscope(self):
        with patch.dict(
            "os.environ",
            {"DASHSCOPE_API_KEY": "dashscope-key"},
            clear=True,
        ):
            config = run_ragas.read_ragas_model_config()

        self.assertEqual(config.api_key, "dashscope-key")
        self.assertEqual(config.base_url, "https://dashscope.aliyuncs.com/compatible-mode/v1")
        self.assertEqual(config.model, "qwen-plus")
        self.assertEqual(config.embedding_base_url, "https://dashscope.aliyuncs.com/api/v1")
        self.assertEqual(config.embedding_model, "text-embedding-v4")

    def test_ragas_model_config_allows_overrides(self):
        with patch.dict(
            "os.environ",
            {
                "ZETA_EVAL_JUDGE_API_KEY": "judge-key",
                "ZETA_EVAL_JUDGE_BASE_URL": "https://judge.example.com/v1",
                "ZETA_EVAL_JUDGE_MODEL": "judge-model",
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
        self.assertEqual(config.embedding_api_key, "embedding-key")
        self.assertEqual(config.embedding_base_url, "https://embedding.example.com/v1")
        self.assertEqual(config.embedding_model, "embedding-model")

    def test_ragas_model_config_requires_api_key(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            self.assertRaisesRegex(RuntimeError, "DASHSCOPE_API_KEY"),
        ):
            run_ragas.read_ragas_model_config()


if __name__ == "__main__":
    unittest.main()
