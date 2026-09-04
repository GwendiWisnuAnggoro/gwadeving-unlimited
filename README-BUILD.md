# Build APK / EXE / iOS — Panduan

## Ringkasan penting
Prinsip yang dipakai di semua platform (APK, EXE, nanti iOS): app-nya cuma
"jendela native" yang membuka website GitHub Pages kamu langsung — bukan
salinan beku. Konsekuensinya:
- **Semua fungsi identik dengan di browser**, karena memang mesin render
  yang dipakai sama (Chrome untuk APK, WebView2 untuk EXE).
- **Update `Script.js`/`style.css` di GitHub otomatis kelihatan** begitu
  user buka app-nya lagi — tidak perlu rebuild/reinstall app, KECUALI kamu
  mau ganti hal native (icon, nama app, ukuran window).
- Konsekuensinya app tetap butuh internet tiap dibuka (persis seperti
  sekarang), karena memang bukan salinan offline.

## Yang sudah otomatis
Workflow `.github/workflows/build-release.yml` akan jalan tiap kamu push tag
versi (`git tag v1.0.0 && git push origin v1.0.0`), lalu GitHub sendiri yang:
1. Build **APK Android** (via Bubblewrap/TWA) dari `twa-manifest.json`
2. Build **EXE Windows** (via Tauri)
3. Upload keduanya ke tab **Releases** repo kamu → tinggal didownload manual.

Ini masih perlu **setup sekali di awal** (bukan langsung jalan begitu saja),
karena beberapa hal wajib disesuaikan dengan akun/keystore milikmu sendiri:

## 1. Android (APK)
- `twa-manifest.json` sudah saya isi, tapi field `"fingerprints": []`
  masih kosong — itu wajib diisi SHA256 dari keystore signing kamu sendiri
  (dibuat otomatis oleh Bubblewrap saat build pertama). Setelah build
  pertama jalan, ambil fingerprint-nya:
  ```
  keytool -list -v -keystore android.keystore -alias android
  ```
  lalu tempel ke `fingerprints` di `twa-manifest.json`, commit ulang.
- Ini WAJIB supaya Android tahu APK ini memang representasi resmi dari
  domain `gwendiwisnuanggoro.github.io` (lewat file `assetlinks.json`
  yang perlu kamu taruh juga di `/.well-known/assetlinks.json` pada repo
  GitHub Pages kamu — Bubblewrap akan kasih tau isinya persis apa).
- Buat publish ke Play Store: daftar **Google Play Console** ($25 sekali
  bayar), upload `.aab` (bukan `.apk`) hasil build. Selama app tidak minta
  permission aneh dan sudah pasang assetlinks.json, Play Protect **tidak**
  akan flag sebagai malware.

## 2. Windows (EXE)
**PENTING — koreksi dari saran sebelumnya:** ada 2 cara Tauri bisa dipakai,
dan hasilnya beda soal update:

- **Mode "bundle" (saran saya sebelumnya, JANGAN dipakai kalau mau auto-update):**
  file HTML/CSS/JS disalin & dibekukan ke dalam exe saat build. Update di
  GitHub TIDAK akan kelihatan di exe yang sudah didownload user sampai kamu
  build ulang & mereka install ulang.
- **Mode "URL wrapper" (direkomendasikan, biar konsisten sama APK):**
  exe-nya cuma jendela native yang langsung membuka
  `https://gwendiwisnuanggoro.github.io/Gwadeving-Cloud/` — persis prinsip
  yang sama dengan TWA di Android. Update script di GitHub otomatis
  kelihatan begitu user buka app-nya lagi, **tanpa rebuild EXE**.

Setup sekali di awal (butuh Rust terinstall di komputermu):
```
npm create tauri-app@latest
# pilih template kosong ("vanilla" / no framework)
```
Lalu di `src-tauri/tauri.conf.json`, arahkan window ke URL live-nya:
```json
{
  "app": {
    "windows": [
      {
        "title": "Gwadeving Cloud",
        "url": "https://gwendiwisnuanggoro.github.io/Gwadeving-Cloud/",
        "width": 1280,
        "height": 800
      }
    ]
  }
}
```
Setelah itu commit folder `src-tauri/` yang muncul, baru workflow-nya bisa
jalan penuh. Dengan mode ini kamu juga cuma perlu build ulang EXE kalau mau
ganti hal native (icon, nama, ukuran window) — bukan tiap update fitur app.

