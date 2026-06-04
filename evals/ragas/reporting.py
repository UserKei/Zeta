from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean


@dataclass(frozen=True)
class EvaluationRunMetadata:
    run_timestamp: str
    dataset_path: str
    agent_id: str
    agent_name: str
    knowledge_base_names: list[str]
    top_k: int
    judge_model: str
    judge_base_url: str
    embedding_model: str
    embedding_base_url: str
    rerank_enabled: bool
    git_commit: str
    corpus_preset: str
    corpus_limit: str
    corpus_source_ref: str


@dataclass(frozen=True)
class EvaluationBaseline:
    name: str
    metrics: dict[str, float]


@dataclass(frozen=True)
class EvaluationCaseResult:
    case_id: str
    question: str
    answer: str
    contexts: list[str]
    expected_documents: list[str]
    retrieved_documents: list[str]
    citations_count: int
    scores: dict[str, float]
    error: str | None = None


@dataclass(frozen=True)
class EvaluationSummary:
    total_cases: int
    succeeded_cases: int
    failed_cases: int
    expected_document_hit_rate: float | None
    average_context_count: float
    average_unique_retrieved_documents: float
    average_duplicate_document_slots: float
    empty_answer_count: int
    empty_citation_count: int
    average_scores: dict[str, float] = field(default_factory=dict)
    failures: list[EvaluationCaseResult] = field(default_factory=list)
    single_document_cases: list[EvaluationCaseResult] = field(default_factory=list)
    lowest_context_precision_cases: list[EvaluationCaseResult] = field(
        default_factory=list
    )


def build_summary(results: list[EvaluationCaseResult]) -> EvaluationSummary:
    total_cases = len(results)
    succeeded_cases = sum(1 for result in results if result.error is None)
    failed_cases = total_cases - succeeded_cases
    expected_hits = [
        has_expected_document_hit(result.expected_documents, result.retrieved_documents)
        for result in results
        if result.expected_documents
    ]

    score_names = sorted({name for result in results for name in result.scores})
    average_scores = {
        name: mean(result.scores[name] for result in results if name in result.scores)
        for name in score_names
    }
    retrieved_results = [result for result in results if result.retrieved_documents]
    context_precision_results = [
        result
        for result in results
        if isinstance(result.scores.get("context_precision"), float)
    ]

    return EvaluationSummary(
        total_cases=total_cases,
        succeeded_cases=succeeded_cases,
        failed_cases=failed_cases,
        expected_document_hit_rate=mean(expected_hits) if expected_hits else None,
        average_context_count=mean(len(result.contexts) for result in results)
        if results
        else 0.0,
        average_unique_retrieved_documents=mean(
            count_unique_retrieved_documents(result.retrieved_documents)
            for result in retrieved_results
        )
        if retrieved_results
        else 0.0,
        average_duplicate_document_slots=mean(
            count_duplicate_document_slots(result.retrieved_documents)
            for result in retrieved_results
        )
        if retrieved_results
        else 0.0,
        empty_answer_count=sum(1 for result in results if not result.answer.strip()),
        empty_citation_count=sum(1 for result in results if result.citations_count == 0),
        average_scores=average_scores,
        failures=[result for result in results if result.error is not None],
        single_document_cases=[
            result
            for result in results
            if len(result.retrieved_documents) > 1
            and count_unique_retrieved_documents(result.retrieved_documents) == 1
        ],
        lowest_context_precision_cases=sorted(
            context_precision_results,
            key=lambda result: result.scores["context_precision"],
        )[:10],
    )


def render_markdown_report(
    summary: EvaluationSummary,
    metadata: EvaluationRunMetadata | None = None,
    baseline: EvaluationBaseline | None = None,
    ragas_error: str | None = None,
) -> str:
    lines = [
        "# Zeta RAG Evaluation Report",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Total cases | {summary.total_cases} |",
        f"| Succeeded cases | {summary.succeeded_cases} |",
        f"| Failed cases | {summary.failed_cases} |",
        f"| Expected document hit rate | {format_optional_score(summary.expected_document_hit_rate)} |",
        f"| Average context count | {summary.average_context_count:.2f} |",
        f"| Empty answers | {summary.empty_answer_count} |",
        f"| Empty citations | {summary.empty_citation_count} |",
    ]

    if metadata:
        lines.extend(render_metadata_section(metadata))

    lines.extend(
        [
            "",
            "## Ragas Scores",
            "",
            "| Metric | Average |",
            "| --- | ---: |",
        ]
    )

    if summary.average_scores:
        for name, score in summary.average_scores.items():
            lines.append(f"| {name} | {score:.4f} |")
    else:
        lines.append("| No Ragas score | - |")

    if baseline:
        lines.extend(render_baseline_section(summary, baseline))

    lines.extend(
        [
            "",
            "## Retrieval Diagnostics",
            "",
            "| Metric | Value |",
            "| --- | ---: |",
            f"| Average unique retrieved documents | {summary.average_unique_retrieved_documents:.2f} |",
            f"| Average duplicate document slots | {summary.average_duplicate_document_slots:.2f} |",
            f"| Single-document topK cases | {len(summary.single_document_cases)} |",
        ]
    )

    if summary.single_document_cases:
        lines.extend(
            [
                "",
                "Single-document cases:",
                "",
                *[
                    f"- `{result.case_id}`"
                    for result in summary.single_document_cases[:10]
                ],
            ]
        )

    lines.extend(["", "## Lowest Context Precision Cases", ""])

    if summary.lowest_context_precision_cases:
        lines.extend(
            [
                "| Case | context_precision | context_recall | Expected documents | Retrieved documents |",
                "| --- | ---: | ---: | --- | --- |",
            ]
        )

        for result in summary.lowest_context_precision_cases:
            lines.append(
                "| "
                f"`{result.case_id}` | "
                f"{result.scores['context_precision']:.4f} | "
                f"{format_optional_score(result.scores.get('context_recall'))} | "
                f"{format_document_list(result.expected_documents)} | "
                f"{format_document_list(unique_documents_in_order(result.retrieved_documents))} |"
            )
    else:
        lines.append("No context precision scores.")

    if ragas_error:
        lines.extend(
            [
                "",
                "## Ragas Status",
                "",
                f"Ragas scoring failed: {ragas_error}",
            ]
        )

    lines.extend(["", "## Failures", ""])

    if summary.failures:
        for failure in summary.failures:
            lines.extend(
                [
                    f"- `{failure.case_id}`: {failure.error or 'unknown error'}",
                ]
            )
    else:
        lines.append("No failed cases.")

    lines.append("")

    return "\n".join(lines)


