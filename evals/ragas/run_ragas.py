from __future__ import annotations

import argparse
import csv
import json
import math
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime
from numbers import Real
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from evals.ragas.reporting import (
    EvaluationBaseline,
    EvaluationCaseResult,
    EvaluationRunMetadata,
    build_summary,
    render_markdown_report,
)
from evals.ragas.dashscope_embeddings import (
    DEFAULT_DASHSCOPE_API_BASE_URL,
    DashScopeTextEmbeddings,
)
from evals.shared.zeta_client import ZetaClient

DEFAULT_AGENT_NAME = "GitLab Handbook Expert"
DEFAULT_RAGAS_JUDGE_BASE_URL = "https://api.deepseek.com"
DEFAULT_RAGAS_JUDGE_MODEL = "deepseek-v4-flash"
DEFAULT_RAGAS_JUDGE_THINKING = "disabled"
DEFAULT_RAGAS_EMBEDDING_MODEL = "text-embedding-v4"
DEFAULT_BASELINE_PATH = "evals/baselines/gitlab-handbook.json"
DEFAULT_CORPUS_PRESET = "gitlab-handbook"

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*args: Any, **kwargs: Any) -> bool:
        return False


@dataclass(frozen=True)
class EvaluationCase:
    case_id: str
    question: str
    reference: str
    expected_documents: list[str]
    agent_id: str | None = None
    top_k: int | None = None


@dataclass(frozen=True)
class EvaluationTargets:
    agent_id: str
    agent_name: str
    knowledge_base_names: list[str]
    rerank_enabled: bool


@dataclass(frozen=True)
class RagasModelConfig:
    api_key: str
    base_url: str
    model: str
    judge_thinking: str
    embedding_api_key: str
    embedding_base_url: str
    embedding_model: str


