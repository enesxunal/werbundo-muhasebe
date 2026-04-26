from __future__ import annotations

from pathlib import Path

# Bu dosyadaki yolları müşteri bilgisayarına göre düzenleyin.
# Mac örneği:
# INPUT_FOLDER = Path("/Users/kullanici_adi/Documents/Taramalar")

PROJECT_ROOT = Path(__file__).resolve().parent

# Canon CaptureOnTouch'un dosya bırakacağı klasör
INPUT_FOLDER: Path = PROJECT_ROOT / "Giris"

# Çıktıların yerleştirileceği ana klasör
OUTPUT_BASE_FOLDER: Path = PROJECT_ROOT / "Musteriler"

# Excel kayıt dosyası
EXCEL_PATH: Path = PROJECT_ROOT / "Gelir_Gider.xlsx"

# Tesseract ayarları
# - Mac'te genelde otomatik bulunur.
# - Windows'ta gerekirse buraya tam yolu yazın:
#   TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
TESSERACT_CMD: str | None = None

# Türkçe OCR dili
TESS_LANG = "tur"

# Dosya türleri
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}

# OCR'dan müşteri ve tarih yakalamak için regex kalıpları.
# Faturalardaki anahtar kelimelere göre burayı gerektiğinde iyileştirebilirsiniz.
#
# Örnek yakalama:
#   Müşteri Adı: ACME LTD ŞTİ
#   Tarih: 25.04.2026
CUSTOMER_REGEXES = [
    r"Müşteri\s*Ad[ıi]\s*[:\-]\s*(?P<val>.+)",
    r"Al[ıi]c[ıi]\s*[:\-]\s*(?P<val>.+)",
    r"Unvan[ıi]\s*[:\-]\s*(?P<val>.+)",
]

DATE_REGEXES = [
    r"Tarih\s*[:\-]\s*(?P<val>\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
    r"Düzenleme\s*Tarihi\s*[:\-]\s*(?P<val>\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
    r"(?P<val>\d{4}[./-]\d{1,2}[./-]\d{1,2})",
]

# Okunamayan durumlarda kullanılacak klasör isimleri
UNKNOWN_CUSTOMER_FOLDER = "Bilinmeyen_Musteri"
UNKNOWN_DATE_FOLDER = "Tarih_Bilinmiyor"