def render_metadata_section(metadata: EvaluationRunMetadata) -> list[str]:
    return [
        "",
        "## Run Metadata",
        "",
        "| Field | Value |",
        "| --- | --- |",
        f"| Run timestamp | {metadata.run_timestamp} |",
        f"| Dataset | {metadata.dataset_path} |",
        f"| Agent | {metadata.agent_name} (`{metadata.agent_id}`) |",
        f"| Knowledge bases | {format_plain_list(metadata.knowledge_base_names)} |",
        f"| TopK | {metadata.top_k} |",
        f"| Judge model | {metadata.judge_model} |",
        f"| Judge base URL | {metadata.judge_base_url} |",
        f"| Embedding evaluator model | {metadata.embedding_model} |",
        f"| Embedding evaluator base URL | {metadata.embedding_base_url} |",
        f"| Rerank enabled | {format_bool(metadata.rerank_enabled)} |",
        f"| Git commit | {metadata.git_commit} |",
        f"| Corpus preset | {metadata.corpus_preset} |",
        f"| Corpus limit | {metadata.corpus_limit} |",
        f"| Corpus source ref | {metadata.corpus_source_ref} |",
    ]


def render_baseline_section(
    summary: EvaluationSummary,
    baseline: EvaluationBaseline,
) -> list[str]:
    current_metrics = summary_metric_values(summary)
    lines = [
        "",
        "## Baseline Comparison",
        "",
        f"Baseline: `{baseline.name}`",
        "",
        "| Metric | Current | Baseline | Delta |",
        "| --- | ---: | ---: | ---: |",
    ]

    for metric_name in sorted(baseline.metrics):
        current_value = current_metrics.get(metric_name)

        if current_value is None:
            continue

        baseline_value = baseline.metrics[metric_name]
        lines.append(
            "| "
            f"{metric_name} | "
            f"{current_value:.4f} | "
            f"{baseline_value:.4f} | "
            f"{format_delta(current_value - baseline_value)} |"
        )

    if len(lines) == 7:
        lines.append("| No comparable metric | - | - | - |")

    return lines


def summary_metric_values(summary: EvaluationSummary) -> dict[str, float]:
    values = {
        "average_context_count": summary.average_context_count,
        "average_unique_retrieved_documents": (
            summary.average_unique_retrieved_documents
        ),
        "average_duplicate_document_slots": summary.average_duplicate_document_slots,
    }

    if summary.expected_document_hit_rate is not None:
        values["expected_document_hit_rate"] = summary.expected_document_hit_rate

    values.update(summary.average_scores)

    return values


def has_expected_document_hit(
    expected_documents: list[str],
    retrieved_documents: list[str],
) -> bool:
    expected = {
        normalize_document_key(document)
        for document in expected_documents
        if document.strip()
    }
    retrieved = {
        normalize_document_key(document)
        for document in retrieved_documents
        if document.strip()
    }

    return bool(expected & retrieved)


def count_unique_retrieved_documents(retrieved_documents: list[str]) -> int:
    return len(
        {
            normalize_document_key(document)
            for document in retrieved_documents
            if document.strip()
        }
    )


def count_duplicate_document_slots(retrieved_documents: list[str]) -> int:
    document_count = sum(1 for document in retrieved_documents if document.strip())
    return document_count - count_unique_retrieved_documents(retrieved_documents)


def unique_documents_in_order(documents: list[str]) -> list[str]:
    seen = set()
    unique_documents = []

    for document in documents:
        normalized = normalize_document_key(document)

        if not normalized or normalized in seen:
            continue

        seen.add(normalized)
        unique_documents.append(document)

    return unique_documents


def normalize_document_key(document: str) -> str:
    return document.strip().casefold()


def format_optional_score(score: float | None) -> str:
    return "-" if score is None else f"{score:.4f}"


def format_delta(delta: float) -> str:
    sign = "+" if delta >= 0 else ""

    return f"{sign}{delta:.4f}"


def format_bool(value: bool) -> str:
    return "yes" if value else "no"


def format_plain_list(values: list[str]) -> str:
    return ", ".join(values) if values else "-"


def format_document_list(documents: list[str]) -> str:
    if not documents:
        return "-"

    return "; ".join(f"`{document}`" for document in documents)
