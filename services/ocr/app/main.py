import os
import tempfile
from pathlib import Path
from urllib.parse import unquote

import pypdfium2 as pdfium
from fastapi import FastAPI, HTTPException, Request

from app.ocr_engine import create_ocr_engine
from app.ocr_result import collect_ocr_lines

app = FastAPI(title="Zeta OCR Service")

_ocr_engine = None


def get_ocr_engine():
    global _ocr_engine

    if _ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise RuntimeError("PaddleOCR is not installed") from exc

        _ocr_engine = create_ocr_engine(
            PaddleOCR,
            os.getenv("OCR_LANG", "ch"),
            ocr_version=os.getenv("OCR_VERSION", "PP-OCRv4"),
            detection_model_name=os.getenv(
                "OCR_DETECTION_MODEL",
                "PP-OCRv4_mobile_det",
            ),
            recognition_model_name=os.getenv(
                "OCR_RECOGNITION_MODEL",
                "PP-OCRv4_mobile_rec",
            ),
        )

    return _ocr_engine


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr/pdf")
async def ocr_pdf(request: Request):
    pdf_bytes = await request.body()

    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDF body is required")

    file_name = unquote(request.headers.get("x-file-name", "document.pdf"))
    max_pages = int(os.getenv("OCR_MAX_PAGES", "50"))

    try:
        markdown = recognize_pdf(pdf_bytes, file_name, max_pages)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="PDF OCR failed") from exc

    if not markdown.strip():
        raise HTTPException(status_code=422, detail="OCR did not return text")

    return {
        "fileName": file_name,
        "engine": "paddleocr",
        "markdown": markdown,
    }


def recognize_pdf(pdf_bytes: bytes, file_name: str, max_pages: int) -> str:
    ocr_engine = get_ocr_engine()
    sections: list[str] = []

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        pdf_path = temp_path / "input.pdf"
        pdf_path.write_bytes(pdf_bytes)
        pdf_document = pdfium.PdfDocument(str(pdf_path))
        page_count = min(len(pdf_document), max_pages)

        for page_index in range(page_count):
            page = pdf_document[page_index]
            image = page.render(scale=2).to_pil()
            image_path = temp_path / f"page-{page_index + 1}.png"
            image.save(image_path)
            lines = collect_ocr_lines(run_ocr(ocr_engine, image_path))

            if lines:
                sections.append(
                    f"## {file_name} 第 {page_index + 1} 页\n\n"
                    + "\n".join(lines),
                )

    return "\n\n".join(sections)


def run_ocr(ocr_engine, image_path: Path):
    if hasattr(ocr_engine, "ocr"):
        try:
            return ocr_engine.ocr(str(image_path), cls=True)
        except TypeError:
            return ocr_engine.ocr(str(image_path))

    return ocr_engine.predict(str(image_path))
