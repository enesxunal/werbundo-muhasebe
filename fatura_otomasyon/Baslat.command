#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "== Fatura Otomasyon Baslatiliyor =="
echo "Proje: $DIR"
echo ""

python3 main.py

