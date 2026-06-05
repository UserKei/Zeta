from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path


RAGAS_REPORT_PATTERN = re.compile(r"ragas-report-(\d{8})-(\d{6})\.md$")
DEEPEVAL_JSON_REPORT_PATTERN = re.compile(
    r"deepeval-report-(\d{8})-(\d{6})\.json$"
)
RAGAS_SCORE_NAMES = (
    "answer_relevancy",
    "context_precision",
    "context_recall",
    "faithfulness",
)


@dataclass(frozen=True)
class RagasReportEntry:
    markdown_path: Path
    csv_path: Path | None
    source: str
    display_time: str
    scores: dict[str, str]
    summary: dict[str, str]


@dataclass(frozen=True)
class DeepEvalReportEntry:
    json_path: Path
    html_path: Path | None
    source: str
    display_time: str
    scores: dict[str, str]
    total_cases: str
    passed_cases: str
    failed_cases: str
    run_duration: str
    metric_summaries: list[dict[str, str]]
    cases: list[dict[str, object]]


def main() -> None:
    args = parse_args()
    export_ragas_reports_for_docs(
        reports_dir=Path(args.reports_dir),
        docs_site_dir=Path(args.docs_site_dir),
        published_ragas_dir=Path(args.published_ragas_dir),
        published_deepeval_dir=Path(args.published_deepeval_dir),
        include_local_reports=args.include_local,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export Ragas reports into the VitePress documentation site."
    )
    parser.add_argument(
        "--reports-dir",
        default="evals/reports",
        help="Directory containing ragas-report-*.md and ragas-report-*.csv files.",
    )
    parser.add_argument(
        "--docs-site-dir",
        default="apps/docs-site",
        help="VitePress documentation site directory.",
    )
    parser.add_argument(
        "--published-ragas-dir",
        default="evals/published-reports/ragas",
        help="Tracked Ragas reports that should always be published to the docs site.",
    )
    parser.add_argument(
        "--published-deepeval-dir",
        default="evals/published-reports/deepeval",
        help=(
            "Tracked DeepEval JSON reports that should always be published "
            "to the docs site."
        ),
    )
    parser.add_argument(
        "--include-local",
        action="store_true",
        default=parse_bool_env("ZETA_DOCS_INCLUDE_LOCAL_REPORTS"),
        help=(
            "Also include untracked local reports from --reports-dir. "
            "Default docs output only uses published reports."
        ),
    )

    return parser.parse_args()


def parse_bool_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def export_ragas_reports_for_docs(
    reports_dir: Path,
    docs_site_dir: Path,
    published_ragas_dir: Path | None = None,
    published_deepeval_dir: Path | None = None,
    include_local_reports: bool = False,
) -> None:
    ragas_public_dir = docs_site_dir / "public" / "eval-reports" / "ragas"
    deepeval_public_dir = docs_site_dir / "public" / "eval-reports" / "deepeval"
    report_pages_dir = docs_site_dir / "eval-reports"
    deepeval_pages_dir = report_pages_dir / "deepeval"

    reset_generated_directory(ragas_public_dir)
    reset_generated_directory(deepeval_public_dir)
    reset_generated_directory(deepeval_pages_dir)
    report_pages_dir.mkdir(parents=True, exist_ok=True)
    (ragas_public_dir / ".gitkeep").touch()
    (deepeval_public_dir / ".gitkeep").touch()

    ragas_report_sources = build_report_sources(
        local_dir=reports_dir,
        published_dir=published_ragas_dir,
        include_local_reports=include_local_reports,
    )
    deepeval_report_sources = build_report_sources(
        local_dir=reports_dir,
        published_dir=published_deepeval_dir,
        include_local_reports=include_local_reports,
    )
    entries = read_ragas_report_entries(*ragas_report_sources)
    deepeval_entries = read_deepeval_report_entries(*deepeval_report_sources)

    for entry in entries:
        shutil.copy2(entry.markdown_path, ragas_public_dir / entry.markdown_path.name)

        if entry.csv_path:
            shutil.copy2(entry.csv_path, ragas_public_dir / entry.csv_path.name)

    for entry in deepeval_entries:
        shutil.copy2(entry.json_path, deepeval_public_dir / entry.json_path.name)

    write_ragas_index_page(report_pages_dir / "index.md", entries, deepeval_entries)
    write_latest_ragas_page(report_pages_dir / "latest.md", entries)
    write_deepeval_report_pages(deepeval_pages_dir, deepeval_entries)


