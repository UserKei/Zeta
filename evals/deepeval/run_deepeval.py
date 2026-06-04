from __future__ import annotations

import argparse
import json
import os
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from evals.ragas import run_ragas
from evals.ragas.reporting import EvaluationCaseResult
from evals.shared.zeta_client import ZetaClient


DEFAULT_DEEPEVAL_JUDGE_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPEVAL_JUDGE_MODEL = "deepseek-v4-flash"
DEFAULT_DEEPEVAL_JUDGE_THINKING = "disabled"


@dataclass(frozen=True)
class DeepEvalModelConfig:
    api_key: str
    base_url: str
    model: str
    judge_thinking: str


@dataclass(frozen=True)
class DeepEvalMetricClasses:
    answer_relevancy: type[Any]
    faithfulness: type[Any]
    contextual_precision: type[Any]
    contextual_recall: type[Any]


def main() -> None:
    run_ragas.load_environment()
    args = parse_args()
    dataset_path = Path(args.dataset)
    report_dir = Path(args.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    cases = run_ragas.load_cases(dataset_path)
    client = ZetaClient(
        base_url=os.getenv("ZETA_API_BASE_URL", "http://localhost:3000"),
    ).login(
        run_ragas.read_required_env("ZETA_USERNAME"),
        run_ragas.read_required_env("ZETA_PASSWORD"),
    )
    targets = run_ragas.resolve_evaluation_targets(
        client,
        agent_id=args.agent_id,
        agent_name=os.getenv("ZETA_EVAL_AGENT_NAME", run_ragas.DEFAULT_AGENT_NAME),
    )
    results = collect_case_results(
        client=client,
        cases=cases,
        default_agent_id=targets.agent_id,
        default_top_k=args.top_k,
    )
    references_by_id = {case.case_id: case.reference for case in cases}
    timestamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    html_path = report_dir / f"deepeval-report-{timestamp}.html"
    json_path = report_dir / f"deepeval-report-{timestamp}.json"
    deepeval_error = None

    try:
        apply_deepeval_scores(
            results=results,
            references_by_id=references_by_id,
            model_config=read_deepeval_model_config(),
            report_dir=report_dir,
            html_path=html_path,
            json_path=json_path,
        )
    except Exception as cause:  # noqa: BLE001 - keep a local report for diagnosis
        deepeval_error = str(cause)
        write_fallback_reports(
            html_path=html_path,
            json_path=json_path,
            results=results,
            error=deepeval_error,
        )

    print(f"DeepEval HTML report: {html_path}")
    print(f"DeepEval JSON report: {json_path}")

    raise_if_blocking_deepeval_error(
        deepeval_error,
        allow_deepeval_failure=args.allow_deepeval_failure,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Zeta RAG evaluation with DeepEval")
    parser.add_argument(
        "--dataset",
        default="evals/datasets/gitlab-handbook.sample.jsonl",
        help="JSONL dataset path",
    )
    parser.add_argument(
        "--report-dir",
        default=os.getenv("ZETA_EVAL_REPORT_DIR", "evals/reports"),
        help="Report output directory",
    )
    parser.add_argument(
        "--agent-id",
        default=None,
        help="Default agent id for chat",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=int(os.getenv("ZETA_EVAL_TOP_K", "5")),
        help="Default retrieval topK",
    )
    parser.add_argument(
        "--allow-deepeval-failure",
        action="store_true",
        default=read_allow_deepeval_failure(),
        help=(
            "Write a base report and exit 0 even if DeepEval scoring fails. "
            "By default scoring failure exits with status 1."
        ),
    )

    return parser.parse_args()


def read_deepeval_model_config() -> DeepEvalModelConfig:
    api_key = (
        os.getenv("ZETA_EVAL_JUDGE_API_KEY")
        or os.getenv("DEEPSEEK_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )

    if not api_key:
        raise RuntimeError(
            "DEEPSEEK_API_KEY or ZETA_EVAL_JUDGE_API_KEY is required "
            "for DeepEval scoring."
        )

    return DeepEvalModelConfig(
        api_key=api_key,
        base_url=os.getenv("ZETA_EVAL_JUDGE_BASE_URL")
        or DEFAULT_DEEPEVAL_JUDGE_BASE_URL,
        model=os.getenv("ZETA_EVAL_JUDGE_MODEL", DEFAULT_DEEPEVAL_JUDGE_MODEL),
        judge_thinking=read_judge_thinking(),
    )


def read_judge_thinking() -> str:
    value = os.getenv("ZETA_EVAL_JUDGE_THINKING", DEFAULT_DEEPEVAL_JUDGE_THINKING)
    normalized = value.strip().lower()

    if normalized not in {"enabled", "disabled"}:
        raise RuntimeError(
            "ZETA_EVAL_JUDGE_THINKING must be either `enabled` or `disabled`."
        )

    return normalized


def read_allow_deepeval_failure() -> bool:
    value = os.getenv("ZETA_EVAL_ALLOW_DEEPEVAL_FAILURE", "false")

    return value.strip().lower() in {"1", "true", "yes", "on"}


def raise_if_blocking_deepeval_error(
    deepeval_error: str | None,
    allow_deepeval_failure: bool,
) -> None:
    if deepeval_error and not allow_deepeval_failure:
        raise SystemExit(1)


def create_deepeval_judge_model(
    model_config: DeepEvalModelConfig,
    gpt_model_cls: type[Any] | None = None,
) -> Any:
    if gpt_model_cls is None:
        try:
            from deepeval.models import GPTModel
        except ImportError as cause:
            raise RuntimeError(
                "DeepEval dependencies are not installed. "
                "Run `pip install -r evals/requirements.txt` first."
            ) from cause

        gpt_model_cls = GPTModel

    kwargs: dict[str, Any] = {
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model": model_config.model,
        "temperature": 0,
    }

    if is_deepseek_judge(model_config):
        kwargs["generation_kwargs"] = {
            "extra_body": {"thinking": {"type": model_config.judge_thinking}}
        }

    return gpt_model_cls(**kwargs)


def is_deepseek_judge(model_config: DeepEvalModelConfig) -> bool:
    host = urlparse(model_config.base_url).netloc.casefold()
    model = model_config.model.casefold()

    return host.endswith("deepseek.com") or model.startswith("deepseek-")


def create_deepeval_test_cases(
    results: list[EvaluationCaseResult],
    references_by_id: dict[str, str],
    test_case_cls: type[Any] | None = None,
) -> list[Any]:
    if test_case_cls is None:
        try:
            from deepeval.test_case import LLMTestCase
        except ImportError as cause:
            raise RuntimeError(
                "DeepEval dependencies are not installed. "
                "Run `pip install -r evals/requirements.txt` first."
            ) from cause

        test_case_cls = LLMTestCase

    return [
        test_case_cls(
            input=result.question,
            actual_output=result.answer,
            expected_output=references_by_id[result.case_id],
            retrieval_context=result.contexts,
        )
        for result in results
        if result.error is None and result.case_id in references_by_id
    ]


def collect_case_results(
    client: ZetaClient,
    cases: list[run_ragas.EvaluationCase],
    default_agent_id: str | None,
    default_top_k: int,
    progress_writer: Any = print,
) -> list[EvaluationCaseResult]:
    results = []
    total_cases = len(cases)

    for index, case in enumerate(cases, start=1):
        progress_writer(
            f"[DeepEval] Running Zeta chat case {index}/{total_cases}: {case.case_id}"
        )
        results.append(
            run_ragas.run_case(
                client=client,
                case=case,
                default_agent_id=default_agent_id,
                default_top_k=default_top_k,
            )
        )

    return results


def apply_deepeval_scores(
    results: list[EvaluationCaseResult],
    references_by_id: dict[str, str],
    model_config: DeepEvalModelConfig,
    report_dir: Path,
    html_path: Path,
    json_path: Path,
    evaluate_fn: Any | None = None,
    display_config_cls: type[Any] | None = None,
    metric_classes: DeepEvalMetricClasses | None = None,
    test_case_cls: type[Any] | None = None,
    gpt_model_cls: type[Any] | None = None,
) -> None:
    test_cases = create_deepeval_test_cases(
        results,
        references_by_id,
        test_case_cls=test_case_cls,
    )

    if not test_cases:
        write_fallback_reports(
            html_path=html_path,
            json_path=json_path,
            results=results,
            error="No successful Zeta chat cases were available for DeepEval.",
        )
        return

    if evaluate_fn is None or display_config_cls is None or metric_classes is None:
        try:
            from deepeval import evaluate
            from deepeval.evaluate import DisplayConfig
            from deepeval.metrics import (
                AnswerRelevancyMetric,
                ContextualPrecisionMetric,
                ContextualRecallMetric,
                FaithfulnessMetric,
            )
        except ImportError as cause:
            raise RuntimeError(
                "DeepEval dependencies are not installed. "
                "Run `pip install -r evals/requirements.txt` first."
            ) from cause

        evaluate_fn = evaluate
        display_config_cls = DisplayConfig
        metric_classes = DeepEvalMetricClasses(
            answer_relevancy=AnswerRelevancyMetric,
            faithfulness=FaithfulnessMetric,
            contextual_precision=ContextualPrecisionMetric,
            contextual_recall=ContextualRecallMetric,
        )

    judge_model = create_deepeval_judge_model(
        model_config,
        gpt_model_cls=gpt_model_cls,
    )
    metrics = [
        metric_classes.answer_relevancy(model=judge_model),
        metric_classes.faithfulness(model=judge_model),
        metric_classes.contextual_precision(model=judge_model),
        metric_classes.contextual_recall(model=judge_model),
    ]
    display_config = display_config_cls(
        print_results=True,
        file_type="html",
        file_output_dir=str(report_dir),
        results_folder=str(report_dir),
        inspect_after_run=False,
    )

    evaluate_fn(
        test_cases=test_cases,
        metrics=metrics,
        display_config=display_config,
    )
    copy_native_report_artifact(
        report_dir,
        html_path,
        patterns=("*.html",),
    )
    copy_native_report_artifact(
        report_dir,
        json_path,
        patterns=("test_run_*.json", "*.json"),
    )

    if not html_path.exists() or not json_path.exists():
        write_fallback_reports(
            html_path=html_path,
            json_path=json_path,
            results=results,
            error=None,
        )


def copy_native_report_artifact(
    report_dir: Path,
    target_path: Path,
    patterns: tuple[str, ...],
) -> None:
    candidates: list[Path] = []

    for pattern in patterns:
        candidates.extend(
            path
            for path in report_dir.glob(pattern)
            if path.is_file() and path.resolve() != target_path.resolve()
        )

    if not candidates:
        return

    latest = max(candidates, key=lambda path: path.stat().st_mtime)
    shutil.copy2(latest, target_path)


def write_fallback_reports(
    html_path: Path,
    json_path: Path,
    results: list[EvaluationCaseResult],
    error: str | None,
) -> None:
    payload = {
        "tool": "deepeval",
        "status": "failed" if error else "completed",
        "error": error,
        "totalCases": len(results),
        "succeededCases": sum(1 for result in results if result.error is None),
        "failedCases": sum(1 for result in results if result.error is not None),
        "cases": [
            {
                "caseId": result.case_id,
                "question": result.question,
                "contextCount": len(result.contexts),
                "citationsCount": result.citations_count,
                "error": result.error,
            }
            for result in results
        ],
    }
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    status = "失败" if error else "完成"
    html_path.write_text(
        "\n".join(
            [
                "<!doctype html>",
                '<html lang="zh-CN">',
                "<head>",
                '<meta charset="utf-8">',
                "<title>Zeta DeepEval Report</title>",
                "</head>",
                "<body>",
                "<h1>Zeta DeepEval Report</h1>",
                f"<p>状态：{status}</p>",
                f"<p>用例数：{len(results)}</p>",
                f"<p>错误：{error}</p>" if error else "",
                "</body>",
                "</html>",
            ]
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
