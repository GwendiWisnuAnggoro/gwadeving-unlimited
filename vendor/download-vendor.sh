#!/usr/bin/env bash
# ============================================================
# Download semua library CDN yang dipakai Gwadeving Cloud
# supaya jadi file lokal (vendor/) — gak tergantung link CDN lagi.
#
# CARA PAKAI:
#   1. Jalankan script ini SEKALI di komputer yang ada internetnya:
#        bash vendor/download-vendor.sh
#   2. Folder vendor/ akan terisi semua file library.
#   3. Commit & push folder vendor/ ke GitHub.
#
# Script ini juga otomatis dijalankan oleh GitHub Actions
# (lihat .github/workflows/build-release.yml) tiap kali build,
# jadi kamu sebenarnya TIDAK WAJIB jalankan manual — tapi boleh
# kalau mau test lokal dulu.
# ============================================================
set -e
cd "$(dirname "$0")"

echo "==> Downloading Plyr 3.7.8..."
curl -fsSL "https://cdn.plyr.io/3.7.8/plyr.css"      -o plyr.css
curl -fsSL "https://cdn.plyr.io/3.7.8/plyr.min.js"   -o plyr.min.js

echo "==> Downloading exifr (dipin ke versi tetap, bukan 'latest')..."
curl -fsSL "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js" -o exifr.full.umd.js

echo "==> Downloading highlight.js 11.8.0..."
curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css" -o highlight.atom-one-dark.min.css
curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"              -o highlight.min.js

echo "==> Downloading SheetJS (xlsx)..."
curl -fsSL "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" -o xlsx.full.min.js

echo "==> Downloading pdf.js 3.11.174..."
curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" -o pdf.min.js

echo "==> Downloading JSZip 3.10.1..."
curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" -o jszip.min.js

echo "==> Downloading docx-preview 0.3.3..."
curl -fsSL "https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js" -o docx-preview.min.js

echo "==> Selesai! Semua file ada di folder vendor/"
ls -la .