def reset_generated_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)

    for child in path.iterdir():
        if child.name == ".gitkeep":
            continue

        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def build_report_sources(
    local_dir: Path,
    published_dir: Path | None,
    include_local_reports: bool,
) -> list[tuple[Path | None, str]]:
    sources: list[tuple[Path | None, str]] = []

    if include_local_reports:
        sources.append((local_dir, "local"))

    if published_dir:
        sources.append((published_dir, "published"))

    return sources


def read_ragas_report_entries(
    *report_sources: tuple[Path | None, str],
) -> list[RagasReportEntry]:
    markdown_paths: dict[str, tuple[Path, str]] = {}

    for reports_dir, source in report_sources:
        if not reports_dir or not reports_dir.exists():
            continue

        for markdown_path in sorted(reports_dir.glob("ragas-report-*.md")):
            if RAGAS_REPORT_PATTERN.match(markdown_path.name):
                markdown_paths[markdown_path.name] = (markdown_path, source)

    entries = [
        parse_ragas_report(path, source) for path, source in markdown_paths.values()
    ]

    return sorted(entries, key=lambda entry: entry.display_time, reverse=True)


def read_deepeval_report_entries(
    *report_sources: tuple[Path | None, str],
) -> list[DeepEvalReportEntry]:
    json_paths: dict[str, tuple[Path, str]] = {}

    for reports_dir, source in report_sources:
        if not reports_dir or not reports_dir.exists():
            continue

        for json_path in sorted(reports_dir.glob("deepeval-report-*.json")):
            if DEEPEVAL_JSON_REPORT_PATTERN.match(json_path.name):
                json_paths[json_path.name] = (json_path, source)

    entries = [
        parse_deepeval_report(path, source) for path, source in json_paths.values()
    ]

    return sorted(entries, key=lambda entry: entry.display_time, reverse=True)


def parse_ragas_report(markdown_path: Path, source: str) -> RagasReportEntry:
    match = RAGAS_REPORT_PATTERN.match(markdown_path.name)

    if not match:
        raise ValueError(f"Invalid Ragas report filename: {markdown_path.name}")

    date_part, time_part = match.groups()
    display_time = (
        f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:]} "
        f"{time_part[:2]}:{time_part[2:4]}:{time_part[4:]}"
    )
    csv_path = markdown_path.with_suffix(".csv")

    return RagasReportEntry(
        markdown_path=markdown_path,
        csv_path=csv_path if csv_path.exists() else None,
        source=source,
        display_time=display_time,
        **parse_ragas_markdown(markdown_path.read_text(encoding="utf-8")),
    )


def parse_deepeval_report(json_path: Path, source: str) -> DeepEvalReportEntry:
    match = DEEPEVAL_JSON_REPORT_PATTERN.match(json_path.name)

    if not match:
        raise ValueError(f"Invalid DeepEval report filename: {json_path.name}")

    date_part, time_part = match.groups()
    display_time = (
        f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:]} "
        f"{time_part[:2]}:{time_part[2:4]}:{time_part[4:]}"
    )
    html_path = json_path.with_suffix(".html")

    return DeepEvalReportEntry(
        json_path=json_path,
        html_path=html_path if html_path.exists() else None,
        source=source,
        display_time=display_time,
        **parse_deepeval_json(json_path),
    )


def parse_ragas_markdown(markdown: str) -> dict[str, dict[str, str]]:
    table_values = parse_two_column_markdown_tables(markdown)

    return {
        "scores": {name: table_values.get(name, "-") for name in RAGAS_SCORE_NAMES},
        "summary": table_values,
    }


def parse_two_column_markdown_tables(markdown: str) -> dict[str, str]:
    values: dict[str, str] = {}

    for line in markdown.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]

        if len(cells) != 2:
            continue

        name, value = cells

        if not name or name == "---" or name.lower() == "metric":
            continue

        values[name] = value

    return values


