from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path


RAGAS_REPORT_PATTERN = re.compile(r"ragas-report-(\d{8})-(\d{6})\.md$")
DEEPEVAL_REPORT_PATTERN = re.compile(r"deepeval-report-(\d{8})-(\d{6})\.html$")
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
    display_time: str
    scores: dict[str, str]
    summary: dict[str, str]


@dataclass(frozen=True)
class DeepEvalReportEntry:
    html_path: Path
    json_path: Path | None
    display_time: str
    scores: dict[str, str]
    total_cases: str
    passed_cases: str
    failed_cases: str


def main() -> None:
    args = parse_args()
    export_ragas_reports_for_docs(
        reports_dir=Path(args.reports_dir),
        docs_site_dir=Path(args.docs_site_dir),
        published_ragas_dir=Path(args.published_ragas_dir),
        published_deepeval_dir=Path(args.published_deepeval_dir),
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
            "Tracked DeepEval HTML reports that should always be published "
            "to the docs site."
        ),
    )

    return parser.parse_args()


def export_ragas_reports_for_docs(
    reports_dir: Path,
    docs_site_dir: Path,
    published_ragas_dir: Path | None = None,
    published_deepeval_dir: Path | None = None,
) -> None:
    ragas_public_dir = docs_site_dir / "public" / "eval-reports" / "ragas"
    deepeval_public_dir = docs_site_dir / "public" / "eval-reports" / "deepeval"
    report_pages_dir = docs_site_dir / "eval-reports"

    ragas_public_dir.mkdir(parents=True, exist_ok=True)
    deepeval_public_dir.mkdir(parents=True, exist_ok=True)
    report_pages_dir.mkdir(parents=True, exist_ok=True)
    (ragas_public_dir / ".gitkeep").touch()
    (deepeval_public_dir / ".gitkeep").touch()

    ragas_report_dirs = (
        [published_ragas_dir, reports_dir] if published_ragas_dir else [reports_dir]
    )
    deepeval_report_dirs = (
        [published_deepeval_dir, reports_dir]
        if published_deepeval_dir
        else [reports_dir]
    )
    entries = read_ragas_report_entries(*ragas_report_dirs)
    deepeval_entries = read_deepeval_report_entries(*deepeval_report_dirs)

    for entry in entries:
        shutil.copy2(entry.markdown_path, ragas_public_dir / entry.markdown_path.name)

        if entry.csv_path:
            shutil.copy2(entry.csv_path, ragas_public_dir / entry.csv_path.name)

    for entry in deepeval_entries:
        shutil.copy2(entry.html_path, deepeval_public_dir / entry.html_path.name)

        if entry.json_path:
            shutil.copy2(entry.json_path, deepeval_public_dir / entry.json_path.name)

    write_ragas_index_page(report_pages_dir / "index.md", entries, deepeval_entries)
    write_latest_ragas_page(report_pages_dir / "latest.md", entries)


def read_ragas_report_entries(*reports_dirs: Path | None) -> list[RagasReportEntry]:
    markdown_paths: dict[str, Path] = {}

    for reports_dir in reports_dirs:
        if not reports_dir or not reports_dir.exists():
            continue

        for markdown_path in sorted(reports_dir.glob("ragas-report-*.md")):
            if RAGAS_REPORT_PATTERN.match(markdown_path.name):
                markdown_paths[markdown_path.name] = markdown_path

    entries = [parse_ragas_report(path) for path in markdown_paths.values()]

    return sorted(entries, key=lambda entry: entry.display_time, reverse=True)


def read_deepeval_report_entries(
    *reports_dirs: Path | None,
) -> list[DeepEvalReportEntry]:
    html_paths: dict[str, Path] = {}

    for reports_dir in reports_dirs:
        if not reports_dir or not reports_dir.exists():
            continue

        for html_path in sorted(reports_dir.glob("deepeval-report-*.html")):
            if DEEPEVAL_REPORT_PATTERN.match(html_path.name):
                html_paths[html_path.name] = html_path

    entries = [parse_deepeval_report(path) for path in html_paths.values()]

    return sorted(entries, key=lambda entry: entry.display_time, reverse=True)


def parse_ragas_report(markdown_path: Path) -> RagasReportEntry:
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
        display_time=display_time,
        **parse_ragas_markdown(markdown_path.read_text(encoding="utf-8")),
    )


