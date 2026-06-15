def collect_ocr_lines(result) -> list[str]:
    lines: list[str] = []

    def visit(value):
        if isinstance(value, dict):
            rec_texts = value.get("rec_texts")

            if isinstance(rec_texts, list):
                for text in rec_texts:
                    if isinstance(text, str) and text.strip():
                        lines.append(text.strip())

            for item in value.values():
                visit(item)
            return

        if isinstance(value, (list, tuple)):
            if (
                len(value) >= 2
                and isinstance(value[1], (list, tuple))
                and value[1]
                and isinstance(value[1][0], str)
            ):
                text = value[1][0].strip()

                if text:
                    lines.append(text)

            for item in value:
                visit(item)

    visit(result)

    deduplicated: list[str] = []
    for line in lines:
        if not deduplicated or deduplicated[-1] != line:
            deduplicated.append(line)

    return deduplicated