def parse_deepeval_json(json_path: Path) -> dict[str, object]:
    scores = {name: "-" for name in RAGAS_SCORE_NAMES}
    data = json.loads(json_path.read_text(encoding="utf-8"))
    metric_map = {
        "Answer Relevancy": "answer_relevancy",
        "Contextual Precision": "context_precision",
        "Contextual Recall": "context_recall",
        "Faithfulness": "faithfulness",
    }
    metric_summaries: list[dict[str, str]] = []

    for metric in data.get("metricsScores", []):
        display_name = str(metric.get("metric", ""))
        metric_name = metric_map.get(display_name)

        if not metric_name:
            continue

        metric_scores = [
            score for score in metric.get("scores", []) if isinstance(score, int | float)
        ]
        scores[metric_name] = (
            f"{sum(metric_scores) / len(metric_scores):.4f}" if metric_scores else "-"
        )
        metric_summaries.append(
            {
                "name": display_name,
                "average": scores[metric_name],
                "passes": format_unknown(metric.get("passes")),
                "fails": format_unknown(metric.get("fails")),
                "errors": format_unknown(metric.get("errors")),
            }
        )

    passed_cases = data.get("testPassed", "-")
    failed_cases = data.get("testFailed", "-")
    total_cases = len(data.get("testCases", []))

    return {
        "scores": scores,
        "total_cases": str(total_cases) if total_cases else "-",
        "passed_cases": str(passed_cases),
        "failed_cases": str(failed_cases),
        "run_duration": format_duration(data.get("runDuration")),
        "metric_summaries": metric_summaries,
        "cases": parse_deepeval_cases(data.get("testCases", [])),
    }


def parse_deepeval_cases(raw_cases: object) -> list[dict[str, object]]:
    if not isinstance(raw_cases, list):
        return []

    cases: list[dict[str, object]] = []

    for index, raw_case in enumerate(raw_cases, start=1):
        if not isinstance(raw_case, dict):
            continue

        metrics = parse_deepeval_case_metrics(raw_case.get("metricsData", []))
        cases.append(
            {
                "index": str(index),
                "name": format_unknown(raw_case.get("name")),
                "input": format_unknown(raw_case.get("input")),
                "actual_output": format_unknown(raw_case.get("actualOutput")),
                "expected_output": format_unknown(raw_case.get("expectedOutput")),
                "success": "通过" if raw_case.get("success") else "未通过",
                "context_count": str(
                    len(raw_case.get("retrievalContext", []))
                    if isinstance(raw_case.get("retrievalContext"), list)
                    else 0
                ),
                "metrics": metrics,
            }
        )

    return cases


def parse_deepeval_case_metrics(raw_metrics: object) -> list[dict[str, str]]:
    if not isinstance(raw_metrics, list):
        return []

    metrics: list[dict[str, str]] = []

    for raw_metric in raw_metrics:
        if not isinstance(raw_metric, dict):
            continue

        metrics.append(
            {
                "name": format_unknown(raw_metric.get("name")),
                "score": format_score(raw_metric.get("score")),
                "success": "通过" if raw_metric.get("success") else "未通过",
                "reason": format_unknown(raw_metric.get("reason")),
            }
        )

    return metrics


def format_score(value: object) -> str:
    return f"{value:.4f}" if isinstance(value, int | float) else "-"


def format_duration(value: object) -> str:
    return f"{value:.2f}s" if isinstance(value, int | float) else "-"


def format_unknown(value: object) -> str:
    return str(value) if value is not None else "-"


def write_ragas_index_page(
    path: Path,
    entries: list[RagasReportEntry],
    deepeval_entries: list[DeepEvalReportEntry],
) -> None:
    lines = [
        "# 评测报告",
        "",
        "本页由 `pnpm docs:reports` 从 `evals/published-reports/` 生成，用于在交付文档站中展示离线 RAG 评测结果。",
        "",
    ]

    append_report_overview(lines, entries, deepeval_entries)
    lines.extend(
        [
            "",
            "> [!NOTE]",
            "> 本地临时报告仍保留在 `evals/reports/`。文档站默认只发布 `evals/published-reports/` 中的基准报告；如需本地诊断，可使用 `pnpm docs:reports --include-local` 或 `ZETA_DOCS_INCLUDE_LOCAL_REPORTS=1 pnpm docs:reports`。",
            "",
        ]
    )

    if not entries:
        lines.extend(["暂时还没有可展示的 Ragas 报告。", ""])
        append_deepeval_status(lines, deepeval_entries)
        path.write_text("\n".join(lines), encoding="utf-8")
        return

    lines.extend(
        [
            "## Ragas",
            "",
            "[查看最新 Ragas 报告](./latest)",
            "",
            "| 运行时间 | 来源 | answer_relevancy | context_precision | context_recall | faithfulness | Markdown | CSV |",
            "| --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
        ]
    )

    for entry in entries:
        markdown_link = f'<a href="./ragas/{entry.markdown_path.name}">md</a>'
        csv_link = (
            f'<a href="./ragas/{entry.csv_path.name}">csv</a>'
            if entry.csv_path
            else "-"
        )
        lines.append(
            "| "
            f"{entry.display_time} | "
            f"{entry.source} | "
            f"{entry.scores['answer_relevancy']} | "
            f"{entry.scores['context_precision']} | "
            f"{entry.scores['context_recall']} | "
            f"{entry.scores['faithfulness']} | "
            f"{markdown_link} | "
            f"{csv_link} |"
        )

    lines.append("")
    append_deepeval_status(lines, deepeval_entries)
    path.write_text("\n".join(lines), encoding="utf-8")