**Konsekuensi mode URL-wrapper:** exe ini butuh internet tiap dibuka (sama
persis kayak sekarang saat diakses via browser — app ini memang selalu
butuh internet karena backend-nya Google Apps Script + Telegram, jadi tidak
ada yang hilang). Kalau suatu saat kamu justru MAU versi offline-first yang
bisa jalan tanpa internet (dengan konsekuensi harus rebuild tiap update),
baru pakai mode "bundle" di atas.

**Soal "gak kedeteksi virus":** EXE tanpa **code signing certificate**
hampir pasti kena peringatan Windows SmartScreen "Unrecognized publisher" —
ini bukan berarti app-nya virus, tapi Windows belum kenal reputasi
publisher-nya. Solusi nyata: beli **code signing certificate** (mulai
~$100-400/tahun dari vendor seperti SSL.com/Sectigo), lalu sign exe hasil
build. Tanpa itu, satu-satunya cara "aman" adalah kasih tau user untuk klik
"More info → Run anyway" saat pertama install — bukan sesuatu yang bisa
saya akalin lewat kode.

## 3. iOS — tidak bisa auto seperti APK/EXE
Apple mewajibkan semua app (termasuk yang di-sideload manual) untuk
ditandatangani pakai sertifikat dari **Apple Developer Program**
($99/tahun, wajib py komputer Mac buat setup awal). Tanpa itu:
- File `.ipa` bisa dibuild, tapi **tidak bisa diinstall** di iPhone asli
  (cuma jalan di Simulator).
- Opsi sideload tanpa akun berbayar (AltStore, dsb) app-nya **expired
  tiap 7 hari** dan harus di-install ulang — bukan pengalaman yang layak
  buat pengguna publik.

Kalau nanti kamu sudah punya Apple Developer account, kabari saya —
saya bantu siapkan project Capacitor + workflow macOS runner buat build
`.ipa` yang tersigned otomatis juga. Prinsipnya sama seperti EXE: Capacitor
juga bisa dikonfigurasi mode "URL wrapper" (`server.url` di
`capacitor.config.json` diarahkan ke link GitHub Pages) supaya update
script otomatis kepakai tanpa perlu submit ulang ke App Store tiap ganti
fitur kecil.

## Cara paling gampang tanpa CLI (alternatif)
Kalau setup Bubblewrap/Tauri di atas kerasa ribet, ada jalan pintas GUI:
**PWABuilder.com** — tinggal masukkan URL
`https://gwendiwisnuanggoro.github.io/Gwadeving-Cloud/`, dia otomatis kasih
tombol download APK & paket Windows langsung dari browser, tanpa perlu
setup GitHub Actions sama sekali. Cocok buat coba-coba dulu sebelum masuk
ke otomatisasi CI.

## Multi-endpoint GAS + multi-spreadsheet (skala tak terbatas)

Sistemnya sekarang punya 2 lapis redundansi:
- **`APP_SCRIPT_URLS`** (di `Script.js`) -- daftar link Web App GAS. Kalau satu
  limit/gagal, JS otomatis coba link berikutnya, untuk SEMUA aksi (login,
  upload, rename, hapus, dst).
- **`DATA_SPREADSHEET_IDS`** (di `index.gs`) -- daftar spreadsheet tambahan
  khusus data file (DB_01/DB_02), dipakai kalau spreadsheet utama kena limit
  ukuran/baca.

### Cara nambah 1 deployment GAS cadangan (akun Google lain)
1. Di akun Google cadangan itu, buat project Apps Script baru, **copy-paste**
   seluruh isi `index.gs` ini ke situ persis sama.
2. **WAJIB**: buka spreadsheet utama ("Drive Unlimited"), klik Share, undang
   email akun Google cadangan itu sebagai **Editor** (BUKAN "Pelihat"/Viewer
   -- Viewer gak bisa dipakai buat nulis, semua aksi tulis bakal gagal
   "permission denied").
3. Deploy project itu sebagai Web App ("Anyone" access), salin URL-nya.
4. Tempel URL itu ke array `APP_SCRIPT_URLS` di `Script.js`.
5. Selesai -- karena `index.gs` sekarang dikunci ke `PRIMARY_SPREADSHEET_ID`
   yang tetap (bukan "spreadsheet tempat script ini nempel"), deployment
   cadangan ini otomatis baca/tulis ke database identitas yang SAMA persis
   dengan deployment utama. Login, folder, share -- semuanya tetap konsisten
   walau request-nya kebetulan ditangani deployment cadangan.

Ulangi langkah di atas untuk deployment ke-2, ke-3, dst -- jumlahnya bebas.