def parse_deepeval_report(html_path: Path) -> DeepEvalReportEntry:
    match = DEEPEVAL_REPORT_PATTERN.match(html_path.name)

    if not match:
        raise ValueError(f"Invalid DeepEval report filename: {html_path.name}")

    date_part, time_part = match.groups()
    display_time = (
        f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:]} "
        f"{time_part[:2]}:{time_part[2:4]}:{time_part[4:]}"
    )
    json_path = html_path.with_suffix(".json")

    return DeepEvalReportEntry(
        html_path=html_path,
        json_path=json_path if json_path.exists() else None,
        display_time=display_time,
        **parse_deepeval_json(json_path if json_path.exists() else None),
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


def parse_deepeval_json(json_path: Path | None) -> dict[str, object]:
    scores = {name: "-" for name in RAGAS_SCORE_NAMES}

    if not json_path:
        return {
            "scores": scores,
            "total_cases": "-",
            "passed_cases": "-",
            "failed_cases": "-",
        }

    data = json.loads(json_path.read_text(encoding="utf-8"))
    metric_map = {
        "Answer Relevancy": "answer_relevancy",
        "Contextual Precision": "context_precision",
        "Contextual Recall": "context_recall",
        "Faithfulness": "faithfulness",
    }

    for metric in data.get("metricsScores", []):
        metric_name = metric_map.get(str(metric.get("metric")))

        if not metric_name:
            continue

        metric_scores = [
            score for score in metric.get("scores", []) if isinstance(score, int | float)
        ]
        scores[metric_name] = (
            f"{sum(metric_scores) / len(metric_scores):.4f}" if metric_scores else "-"
        )

    passed_cases = data.get("testPassed", "-")
    failed_cases = data.get("testFailed", "-")
    total_cases = len(data.get("testCases", []))

    return {
        "scores": scores,
        "total_cases": str(total_cases) if total_cases else "-",
        "passed_cases": str(passed_cases),
        "failed_cases": str(failed_cases),
    }


def write_ragas_index_page(
    path: Path,
    entries: list[RagasReportEntry],
    deepeval_entries: list[DeepEvalReportEntry],
) -> None:
    lines = [
        "# 评测报告",
        "",
        "本页由 `pnpm docs:reports` 从 `evals/reports/` 和 `evals/published-reports/` 生成，用于在交付文档站中展示离线 RAG 评测结果。",
        "",
    ]

    append_report_overview(lines, entries, deepeval_entries)
    lines.extend(
        [
            "",
            "> [!NOTE]",
            "> 本地评测报告仍保留在 `evals/reports/`，可发布的基准报告保留在 `evals/published-reports/`。文档站只发布静态副本，不把评测逻辑放进 NestJS 或前端后台。",
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
            "| 运行时间 | answer_relevancy | context_precision | context_recall | faithfulness | Markdown | CSV |",
            "| --- | ---: | ---: | ---: | ---: | --- | --- |",
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
            "| 运行时间 | 通过 | answer_relevancy | context_precision | context_recall | faithfulness | HTML | JSON |",
            "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
        ]
    )

    for entry in entries:
        html_link = f'<a href="./deepeval/{entry.html_path.name}">html</a>'
        json_link = (
            f'<a href="./deepeval/{entry.json_path.name}">json</a>'
            if entry.json_path
            else "-"
        )
        lines.append(
            "| "
            f"{entry.display_time} | "
            f"{entry.passed_cases}/{entry.total_cases} | "
            f"{entry.scores['answer_relevancy']} | "
            f"{entry.scores['context_precision']} | "
            f"{entry.scores['context_recall']} | "
            f"{entry.scores['faithfulness']} | "
            f"{html_link} | "
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
            "| 报告 | 运行时间 | 用例 / 通过 | answer_relevancy | context_precision | context_recall | faithfulness | 详情 |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
        ]
    )

    if latest_ragas:
        total = latest_ragas.summary.get("Total cases", "-")
        succeeded = latest_ragas.summary.get("Succeeded cases", "-")
        lines.append(
            "| "
            f"[Ragas](#ragas) | "
            f"{latest_ragas.display_time} | "
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
            f"{latest_deepeval.passed_cases}/{latest_deepeval.total_cases} | "
            f"{latest_deepeval.scores['answer_relevancy']} | "
            f"{latest_deepeval.scores['context_precision']} | "
            f"{latest_deepeval.scores['context_recall']} | "
            f"{latest_deepeval.scores['faithfulness']} | "
            f'<a href="./deepeval/{latest_deepeval.html_path.name}">HTML</a> |'
        )


def write_latest_ragas_page(path: Path, entries: list[RagasReportEntry]) -> None:
    lines = [
        "# 最新 Ragas 报告",
        "",
        "本页由 `pnpm docs:reports` 生成。每次构建文档站时会使用 `evals/reports/` 中时间最新的一份 Ragas Markdown 报告。",
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
