from __future__ import annotations

import argparse
import csv
import json
import math
import os
from dataclasses import dataclass
from datetime import datetime
from numbers import Real
from pathlib import Path
from typing import Any

from evals.ragas.reporting import (
    EvaluationCaseResult,
    build_summary,
    render_markdown_report,
)
from evals.ragas.dashscope_embeddings import (
    DEFAULT_DASHSCOPE_API_BASE_URL,
    DashScopeTextEmbeddings,
)
from evals.shared.zeta_client import ZetaClient

DEFAULT_KNOWLEDGE_BASE_NAME = "GitLab Handbook"
DEFAULT_AGENT_NAME = "GitLab Handbook Expert"
DEFAULT_DASHSCOPE_OPENAI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_RAGAS_JUDGE_MODEL = "qwen-plus"
DEFAULT_RAGAS_EMBEDDING_MODEL = "text-embedding-v4"

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
    knowledge_base_id: str | None = None
    agent_id: str | None = None
    top_k: int | None = None


@dataclass(frozen=True)
class EvaluationTargets:
    knowledge_base_id: str
    agent_id: str


@dataclass(frozen=True)
class RagasModelConfig:
    api_key: str
    base_url: str
    model: str
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
        knowledge_base_id=args.knowledge_base_id,
        agent_id=args.agent_id,
        knowledge_base_name=os.getenv(
            "ZETA_EVAL_KNOWLEDGE_BASE_NAME",
            DEFAULT_KNOWLEDGE_BASE_NAME,
        ),
        agent_name=os.getenv("ZETA_EVAL_AGENT_NAME", DEFAULT_AGENT_NAME),
    )

    results = [
        run_case(
            client=client,
            case=case,
            default_knowledge_base_id=targets.knowledge_base_id,
            default_agent_id=targets.agent_id,
            default_top_k=args.top_k,
        )
        for case in cases
    ]

    ragas_error = None

    try:
        scored_results = apply_ragas_scores(
            results,
            cases,
            read_ragas_model_config(),
        )
    except Exception as cause:  # noqa: BLE001 - still write the base report
        ragas_error = str(cause)
        scored_results = results

    summary = build_summary(scored_results)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    markdown_path = report_dir / f"ragas-report-{timestamp}.md"
    csv_path = report_dir / f"ragas-report-{timestamp}.csv"

    markdown_path.write_text(
        render_markdown_report(summary, ragas_error=ragas_error),
        encoding="utf-8",
    )
    write_case_csv(csv_path, scored_results)

    print(f"Markdown report: {markdown_path}")
    print(f"Case CSV: {csv_path}")


def load_environment() -> None:
    load_dotenv(Path(".env"))


def resolve_evaluation_targets(
    client: ZetaClient,
    knowledge_base_id: str | None,
    agent_id: str | None,
    knowledge_base_name: str,
    agent_name: str,
) -> EvaluationTargets:
    resolved_knowledge_base_id = knowledge_base_id or find_resource_id_by_name(
        client.list_knowledge_bases(),
        knowledge_base_name,
        resource_label="knowledge base",
    )
    resolved_agent_id = agent_id or find_resource_id_by_name(
        client.list_agents(),
        agent_name,
        resource_label="agent",
    )

    return EvaluationTargets(
        knowledge_base_id=resolved_knowledge_base_id,
        agent_id=resolved_agent_id,
    )


def find_resource_id_by_name(
    resources: list[dict[str, Any]],
    name: str,
    resource_label: str,
) -> str:
    for resource in resources:
        if resource.get("name") == name and isinstance(resource.get("id"), str):
            return resource["id"]

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
        help="Default knowledge base id for retrieval-test",
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

    return parser.parse_args()


def read_ragas_model_config() -> RagasModelConfig:
    api_key = (
        os.getenv("ZETA_EVAL_JUDGE_API_KEY")
        or os.getenv("DASHSCOPE_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )

    if not api_key:
        raise RuntimeError(
            "DASHSCOPE_API_KEY or ZETA_EVAL_JUDGE_API_KEY is required "
            "for Ragas scoring."
        )

    base_url = os.getenv("ZETA_EVAL_JUDGE_BASE_URL") or DEFAULT_DASHSCOPE_OPENAI_BASE_URL
    embedding_api_key = os.getenv("ZETA_EVAL_EMBEDDING_API_KEY") or api_key
    embedding_base_url = (
        os.getenv("ZETA_EVAL_EMBEDDING_BASE_URL")
        or DEFAULT_DASHSCOPE_API_BASE_URL
    )

    return RagasModelConfig(
        api_key=api_key,
        base_url=base_url,
        model=os.getenv("ZETA_EVAL_JUDGE_MODEL", DEFAULT_RAGAS_JUDGE_MODEL),
        embedding_api_key=embedding_api_key,
        embedding_base_url=embedding_base_url,
        embedding_model=os.getenv(
            "ZETA_EVAL_EMBEDDING_MODEL",
            DEFAULT_RAGAS_EMBEDDING_MODEL,
        ),
    )


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
    case_id = str(payload.get("id") or f"case-{line_number}")

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
        knowledge_base_id=read_optional_string(payload, "knowledge_base_id"),
        agent_id=read_optional_string(payload, "agent_id"),
        top_k=int(payload["top_k"]) if payload.get("top_k") else None,
    )


def run_case(
    client: ZetaClient,
    case: EvaluationCase,
    default_knowledge_base_id: str | None,
    default_agent_id: str | None,
    default_top_k: int,
) -> EvaluationCaseResult:
    knowledge_base_id = case.knowledge_base_id or default_knowledge_base_id
    agent_id = case.agent_id or default_agent_id
    top_k = case.top_k or default_top_k

    if not knowledge_base_id:
        return failed_case(case, "knowledge_base_id is required")

    if not agent_id:
        return failed_case(case, "agent_id is required")

    try:
        retrieval = client.retrieval_test(knowledge_base_id, case.question, top_k)
        chat = client.chat(agent_id, case.question, top_k)
        hits = chat.get("hits") or retrieval.get("hits") or []
        answer = chat["assistantMessage"]["content"]
        citations = chat["assistantMessage"].get("citations") or []

        return EvaluationCaseResult(
            case_id=case.case_id,
            question=case.question,
            answer=answer,
            contexts=[hit["content"] for hit in hits if hit.get("content")],
            expected_documents=case.expected_documents,
            retrieved_documents=[
                hit["documentName"] for hit in hits if hit.get("documentName")
            ],
            citations_count=len(citations),
            scores={},
        )
    except Exception as cause:  # noqa: BLE001 - report every failed case
        return failed_case(case, str(cause))


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
        from langchain_openai import ChatOpenAI
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
        llm=ChatOpenAI(
            api_key=model_config.api_key,
            base_url=model_config.base_url,
            model=model_config.model,
            temperature=0,
        ),
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