def append_deepeval_status(
    lines: list[str],
    entries: list[DeepEvalReportEntry],
) -> None:
    lines.extend(["## DeepEval", ""])

    if not entries:
        lines.extend(
            [
                "暂时还没有可展示的 DeepEval 报告。",
                "",
            ]
        )
        return

    lines.extend(
        [
            "| 运行时间 | 来源 | 通过 | answer_relevancy | context_precision | context_recall | faithfulness | 报告 | JSON |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
        ]
    )

    for entry in entries:
        report_link = f"[查看](./deepeval/{entry.json_path.stem})"
        json_link = f'<a href="./deepeval/{entry.json_path.name}">json</a>'
        lines.append(
            "| "
            f"{entry.display_time} | "
            f"{entry.source} | "
            f"{entry.passed_cases}/{entry.total_cases} | "
            f"{entry.scores['answer_relevancy']} | "
            f"{entry.scores['context_precision']} | "
            f"{entry.scores['context_recall']} | "
            f"{entry.scores['faithfulness']} | "
            f"{report_link} | "
            f"{json_link} |"
        )

    lines.append("")


def append_report_overview(
    lines: list[str],
    ragas_entries: list[RagasReportEntry],
    deepeval_entries: list[DeepEvalReportEntry],
) -> None:
    latest_ragas = ragas_entries[0] if ragas_entries else None
    latest_deepeval = deepeval_entries[0] if deepeval_entries else None

    if not latest_ragas and not latest_deepeval:
        lines.extend(["暂时还没有可展示的评测报告。", ""])
        return

    lines.extend(
        [
            "| 报告 | 运行时间 | 来源 | 用例 / 通过 | answer_relevancy | context_precision | context_recall | faithfulness | 详情 |",
            "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
        ]
    )

    if latest_ragas:
        total = latest_ragas.summary.get("Total cases", "-")
        succeeded = latest_ragas.summary.get("Succeeded cases", "-")
        lines.append(
            "| "
            f"[Ragas](#ragas) | "
            f"{latest_ragas.display_time} | "
            f"{latest_ragas.source} | "
            f"{succeeded}/{total} | "
            f"{latest_ragas.scores['answer_relevancy']} | "
            f"{latest_ragas.scores['context_precision']} | "
            f"{latest_ragas.scores['context_recall']} | "
            f"{latest_ragas.scores['faithfulness']} | "
            "[最新报告](./latest) |"
        )

    if latest_deepeval:
        lines.append(
            "| "
            f"[DeepEval](#deepeval) | "
            f"{latest_deepeval.display_time} | "
            f"{latest_deepeval.source} | "
            f"{latest_deepeval.passed_cases}/{latest_deepeval.total_cases} | "
            f"{latest_deepeval.scores['answer_relevancy']} | "
            f"{latest_deepeval.scores['context_precision']} | "
            f"{latest_deepeval.scores['context_recall']} | "
            f"{latest_deepeval.scores['faithfulness']} | "
            f"[最新报告](./deepeval/{latest_deepeval.json_path.stem}) |"
        )


def write_deepeval_report_pages(
    report_pages_dir: Path,
    entries: list[DeepEvalReportEntry],
) -> None:
    report_pages_dir.mkdir(parents=True, exist_ok=True)

    for entry in entries:
        path = report_pages_dir / f"{entry.json_path.stem}.md"
        path.write_text(build_deepeval_markdown(entry), encoding="utf-8")


