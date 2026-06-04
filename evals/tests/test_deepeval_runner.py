import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from evals.deepeval import run_deepeval
from evals.ragas.reporting import EvaluationCaseResult


class DeepEvalRunnerTest(unittest.TestCase):
    def test_model_config_defaults_to_deepseek_judge(self):
        with patch.dict(
            "os.environ",
            {"DEEPSEEK_API_KEY": "deepseek-key"},
            clear=True,
        ):
            config = run_deepeval.read_deepeval_model_config()

        self.assertEqual(config.api_key, "deepseek-key")
        self.assertEqual(config.base_url, "https://api.deepseek.com")
        self.assertEqual(config.model, "deepseek-v4-flash")
        self.assertEqual(config.judge_thinking, "disabled")

    def test_model_config_allows_overrides(self):
        with patch.dict(
            "os.environ",
            {
                "ZETA_EVAL_JUDGE_API_KEY": "judge-key",
                "ZETA_EVAL_JUDGE_BASE_URL": "https://judge.example.com/v1",
                "ZETA_EVAL_JUDGE_MODEL": "judge-model",
                "ZETA_EVAL_JUDGE_THINKING": "enabled",
            },
            clear=True,
        ):
            config = run_deepeval.read_deepeval_model_config()

        self.assertEqual(config.api_key, "judge-key")
        self.assertEqual(config.base_url, "https://judge.example.com/v1")
        self.assertEqual(config.model, "judge-model")
        self.assertEqual(config.judge_thinking, "enabled")

    def test_model_config_requires_judge_api_key(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            self.assertRaisesRegex(RuntimeError, "DEEPSEEK_API_KEY"),
        ):
            run_deepeval.read_deepeval_model_config()

    def test_create_judge_model_uses_openai_compatible_deepseek_config(self):
        calls = []

        class FakeGPTModel:
            def __init__(self, **kwargs):
                calls.append(kwargs)

        config = run_deepeval.DeepEvalModelConfig(
            api_key="deepseek-key",
            base_url="https://api.deepseek.com",
            model="deepseek-v4-flash",
            judge_thinking="disabled",
        )

        model = run_deepeval.create_deepeval_judge_model(
            config,
            gpt_model_cls=FakeGPTModel,
        )

        self.assertIsInstance(model, FakeGPTModel)
        self.assertEqual(
            calls,
            [
                {
                    "api_key": "deepseek-key",
                    "base_url": "https://api.deepseek.com",
                    "model": "deepseek-v4-flash",
                    "temperature": 0,
                    "generation_kwargs": {
                        "extra_body": {"thinking": {"type": "disabled"}}
                    },
                }
            ],
        )

    def test_create_deepeval_test_cases_uses_rag_context_fields(self):
        created = []

        class FakeLLMTestCase:
            def __init__(self, **kwargs):
                created.append(kwargs)

        result = EvaluationCaseResult(
            case_id="case-1",
            question="What is GitLab?",
            answer="GitLab is a DevSecOps platform.",
            contexts=["GitLab handbook context"],
            expected_documents=["content/handbook/_index.md"],
            retrieved_documents=["content/handbook/_index.md"],
            citations_count=1,
            scores={},
        )
        reference = "GitLab is a DevSecOps platform."

        test_cases = run_deepeval.create_deepeval_test_cases(
            [result],
            {"case-1": reference},
            test_case_cls=FakeLLMTestCase,
        )

        self.assertEqual(len(test_cases), 1)
        self.assertEqual(
            created,
            [
                {
                    "input": "What is GitLab?",
                    "actual_output": "GitLab is a DevSecOps platform.",
                    "expected_output": reference,
                    "retrieval_context": ["GitLab handbook context"],
                }
            ],
        )

    def test_apply_deepeval_scores_renames_native_html_and_json_reports(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            report_dir = Path(temp_dir)
            html_path = report_dir / "deepeval-report-20260604-142000.html"
            json_path = report_dir / "deepeval-report-20260604-142000.json"
            calls = []

            def fake_evaluate(**kwargs):
                calls.append(kwargs)
                (report_dir / "native-dashboard.html").write_text(
                    "<html>native deepeval</html>",
                    encoding="utf-8",
                )
                (report_dir / "test_run_20260604_142000.json").write_text(
                    '{"testRun":"native"}',
                    encoding="utf-8",
                )

            class FakeDisplayConfig:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs

            class FakeAnswerRelevancyMetric:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs

            class FakeFaithfulnessMetric(FakeAnswerRelevancyMetric):
                pass

            class FakeContextualPrecisionMetric(FakeAnswerRelevancyMetric):
                pass

            class FakeContextualRecallMetric(FakeAnswerRelevancyMetric):
                pass

            class FakeLLMTestCase:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs

            class FakeGPTModel:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs

            result = EvaluationCaseResult(
                case_id="case-1",
                question="What is GitLab?",
                answer="GitLab is a DevSecOps platform.",
                contexts=["GitLab handbook context"],
                expected_documents=["content/handbook/_index.md"],
                retrieved_documents=["content/handbook/_index.md"],
                citations_count=1,
                scores={},
            )
            config = run_deepeval.DeepEvalModelConfig(
                api_key="deepseek-key",
                base_url="https://api.deepseek.com",
                model="deepseek-v4-flash",
                judge_thinking="disabled",
            )

            run_deepeval.apply_deepeval_scores(
                results=[result],
                references_by_id={"case-1": "GitLab is a DevSecOps platform."},
                model_config=config,
                report_dir=report_dir,
                html_path=html_path,
                json_path=json_path,
                evaluate_fn=fake_evaluate,
                display_config_cls=FakeDisplayConfig,
                metric_classes=run_deepeval.DeepEvalMetricClasses(
                    answer_relevancy=FakeAnswerRelevancyMetric,
                    faithfulness=FakeFaithfulnessMetric,
                    contextual_precision=FakeContextualPrecisionMetric,
                    contextual_recall=FakeContextualRecallMetric,
                ),
                test_case_cls=FakeLLMTestCase,
                gpt_model_cls=FakeGPTModel,
            )

            self.assertEqual(len(calls), 1)
            self.assertTrue(html_path.exists())
            self.assertTrue(json_path.exists())
            self.assertIn("native deepeval", html_path.read_text(encoding="utf-8"))
            self.assertEqual(
                json_path.read_text(encoding="utf-8"),
                '{"testRun":"native"}',
            )
            self.assertEqual(
                calls[0]["display_config"].kwargs["file_output_dir"],
                str(report_dir),
            )
            self.assertEqual(
                calls[0]["display_config"].kwargs["file_type"],
                "html",
            )

    def test_collect_case_results_prints_case_progress(self):
        messages = []
        cases = [
            run_deepeval.run_ragas.EvaluationCase(
                case_id="case-1",
                question="Question 1",
                reference="Reference 1",
                expected_documents=[],
            ),
            run_deepeval.run_ragas.EvaluationCase(
                case_id="case-2",
                question="Question 2",
                reference="Reference 2",
                expected_documents=[],
            ),
        ]

        def fake_run_case(**kwargs):
            case = kwargs["case"]
            return EvaluationCaseResult(
                case_id=case.case_id,
                question=case.question,
                answer="Answer",
                contexts=[],
                expected_documents=[],
                retrieved_documents=[],
                citations_count=0,
                scores={},
            )

        with patch.object(run_deepeval.run_ragas, "run_case", fake_run_case):
            results = run_deepeval.collect_case_results(
                client=object(),
                cases=cases,
                default_agent_id="agent-1",
                default_top_k=5,
                progress_writer=messages.append,
            )

        self.assertEqual([result.case_id for result in results], ["case-1", "case-2"])
        self.assertEqual(
            messages,
            [
                "[DeepEval] Running Zeta chat case 1/2: case-1",
                "[DeepEval] Running Zeta chat case 2/2: case-2",
            ],
        )


if __name__ == "__main__":
    unittest.main()
