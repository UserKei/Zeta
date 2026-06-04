from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from pathlib import Path


RAGAS_REPORT_PATTERN = re.compile(r"ragas-report-(\d{8})-(\d{6})\.md$")
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


def main() -> None:
    args = parse_args()
    export_ragas_reports_for_docs(
        reports_dir=Path(args.reports_dir),
        docs_site_dir=Path(args.docs_site_dir),
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

    return parser.parse_args()


def export_ragas_reports_for_docs(
    reports_dir: Path,
    docs_site_dir: Path,
) -> None:
    ragas_public_dir = docs_site_dir / "public" / "eval-reports" / "ragas"
    deepeval_public_dir = docs_site_dir / "public" / "eval-reports" / "deepeval"
    report_pages_dir = docs_site_dir / "eval-reports"

    ragas_public_dir.mkdir(parents=True, exist_ok=True)
    deepeval_public_dir.mkdir(parents=True, exist_ok=True)
    report_pages_dir.mkdir(parents=True, exist_ok=True)
    (ragas_public_dir / ".gitkeep").touch()
    (deepeval_public_dir / ".gitkeep").touch()

    entries = read_ragas_report_entries(reports_dir)

    for entry in entries:
        shutil.copy2(entry.markdown_path, ragas_public_dir / entry.markdown_path.name)

        if entry.csv_path:
            shutil.copy2(entry.csv_path, ragas_public_dir / entry.csv_path.name)

    write_ragas_index_page(report_pages_dir / "index.md", entries)
    write_latest_ragas_page(report_pages_dir / "latest.md", entries)


def read_ragas_report_entries(reports_dir: Path) -> list[RagasReportEntry]:
    if not reports_dir.exists():
        return []

    entries = [
        parse_ragas_report(markdown_path)
        for markdown_path in sorted(reports_dir.glob("ragas-report-*.md"))
        if RAGAS_REPORT_PATTERN.match(markdown_path.name)
    ]

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
        scores=parse_ragas_scores(markdown_path.read_text(encoding="utf-8")),
    )


def parse_ragas_scores(markdown: str) -> dict[str, str]:
    scores = {name: "-" for name in RAGAS_SCORE_NAMES}

    for line in markdown.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]

        if len(cells) != 2:
            continue

        name, value = cells

        if name in scores:
            scores[name] = value

    return scores


def write_ragas_index_page(path: Path, entries: list[RagasReportEntry]) -> None:
    lines = [
        "# RAG 评测报告索引",
        "",
        "本页由 `pnpm docs:reports` 从 `evals/reports/` 生成，用于在交付文档站中展示离线 Ragas 评测结果。",
        "",
        "> [!NOTE]",
        "> 原始评测报告仍保留在 `evals/reports/`，文档站只发布静态副本和索引，不把评测逻辑放进 NestJS 或前端后台。",
        "",
    ]

    if not entries:
        lines.extend(["暂时还没有可展示的 Ragas 报告。", ""])
        path.write_text("\n".join(lines), encoding="utf-8")
        return

    lines.extend(
        [
            "[查看最新报告](./latest)",
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
    path.write_text("\n".join(lines), encoding="utf-8")


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