def build_deepeval_markdown(entry: DeepEvalReportEntry) -> str:
    lines = [
        "# DeepEval 报告",
        "",
        f"- 运行时间：{entry.display_time}",
        f"- 来源：{entry.source}",
        f"- 用例通过：{entry.passed_cases}/{entry.total_cases}",
        f"- 失败用例：{entry.failed_cases}",
        f"- 运行耗时：{entry.run_duration}",
        f'- 原始 JSON：<a href="./{entry.json_path.name}">{entry.json_path.name}</a>',
        "",
        "## 指标概览",
        "",
        "| 指标 | 平均分 | 通过 | 失败 | 错误 |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]

    for metric in entry.metric_summaries:
        lines.append(
            "| "
            f"{escape_markdown_table_cell(metric['name'])} | "
            f"{metric['average']} | "
            f"{metric['passes']} | "
            f"{metric['fails']} | "
            f"{metric['errors']} |"
        )

    lines.extend(["", "## 用例明细", ""])

    if not entry.cases:
        lines.extend(["暂无用例明细。", ""])
        return "\n".join(lines)

    lines.extend(
        [
            "| # | 结果 | 问题 | answer_relevancy | faithfulness | context_precision | context_recall |",
            "| ---: | --- | --- | ---: | ---: | ---: | ---: |",
        ]
    )

    for case in entry.cases:
        metric_scores = case_metric_scores(case)
        lines.append(
            "| "
            f"{case['index']} | "
            f"{case['success']} | "
            f"{escape_markdown_table_cell(case['input'])} | "
            f"{metric_scores['answer_relevancy']} | "
            f"{metric_scores['faithfulness']} | "
            f"{metric_scores['context_precision']} | "
            f"{metric_scores['context_recall']} |"
        )

    failed_cases = [case for case in entry.cases if case["success"] != "通过"]

    if failed_cases:
        lines.extend(["", "## 失败用例原因", ""])

        for case in failed_cases:
            lines.extend(build_failed_case_details(case))

    return "\n".join(lines)


def case_metric_scores(case: dict[str, object]) -> dict[str, str]:
    scores = {
        "answer_relevancy": "-",
        "faithfulness": "-",
        "context_precision": "-",
        "context_recall": "-",
    }
    metric_name_map = {
        "Answer Relevancy": "answer_relevancy",
        "Faithfulness": "faithfulness",
        "Contextual Precision": "context_precision",
        "Contextual Recall": "context_recall",
    }
    metrics = case.get("metrics", [])

    if not isinstance(metrics, list):
        return scores

    for metric in metrics:
        if not isinstance(metric, dict):
            continue

        name = metric_name_map.get(str(metric.get("name")))

        if name:
            scores[name] = str(metric.get("score", "-"))

    return scores


def build_failed_case_details(case: dict[str, object]) -> list[str]:
    lines = [
        "<details>",
        f"<summary>#{case['index']} {escape_html_text(case['input'])}</summary>",
        "",
        f"- 结果：{case['success']}",
        f"- 检索上下文数量：{case['context_count']}",
        "",
    ]

    append_text_block(lines, "期望回答", case["expected_output"])
    append_text_block(lines, "实际回答", case["actual_output"])
    lines.extend(
        [
            "| 指标 | 分数 | 结果 | 原因 |",
            "| --- | ---: | --- | --- |",
        ]
    )
    metrics = case.get("metrics", [])

    if isinstance(metrics, list):
        for metric in metrics:
            if not isinstance(metric, dict) or metric.get("success") == "通过":
                continue

            lines.append(
                "| "
                f"{escape_markdown_table_cell(metric.get('name', '-'))} | "
                f"{escape_markdown_table_cell(metric.get('score', '-'))} | "
                f"{escape_markdown_table_cell(metric.get('success', '-'))} | "
                f"{escape_markdown_table_cell(metric.get('reason', '-'))} |"
            )

    lines.extend(["", "</details>", ""])

    return lines


def escape_markdown_table_cell(value: object) -> str:
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("|", "\\|")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("\n", "<br>")
    )


def escape_html_text(value: object) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def append_text_block(lines: list[str], label: str, value: object) -> None:
    lines.extend([f"- {label}：", "", "```text"])
    lines.extend(str(value).replace("```", "` ` `").splitlines() or [""])
    lines.extend(["```", ""])


def write_latest_ragas_page(path: Path, entries: list[RagasReportEntry]) -> None:
    lines = [
        "# 最新 Ragas 报告",
        "",
        "本页由 `pnpm docs:reports` 生成。默认使用 `evals/published-reports/ragas/` 中时间最新的一份 Ragas Markdown 报告。",
        "",
    ]

    if not entries:
        lines.extend(["暂时还没有可展示的 Ragas 报告。", ""])
        path.write_text("\n".join(lines), encoding="utf-8")
        return

    latest = entries[0]
    lines.extend(
        [
            f'- 原始 Markdown：<a href="./ragas/{latest.markdown_path.name}">{latest.markdown_path.name}</a>',
            f"- 来源：{latest.source}",
            (
                f'- 原始 CSV：<a href="./ragas/{latest.csv_path.name}">{latest.csv_path.name}</a>'
                if latest.csv_path
                else "- 原始 CSV：-"
            ),
            "",
            "---",
            "",
            latest.markdown_path.read_text(encoding="utf-8").strip(),
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
