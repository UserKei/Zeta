from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean


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
    empty_answer_count: int
    empty_citation_count: int
    average_scores: dict[str, float] = field(default_factory=dict)
    failures: list[EvaluationCaseResult] = field(default_factory=list)


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

    return EvaluationSummary(
        total_cases=total_cases,
        succeeded_cases=succeeded_cases,
        failed_cases=failed_cases,
        expected_document_hit_rate=mean(expected_hits) if expected_hits else None,
        average_context_count=mean(len(result.contexts) for result in results)
        if results
        else 0.0,
        empty_answer_count=sum(1 for result in results if not result.answer.strip()),
        empty_citation_count=sum(1 for result in results if result.citations_count == 0),
        average_scores=average_scores,
        failures=[result for result in results if result.error is not None],
    )


def render_markdown_report(
    summary: EvaluationSummary,
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
        "",
        "## Ragas Scores",
        "",
        "| Metric | Average |",
        "| --- | ---: |",
    ]

    if summary.average_scores:
        for name, score in summary.average_scores.items():
            lines.append(f"| {name} | {score:.4f} |")
    else:
        lines.append("| No Ragas score | - |")

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


def normalize_document_key(document: str) -> str:
    return document.strip().casefold()


def format_optional_score(score: float | None) -> str:
    return "-" if score is None else f"{score:.4f}"
