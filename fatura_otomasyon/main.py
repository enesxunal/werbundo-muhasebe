from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from config import (
    ALLOWED_EXTENSIONS,
    EXCEL_PATH,
    INPUT_FOLDER,
    OUTPUT_BASE_FOLDER,
    UNKNOWN_CUSTOMER_FOLDER,
    UNKNOWN_DATE_FOLDER,
)
from excel_handler import append_record
from ocr_engine import run_ocr


def _setup_logging() -> None:
    log_dir = Path(__file__).resolve().parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "app.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


def _safe_folder_name(name: str) -> str:
    name = name.strip()
    # Dosya sistemi için riskli karakterleri temizle
    for ch in ['<', '>', ':', '"', "/", "\\", "|", "?", "*"]:
        name = name.replace(ch, "_")
    name = " ".join(name.split())
    return name or UNKNOWN_CUSTOMER_FOLDER


def _wait_until_stable(path: Path, timeout_s: float = 20.0) -> bool:
    # CaptureOnTouch / tarayıcı dosyayı parça parça yazabilir; boyut sabitlenene kadar bekle.
    start = time.time()
    last_size = -1
    stable_rounds = 0
    while time.time() - start < timeout_s:
        if not path.exists():
            return False
        try:
            size = path.stat().st_size
        except Exception:
            time.sleep(0.25)
            continue
        if size == last_size and size > 0:
            stable_rounds += 1
            if stable_rounds >= 4:  # ~1 saniye stabil
                return True
        else:
            stable_rounds = 0
            last_size = size
        time.sleep(0.25)
    return False


def _unique_destination(dest_path: Path) -> Path:
    if not dest_path.exists():
        return dest_path
    stem = dest_path.stem
    suf = dest_path.suffix
    parent = dest_path.parent
    i = 2
    while True:
        cand = parent / f"{stem} ({i}){suf}"
        if not cand.exists():
            return cand
        i += 1


def _process_file(src_path: Path) -> None:
    if src_path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return
    if src_path.name.startswith("~") or src_path.name.startswith("."):
        return

    if not _wait_until_stable(src_path):
        logging.warning(f"Dosya stabil olmadı (atlandı): {src_path}")
        return

    try:
        result = run_ocr(src_path)
    except Exception:
        # OCR tamamen patlarsa, yine de bilinmeyen klasöre alalım
        logging.exception(f"OCR hatası: {src_path}")
        result = None

    customer = UNKNOWN_CUSTOMER_FOLDER
    year_month = UNKNOWN_DATE_FOLDER
    tarih_excel = ""

    if result and result.customer_name:
        customer = _safe_folder_name(result.customer_name)

    if result and result.invoice_date:
        dt = result.invoice_date
        year_month = f"{dt.year:04d}-{dt.month:02d}"
        tarih_excel = dt.strftime("%Y-%m-%d")

    dest_dir = OUTPUT_BASE_FOLDER / customer / year_month
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_path = _unique_destination(dest_dir / src_path.name)
    try:
        shutil.move(str(src_path), str(dest_path))
    except Exception:
        # Taşıma olmazsa kopyala + kaynak silmeyi dene
        logging.exception(f"Taşıma hatası (kopyalama denenecek): {src_path} -> {dest_path}")
        shutil.copy2(str(src_path), str(dest_path))
        try:
            src_path.unlink(missing_ok=True)
        except Exception:
            logging.exception(f"Kaynak silinemedi: {src_path}")

    try:
        append_record(
            EXCEL_PATH,
            tarih_excel or year_month,
            customer,
            str(dest_path.resolve()),
        )
    except Exception:
        logging.exception(f"Excel yazma hatası: {EXCEL_PATH}")

    logging.info(f"Tamamlandı: musteri='{customer}', tarih='{tarih_excel or year_month}', hedef='{dest_path}'")


class IncomingHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        _process_file(Path(event.src_path))

    def on_moved(self, event):
        if getattr(event, "is_directory", False):
            return
        _process_file(Path(event.dest_path))


def main() -> None:
    _setup_logging()
    INPUT_FOLDER.mkdir(parents=True, exist_ok=True)
    OUTPUT_BASE_FOLDER.mkdir(parents=True, exist_ok=True)

    observer = Observer()
    handler = IncomingHandler()
    observer.schedule(handler, str(INPUT_FOLDER), recursive=False)
    observer.start()

    logging.info(f"İzleniyor: {INPUT_FOLDER}")
    logging.info(f"Çıktı: {OUTPUT_BASE_FOLDER}")
    logging.info(f"Excel: {EXCEL_PATH}")
    logging.info("Çıkmak için Ctrl+C")

    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()

