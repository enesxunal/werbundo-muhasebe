from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

import pytesseract
from PIL import Image, ImageOps

from config import DATE_REGEXES, CUSTOMER_REGEXES, TESS_LANG, TESSERACT_CMD

try:
    from pdf2image import convert_from_path
except Exception:  # pdf2image opsiyonel; PDF gelirse uyarı verilecek
    convert_from_path = None


@dataclass(frozen=True)
class OcrResult:
    raw_text: str
    customer_name: str | None
    invoice_date: datetime | None


def _configure_tesseract() -> None:
    if TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


def _preprocess(img: Image.Image) -> Image.Image:
    # Basit ve güvenli bir ön-işleme: gri ton + hafif kontrast.
    img = img.convert("RGB")
    img = ImageOps.grayscale(img)
    img = ImageOps.autocontrast(img)
    return img


def _images_from_file(file_path: Path) -> list[Image.Image]:
    ext = file_path.suffix.lower()
    if ext in {".jpg", ".jpeg", ".png"}:
        return [Image.open(file_path)]

    if ext == ".pdf":
        if convert_from_path is None:
            raise RuntimeError(
                "PDF işlemek için pdf2image kurulmalı. requirements.txt içinde mevcut, "
                "ayrıca Mac'te 'brew install poppler' gerekebilir."
            )
        # dpi arttıkça OCR kalitesi artar, ama hız düşer.
        return convert_from_path(str(file_path), dpi=250)

    raise ValueError(f"Desteklenmeyen dosya uzantısı: {ext}")


def _normalize_customer(val: str) -> str:
    val = re.sub(r"\s+", " ", val).strip()
    # Satır sonuna taşan/ekstra bilgileri azaltmak için yaygın kırpma:
    val = val.split("\n", 1)[0].strip()
    # Çok kısa veya anlamsızsa boş say
    if len(val) < 3:
        return ""
    return val


def _parse_date(val: str) -> datetime | None:
    val = val.strip()
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%d.%m.%y", "%d/%m/%y", "%d-%m-%y"):
        try:
            dt = datetime.strptime(val, fmt)
            # 2 haneli yıl gelirse 20xx varsayımı (2000-2099)
            if dt.year < 100:
                dt = dt.replace(year=2000 + dt.year)
            return dt
        except Exception:
            pass
    return None


def _first_match(patterns: Iterable[str], text: str) -> str | None:
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE | re.MULTILINE)
        if not m:
            continue
        val = (m.groupdict().get("val") or "").strip()
        if val:
            return val
    return None


def run_ocr(file_path: Path) -> OcrResult:
    _configure_tesseract()

    texts: list[str] = []
    for img in _images_from_file(file_path):
        img = _preprocess(img)
        # OCR doğru satır kırılımları için psm 6 çoğu fatura için iyi çalışır.
        txt = pytesseract.image_to_string(img, lang=TESS_LANG, config="--psm 6")
        if txt:
            texts.append(txt)

    raw_text = "\n".join(texts).strip()

    customer_raw = _first_match(CUSTOMER_REGEXES, raw_text) if raw_text else None
    customer_name = _normalize_customer(customer_raw) if customer_raw else None
    if customer_name == "":
        customer_name = None

    date_raw = _first_match(DATE_REGEXES, raw_text) if raw_text else None
    invoice_date = _parse_date(date_raw) if date_raw else None

    return OcrResult(raw_text=raw_text, customer_name=customer_name, invoice_date=invoice_date)

