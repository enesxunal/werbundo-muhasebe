#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "== Fatura Otomasyon (Mac) Kurulum =="
echo ""

if ! command -v python3 >/dev/null 2>&1; then
  echo "HATA: python3 bulunamadı. Mac'te Python 3 kurulu olmalı."
  exit 1
fi

echo "1) Python paketleri kuruluyor..."
python3 -m pip install -r requirements.txt

echo ""
echo "2) Tesseract kontrol ediliyor..."
if ! command -v tesseract >/dev/null 2>&1; then
  echo "UYARI: tesseract bulunamadı."
  echo "Homebrew yüklüyse şunu kur:"
  echo "  brew install tesseract tesseract-lang"
  echo "Homebrew yoksa önce Homebrew kurulmalı."
else
  echo "Tesseract bulundu: $(tesseract --version | head -n 1)"
  echo "Dil listesi (tur var mı bak):"
  tesseract --list-langs | sed -n '1,40p'
fi

echo ""
echo "3) PDF için poppler kontrolü (opsiyonel)..."
if command -v pdfinfo >/dev/null 2>&1; then
  echo "Poppler bulundu (pdfinfo var)."
else
  echo "Poppler yoksa PDF OCR için şunu kurman gerekebilir:"
  echo "  brew install poppler"
fi

echo ""
echo "Bitti. Şimdi 'Baslat.command' dosyasına çift tıklayarak çalıştırabilirsin."
echo "Kapatmak için bu pencereyi kapatabilirsin."
read -p "Çıkmak için Enter..."

