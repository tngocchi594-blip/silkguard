from __future__ import annotations

from pathlib import Path


def parse_document(path: Path, content_type: str) -> tuple[str, str]:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json"}:
        return path.read_text(encoding="utf-8", errors="replace"), "local-text"

    if suffix == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            return text, "pypdf"
        except Exception:
            return "", "pdf-pending-ocr"

    if content_type.startswith("image/"):
        try:
            from paddleocr import PaddleOCR

            ocr = PaddleOCR(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
            result = ocr.predict(str(path))
            chunks: list[str] = []
            for item in result:
                payload = getattr(item, "json", None)
                if isinstance(payload, dict):
                    chunks.extend(payload.get("rec_texts", []))
            return "\n".join(chunks), "paddleocr"
        except Exception:
            return "", "image-pending-paddleocr"

    return "", "metadata-only"
