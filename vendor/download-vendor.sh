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
#
# CATATAN PERBAIKAN (lihat FIXNOTES.md):
#   - cdn.plyr.io sudah MATI (404), jadi Plyr sekarang diambil dari
#     mirror cdnjs.cloudflare.com yang masih aktif.
#   - Script ini TIDAK lagi pakai `set -e` global, supaya kalau SATU
#     library gagal download, library lainnya tetap lanjut diunduh
#     (sebelumnya satu 404 bikin SEMUA proses berhenti total).
#   - Tiap unduhan dicoba ulang otomatis (--retry) dan hasilnya
#     dirangkum di akhir supaya jelas mana yang gagal.
# ============================================================
cd "$(dirname "$0")"

FAILED=()
CURL="curl --retry 3 --retry-delay 2 --retry-connrefused -fsSL"

dl() {
    local desc="$1" url="$2" out="$3"
    echo "==> Downloading ${desc}..."
    if $CURL "$url" -o "$out"; then
        echo "    OK -> ${out}"
    else
        echo "    GAGAL -> ${url}"
        FAILED+=("${desc} (${url})")
    fi
}

# Plyr: cdn.plyr.io sudah tidak melayani file lagi (404), pindah ke
# mirror cdnjs yang masih aktif dan terus dipelihara.
dl "Plyr 3.8.4 (CSS)" "https://cdnjs.cloudflare.com/ajax/libs/plyr/3.8.4/plyr.css" "plyr.css"
dl "Plyr 3.8.4 (JS)"  "https://cdnjs.cloudflare.com/ajax/libs/plyr/3.8.4/plyr.min.js" "plyr.min.js"

dl "exifr (dipin ke versi tetap, bukan 'latest')" \
   "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js" "exifr.full.umd.js"

dl "highlight.js 11.8.0 (CSS)" \
   "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css" \
   "highlight.atom-one-dark.min.css"
dl "highlight.js 11.8.0 (JS)" \
   "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js" \
   "highlight.min.js"

dl "SheetJS (xlsx)" \
   "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" "xlsx.full.min.js"

dl "pdf.js 3.11.174" \
   "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" "pdf.min.js"

dl "JSZip 3.10.1" \
   "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" "jszip.min.js"

dl "docx-preview 0.3.3" \
   "https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js" \
   "docx-preview.min.js"

echo ""
echo "==> Selesai! Isi folder vendor/ sekarang:"
ls -la .

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "✅ Semua library berhasil diunduh."
else
    echo "⚠️  ${#FAILED[@]} library GAGAL diunduh (yang lain tetap lanjut):"
    for f in "${FAILED[@]}"; do echo "   - $f"; done
    echo "   Cek koneksi internet / apakah URL di atas sudah berubah lagi,"
    echo "   lalu jalankan ulang script ini. Fitur yang mirip file yang gagal"
    echo "   akan otomatis fallback ke CDN publik saat aplikasi dibuka"
    echo "   (lebih lambat, tapi tetap jalan)."
    exit 1
fi