def main() -> None:
    load_environment()
    args = parse_args()
    dataset_path = Path(args.dataset)
    report_dir = Path(args.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    cases = load_cases(dataset_path)
    client = ZetaClient(
        base_url=os.getenv("ZETA_API_BASE_URL", "http://localhost:3000"),
    ).login(
        read_required_env("ZETA_USERNAME"),
        read_required_env("ZETA_PASSWORD"),
    )
    targets = resolve_evaluation_targets(
        client,
        agent_id=args.agent_id,
        agent_name=os.getenv("ZETA_EVAL_AGENT_NAME", DEFAULT_AGENT_NAME),
    )
    run_timestamp = datetime.now().astimezone()

    results = collect_case_results(
        client=client,
        cases=cases,
        default_agent_id=targets.agent_id,
        default_top_k=args.top_k,
    )

    ragas_error = None
    model_config = None

    try:
        model_config = read_ragas_model_config()
        scored_results = apply_ragas_scores(
            results,
            cases,
            model_config,
        )
    except Exception as cause:  # noqa: BLE001 - still write the base report
        ragas_error = str(cause)
        scored_results = results

    summary = build_summary(scored_results)
    metadata = build_run_metadata(
        dataset_path=dataset_path,
        top_k=args.top_k,
        targets=targets,
        model_config=model_config,
        run_timestamp=run_timestamp,
    )
    baseline = read_evaluation_baseline(Path(args.baseline)) if args.baseline else None
    timestamp = run_timestamp.strftime("%Y%m%d-%H%M%S")

    markdown_path = report_dir / f"ragas-report-{timestamp}.md"
    csv_path = report_dir / f"ragas-report-{timestamp}.csv"

    markdown_path.write_text(
        render_markdown_report(
            summary,
            metadata=metadata,
            baseline=baseline,
            ragas_error=ragas_error,
        ),
        encoding="utf-8",
    )
    write_case_csv(csv_path, scored_results)

    print(f"Markdown report: {markdown_path}")
    print(f"Case CSV: {csv_path}")

    raise_if_blocking_ragas_error(
        ragas_error,
        allow_ragas_failure=args.allow_ragas_failure,
    )


def load_environment() -> None:
    load_dotenv(Path(".env"))


def resolve_evaluation_targets(
    client: ZetaClient,
    agent_id: str | None,
    agent_name: str,
) -> EvaluationTargets:
    agents = client.list_agents()
    agent = (
        find_resource_by_id(agents, agent_id, "agent")
        if agent_id
        else find_resource_by_name(agents, agent_name, "agent")
    )
    knowledge_bases = [
        item
        for item in agent.get("knowledgeBases", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    ]
    knowledge_base_ids = {item["id"] for item in knowledge_bases}
    knowledge_base_details = [
        item
        for item in client.list_knowledge_bases()
        if item.get("id") in knowledge_base_ids
    ]

    return EvaluationTargets(
        agent_id=agent["id"],
        agent_name=agent["name"],
        knowledge_base_names=[
            item["name"]
            for item in knowledge_bases
            if isinstance(item.get("name"), str)
        ],
        rerank_enabled=any(
            bool(item.get("rerankerModelId")) for item in knowledge_base_details
        ),
    )


def find_resource_by_id(
    resources: list[dict[str, Any]],
    resource_id: str,
    resource_label: str,
) -> dict[str, Any]:
    for resource in resources:
        if resource.get("id") == resource_id and isinstance(resource.get("name"), str):
            return resource

    raise RuntimeError(
        f"Cannot find {resource_label} id `{resource_id}`. "
        "Run `pnpm import:markdown-corpus` first."
    )


def find_resource_by_name(
    resources: list[dict[str, Any]],
    name: str,
    resource_label: str,
) -> dict[str, Any]:
    for resource in resources:
        if resource.get("name") == name and isinstance(resource.get("id"), str):
            return resource

    raise RuntimeError(
        f"Cannot find {resource_label} named `{name}`. "
        "Run `pnpm import:markdown-corpus` first."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Zeta RAG evaluation with Ragas")
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
        "--knowledge-base-id",
        default=None,
        help=(
            "Deprecated. Ragas evaluation calls Agent chat; "
            "the Agent binding decides which knowledge bases are used."
        ),
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
        "--allow-ragas-failure",
        action="store_true",
        default=read_allow_ragas_failure(),
        help=(
            "Write a base report and exit 0 even if Ragas scoring fails. "
            "By default scoring failure exits with status 1."
        ),
    )
    parser.add_argument(
        "--baseline",
        default=os.getenv("ZETA_EVAL_BASELINE", DEFAULT_BASELINE_PATH),
        help="Optional JSON baseline path for report comparison",
    )

    return parser.parse_args()


def read_evaluation_baseline(path: Path) -> EvaluationBaseline | None:
    if not path.exists():
        return None

    payload = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(payload, dict):
        raise ValueError("Evaluation baseline must be a JSON object")

    name = payload.get("name")
    metrics = payload.get("metrics")

    if not isinstance(name, str) or not name.strip():
        raise ValueError("Evaluation baseline `name` is required")

    if not isinstance(metrics, dict):
        raise ValueError("Evaluation baseline `metrics` is required")

    normalized_metrics: dict[str, float] = {}

    for key, value in metrics.items():
        if not isinstance(key, str) or not key.strip() or not isinstance(value, Real):
            raise ValueError("Evaluation baseline `metrics` must contain numbers")

        normalized_metrics[key] = float(value)

    return EvaluationBaseline(name=name, metrics=normalized_metrics)


def read_allow_ragas_failure() -> bool:
    value = os.getenv("ZETA_EVAL_ALLOW_RAGAS_FAILURE", "false")

    return value.strip().lower() in {"1", "true", "yes", "on"}


def raise_if_blocking_ragas_error(
    ragas_error: str | None,
    allow_ragas_failure: bool,
) -> None:
    if ragas_error and not allow_ragas_failure:
        raise SystemExit(1)


def build_run_metadata(
    dataset_path: Path,
    top_k: int,
    targets: EvaluationTargets,
    model_config: RagasModelConfig | None,
    run_timestamp: datetime,
) -> EvaluationRunMetadata:
    corpus_preset = os.getenv("ZETA_EVAL_CORPUS_PRESET", DEFAULT_CORPUS_PRESET)

    return EvaluationRunMetadata(
        run_timestamp=run_timestamp.isoformat(timespec="seconds"),
        dataset_path=str(dataset_path),
        agent_id=targets.agent_id,
        agent_name=targets.agent_name,
        knowledge_base_names=targets.knowledge_base_names,
        top_k=top_k,
        judge_model=read_judge_model_for_metadata(model_config),
        judge_base_url=read_judge_base_url_for_metadata(model_config),
        embedding_model=read_embedding_model_for_metadata(model_config),
        embedding_base_url=read_embedding_base_url_for_metadata(model_config),
        rerank_enabled=targets.rerank_enabled,
        git_commit=read_git_ref(Path(".")),
        corpus_preset=corpus_preset,
        corpus_limit=read_corpus_limit_for_metadata(),
        corpus_source_ref=read_corpus_source_ref(corpus_preset),
    )


def read_judge_model_for_metadata(model_config: RagasModelConfig | None) -> str:
    if model_config:
        return model_config.model

    return os.getenv("ZETA_EVAL_JUDGE_MODEL", DEFAULT_RAGAS_JUDGE_MODEL)


def read_judge_base_url_for_metadata(model_config: RagasModelConfig | None) -> str:
    if model_config:
        return model_config.base_url

    return os.getenv("ZETA_EVAL_JUDGE_BASE_URL", DEFAULT_RAGAS_JUDGE_BASE_URL)


def read_embedding_model_for_metadata(model_config: RagasModelConfig | None) -> str:
    if model_config:
        return model_config.embedding_model

    return os.getenv("ZETA_EVAL_EMBEDDING_MODEL", DEFAULT_RAGAS_EMBEDDING_MODEL)


def read_embedding_base_url_for_metadata(
    model_config: RagasModelConfig | None,
) -> str:
    if model_config:
        return model_config.embedding_base_url

    return os.getenv("ZETA_EVAL_EMBEDDING_BASE_URL", DEFAULT_DASHSCOPE_API_BASE_URL)


def read_corpus_limit_for_metadata() -> str:
    return os.getenv("ZETA_EVAL_CORPUS_LIMIT") or os.getenv("CORPUS_LIMIT") or "-"


def read_corpus_source_ref(corpus_preset: str) -> str:
    if corpus_preset != DEFAULT_CORPUS_PRESET:
        return "-"

    return read_git_ref(Path("example/corpora/gitlab-handbook"))


def read_git_ref(path: Path) -> str:
    if not path.exists():
        return "-"

    try:
        result = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "--short", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return "-"

    return result.stdout.strip() or "-"


def read_ragas_model_config() -> RagasModelConfig:
    api_key = (
        os.getenv("ZETA_EVAL_JUDGE_API_KEY")
        or os.getenv("DEEPSEEK_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )

    if not api_key:
        raise RuntimeError(
            "DEEPSEEK_API_KEY or ZETA_EVAL_JUDGE_API_KEY is required "
            "for Ragas scoring."
        )

    base_url = os.getenv("ZETA_EVAL_JUDGE_BASE_URL") or DEFAULT_RAGAS_JUDGE_BASE_URL
    embedding_api_key = (
        os.getenv("ZETA_EVAL_EMBEDDING_API_KEY")
        or os.getenv("DASHSCOPE_API_KEY")
    )

    if not embedding_api_key:
        raise RuntimeError(
            "DASHSCOPE_API_KEY or ZETA_EVAL_EMBEDDING_API_KEY is required "
            "for Ragas embedding."
        )

    embedding_base_url = (
        os.getenv("ZETA_EVAL_EMBEDDING_BASE_URL")
        or DEFAULT_DASHSCOPE_API_BASE_URL
    )

    return RagasModelConfig(
        api_key=api_key,
        base_url=base_url,
        model=os.getenv("ZETA_EVAL_JUDGE_MODEL", DEFAULT_RAGAS_JUDGE_MODEL),
        judge_thinking=read_judge_thinking(),
        embedding_api_key=embedding_api_key,
        embedding_base_url=embedding_base_url,
        embedding_model=os.getenv(
            "ZETA_EVAL_EMBEDDING_MODEL",
            DEFAULT_RAGAS_EMBEDDING_MODEL,
        ),
    )


def create_ragas_judge_llm(
    model_config: RagasModelConfig,
    chat_openai_cls: type[Any] | None = None,
) -> Any:
    if chat_openai_cls is None:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as cause:
            raise RuntimeError(
                "Ragas dependencies are not installed or incompatible. "
                "Run `pip install -r evals/requirements.txt` first."
            ) from cause

        chat_openai_cls = ChatOpenAI

    kwargs: dict[str, Any] = {
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model": model_config.model,
        "temperature": 0,
    }

    if is_deepseek_judge(model_config):
        kwargs["extra_body"] = {"thinking": {"type": model_config.judge_thinking}}

    return chat_openai_cls(**kwargs)


def is_deepseek_judge(model_config: RagasModelConfig) -> bool:
    host = urlparse(model_config.base_url).netloc.casefold()
    model = model_config.model.casefold()

    return host.endswith("deepseek.com") or model.startswith("deepseek-")


def read_judge_thinking() -> str:
    value = os.getenv("ZETA_EVAL_JUDGE_THINKING", DEFAULT_RAGAS_JUDGE_THINKING)
    normalized = value.strip().lower()

    if normalized not in {"enabled", "disabled"}:
        raise RuntimeError(
            "ZETA_EVAL_JUDGE_THINKING must be either `enabled` or `disabled`."
        )

    return normalized


def load_cases(path: Path) -> list[EvaluationCase]:
    if not path.exists():
        raise FileNotFoundError(f"Evaluation dataset does not exist: {path}")

    cases: list[EvaluationCase] = []

    with path.open(encoding="utf-8") as dataset:
        for line_number, line in enumerate(dataset, start=1):
            text = line.strip()

            if not text:
                continue

            payload = json.loads(text)
            cases.append(parse_case(payload, line_number))

    if not cases:
        raise ValueError(f"Evaluation dataset is empty: {path}")

    return cases


def parse_case(payload: dict[str, Any], line_number: int) -> EvaluationCase:
    question = read_required_string(payload, "question", line_number)
    reference = read_required_string(payload, "reference", line_number)
    case_id = str(payload.get("case_id") or payload.get("id") or f"case-{line_number}")
    top_k = payload.get("topK", payload.get("top_k"))

    expected_documents = [
        str(document)
        for document in payload.get("expected_documents", [])
        if str(document).strip()
    ]

    return EvaluationCase(
        case_id=case_id,
        question=question,
        reference=reference,
        expected_documents=expected_documents,
        agent_id=read_optional_string(payload, "agent_id"),
        top_k=int(top_k) if top_k else None,
    )


def run_case(
    client: ZetaClient,
    case: EvaluationCase,
    default_agent_id: str | None,
    default_top_k: int,
) -> EvaluationCaseResult:
    agent_id = case.agent_id or default_agent_id
    top_k = case.top_k or default_top_k

    if not agent_id:
        return failed_case(case, "agent_id is required")

    try:
        chat = client.chat(agent_id, case.question, top_k)
        hits = chat.get("hits") or []
        answer = chat["assistantMessage"]["content"]
        citations = chat["assistantMessage"].get("citations") or []

        return EvaluationCaseResult(
            case_id=case.case_id,
            question=case.question,
            answer=answer,
            contexts=[format_hit_context(hit) for hit in hits if hit.get("content")],
            expected_documents=case.expected_documents,
            retrieved_documents=[
                hit.get("documentPath") or hit["documentName"]
                for hit in hits
                if hit.get("documentPath") or hit.get("documentName")
            ],
            citations_count=len(citations),
            scores={},
        )
    except Exception as cause:  # noqa: BLE001 - report every failed case
        return failed_case(case, str(cause))


def collect_case_results(
    client: ZetaClient,
    cases: list[EvaluationCase],
    default_agent_id: str | None,
    default_top_k: int,
    progress_writer: Any = print,
) -> list[EvaluationCaseResult]:
    results = []
    total_cases = len(cases)

    for index, case in enumerate(cases, start=1):
        write_progress(
            progress_writer,
            f"[Ragas] Running Zeta chat case {index}/{total_cases}: {case.case_id}",
        )
        results.append(
            run_case(
                client=client,
                case=case,
                default_agent_id=default_agent_id,
                default_top_k=default_top_k,
            )
        )

    return results


def write_progress(progress_writer: Any, message: str) -> None:
    if progress_writer is print:
        progress_writer(message, flush=True)
        return

    progress_writer(message)


def format_hit_context(hit: dict[str, Any]) -> str:
    parts = [
        read_optional_string(hit, "documentName"),
        read_optional_string(hit, "title"),
        read_optional_string(hit, "content"),
    ]
    normalized_parts = []

    for part in parts:
        if not part:
            continue

        normalized = " ".join(part.split())

        if normalized and normalized not in normalized_parts:
            normalized_parts.append(normalized)

    return "\n".join(normalized_parts)


def apply_ragas_scores(
    results: list[EvaluationCaseResult],
    cases: list[EvaluationCase],
    model_config: RagasModelConfig,
) -> list[EvaluationCaseResult]:
    candidates = [result for result in results if result.error is None]

    if not candidates:
        return results

    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import (
            answer_relevancy,
            context_precision,
            context_recall,
            faithfulness,
        )
    except ImportError as cause:
        raise RuntimeError(
            "Ragas dependencies are not installed or incompatible. "
            "Run `pip install -r evals/requirements.txt` first."
        ) from cause

    references_by_id = {case.case_id: case.reference for case in cases}
    dataset = Dataset.from_dict(
        {
            "user_input": [result.question for result in candidates],
            "response": [result.answer for result in candidates],
            "retrieved_contexts": [result.contexts for result in candidates],
            "reference": [references_by_id[result.case_id] for result in candidates],
        }
    )
    ragas_result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
        llm=create_ragas_judge_llm(model_config),
        embeddings=DashScopeTextEmbeddings(
            api_key=model_config.embedding_api_key,
            base_url=model_config.embedding_base_url,
            model=model_config.embedding_model,
        ),
    )
    score_rows = ragas_result.to_pandas().to_dict(orient="records")
    scores_by_case_id = {
        result.case_id: {
            key: float(value)
            for key, value in row.items()
            if isinstance(value, Real)
            and math.isfinite(float(value))
            and key
            not in {
                "question",
                "answer",
                "contexts",
                "ground_truth",
                "user_input",
                "response",
                "retrieved_contexts",
                "reference",
            }
        }
        for result, row in zip(candidates, score_rows, strict=True)
    }

    return [
        EvaluationCaseResult(
            case_id=result.case_id,
            question=result.question,
            answer=result.answer,
            contexts=result.contexts,
            expected_documents=result.expected_documents,
            retrieved_documents=result.retrieved_documents,
            citations_count=result.citations_count,
            scores=scores_by_case_id.get(result.case_id, result.scores),
            error=result.error,
        )
        for result in results
    ]


def write_case_csv(path: Path, results: list[EvaluationCaseResult]) -> None:
    score_names = sorted({name for result in results for name in result.scores})

    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "case_id",
                "question",
                "context_count",
                "citations_count",
                "expected_documents",
                "retrieved_documents",
                "error",
                *score_names,
            ],
        )
        writer.writeheader()

        for result in results:
            writer.writerow(
                {
                    "case_id": result.case_id,
                    "question": result.question,
                    "context_count": len(result.contexts),
                    "citations_count": result.citations_count,
                    "expected_documents": ";".join(result.expected_documents),
                    "retrieved_documents": ";".join(result.retrieved_documents),
                    "error": result.error or "",
                    **{
                        name: result.scores.get(name, "")
                        for name in score_names
                    },
                }
            )


def failed_case(case: EvaluationCase, error: str) -> EvaluationCaseResult:
    return EvaluationCaseResult(
        case_id=case.case_id,
        question=case.question,
        answer="",
        contexts=[],
        expected_documents=case.expected_documents,
        retrieved_documents=[],
        citations_count=0,
        scores={},
        error=error,
    )


def read_required_string(
    payload: dict[str, Any],
    field: str,
    line_number: int,
) -> str:
    value = payload.get(field)

    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Line {line_number}: `{field}` is required")

    return value


def read_optional_string(payload: dict[str, Any], field: str) -> str | None:
    value = payload.get(field)

    if value is None:
        return None

    if not isinstance(value, str) or not value.strip():
        return None

    return value


def read_required_env(name: str) -> str:
    value = os.getenv(name)

    if not value:
        raise RuntimeError(f"Environment variable `{name}` is required")

    return value


if __name__ == "__main__":
    main()
