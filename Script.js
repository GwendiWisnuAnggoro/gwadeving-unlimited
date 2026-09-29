// ====================================================
// KONFIGURASI CLOUDFLARE WORKER & STREAMING
// ====================================================

// Masukkan URL Cloudflare Worker Anda di sini (boleh 1 atau lebih untuk Load Balancing)
const WORKER_POOL = [
    "https://misty-leaf-5857.ssmerpa.workers.dev",  "https://gwadevproxy.gwendirafa15.workers.dev"
];

// Password rahasia untuk Worker (Sama seperti yang di kode Cloudflare)
const WORKER_PASSWORD = "GwadevingSuperSecret2026";

// Fungsi untuk memilih Worker secara acak agar tidak membebani 1 server
function getRandomWorker() {
    return WORKER_POOL[Math.floor(Math.random() * WORKER_POOL.length)];
}

// Fungsi untuk mengambil URL biner langsung dari Telegram
async function getDirectTelegramUrls(chunksMeta, signal) {
    const urls = [];
    for (let i = 0; i < chunksMeta.length; i++) {
        if (signal && signal.aborted) throw new Error("Dibatalkan oleh pengguna");
        const chunk = chunksMeta[i];
        
        // Ambil path asli dari bot
        const pathBlob = await fetchBinaryWithFallback(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${chunk.telegramFileId}`, null, signal);
        const pathText = await pathBlob.text();
        const pathData = JSON.parse(pathText);
        
        if (!pathData.ok) throw new Error("Gagal resolusi jalur Telegram");
        urls.push(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${pathData.result.file_path}`);
    }
    return urls;
}



// ==========================================
// SISTEM ANTI-2-BARIS: potong teks/nama panjang jadi 1 baris + "..."
// (title="" tetap dipasang di elemen terkait supaya nama lengkap tetap
// bisa dibaca lewat tooltip saat hover, dan breadcrumb tetap bisa discroll
// ke samping seperti sebelumnya).
// ==========================================
(function injectTextTruncationStyles() {
    const css = `
        .file-title-text, .folder-name, .usr-name, .shared-owner-label,
        .shared-item-owner, .ext-label, .folder-meta, .file-sub,
        #view-title, #files-section-title, #folder-section-label,
        #opt-folder-title, #opt-file-title, #info-name,
        #share-modal-title, #confirm-title {
            display: block;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .folder-info, .file-info-area, .text-wrap, .user-details,
        .allowed-user-info, .user-details, #share-modal-title {
            min-width: 0;
        }
        #breadcrumb-nav {
            display: flex;
            overflow-x: auto;
            white-space: nowrap;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
        }
        #breadcrumb-nav::-webkit-scrollbar { display: none; }
        #breadcrumb-nav span { flex-shrink: 0; }
    `;
    const styleTag = document.createElement('style');
    styleTag.id = 'anti-two-line-text-style';
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
})();

// ==========================================
// HIGHLIGHT SEMENTARA UNTUK KARTU FILE TARGET
// ==========================================
// Dipakai saat pengguna diarahkan ke sebuah file (mis. dari link share yang
// ternyata file miliknya sendiri): bukan langsung membuka preview, tapi
// discroll ke kartunya di tab Berkas lalu diberi kedip/highlight tipis
// SEMENTARA saja (beberapa detik), bukan permanen.
(function injectHighlightFlashStyle() {
    const css = `
        @keyframes fileCardHighlightFlash {
            0%   { box-shadow: 0 0 0 0 rgba(5,150,105,0), 0 0 0 0 rgba(16,185,129,0); background-position: 0% 50%; }
            15%  { box-shadow: 0 0 0 3px rgba(5,150,105,0.55), 0 4px 24px -4px rgba(16,185,129,0.45); background-position: 50% 50%; }
            50%  { box-shadow: 0 0 0 2px rgba(16,185,129,0.4), 0 4px 20px -6px rgba(5,150,105,0.3); background-position: 100% 50%; }
            85%  { box-shadow: 0 0 0 3px rgba(5,150,105,0.5), 0 4px 22px -4px rgba(16,185,129,0.4); background-position: 50% 50%; }
            100% { box-shadow: 0 0 0 0 rgba(5,150,105,0), 0 0 0 0 rgba(16,185,129,0); background-position: 0% 50%; }
        }
        .file-card-highlight-flash {
            animation: fileCardHighlightFlash 1.8s ease-in-out 2;
            border-radius: 12px;
            background-image: linear-gradient(120deg, rgba(5,150,105,0.16), rgba(16,185,129,0.22), rgba(52,211,153,0.16), rgba(16,185,129,0.22), rgba(5,150,105,0.16));
            background-size: 300% 100%;
        }
    `;
    const styleTag = document.createElement('style');
    styleTag.id = 'highlight-flash-style';
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
})();

// ==========================================
// TOAST NOTIFICATION LOGIC
// ==========================================
let toastTimeout;
function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification');
    const icon = document.getElementById('toast-icon');
    document.getElementById('toast-message').innerText = message;

    if (isError) { toast.classList.add('error'); toast.classList.remove('success'); icon.innerText = 'error'; }
    else { toast.classList.remove('error'); toast.classList.add('success'); icon.innerText = 'check_circle'; }

    // PATCH: tombol Copy khusus toast error -- biar pesan error lengkap
    // (yang sering kepotong secara visual) bisa disalin persis tanpa perlu
    // buka DevTools/inspect. Dibuat sekali lalu dipakai ulang tiap toast.
    let copyBtn = document.getElementById('toast-copy-btn');
    if (isError) {
        if (!copyBtn) {
            copyBtn = document.createElement('button');
            copyBtn.id = 'toast-copy-btn';
            copyBtn.type = 'button';
            copyBtn.innerText = 'Copy';
            copyBtn.style.cssText = 'margin-left:10px;padding:4px 10px;font-size:12px;line-height:1.2;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;flex-shrink:0;opacity:0.9;';
            toast.appendChild(copyBtn);
        }
        copyBtn.style.display = 'inline-block';
        copyBtn.innerText = 'Copy';
        copyBtn.onclick = async (e) => {
            e.stopPropagation();
            const textToCopy = document.getElementById('toast-message').innerText;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    // Fallback kalau Clipboard API tidak tersedia (mis. konteks non-HTTPS)
                    const ta = document.createElement('textarea');
                    ta.value = textToCopy;
                    ta.style.position = 'fixed'; ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.focus(); ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                copyBtn.innerText = 'Tersalin!';
            } catch (err) {
                copyBtn.innerText = 'Gagal copy';
            } finally {
                setTimeout(() => { if (copyBtn) copyBtn.innerText = 'Copy'; }, 1500);
            }
        };
    } else if (copyBtn) {
        copyBtn.style.display = 'none';
    }

    toast.classList.add('show');
    clearTimeout(toastTimeout);
    // Toast error dikasih waktu lebih lama supaya sempat ditekan tombol Copy-nya
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, isError ? 8000 : 3500);
}

// ==========================================
// PWA SETUP
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwa-floating-prompt').style.display = 'flex';
});
function triggerPwaInstall() {
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(() => { deferredPrompt = null; closePwaPrompt(); }); }
}
function closePwaPrompt() { document.getElementById('pwa-floating-prompt').style.display = 'none'; }

// Scroll Dinamis Document File
function enableNativeZoom() {
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
}
function disableNativeZoom() {
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

// ==========================================
// CONFIG & STATE
// ==========================================
// PATCH: dulu cuma 1 URL Apps Script. Sekarang jadi ARRAY supaya bisa nambah
// endpoint GAS cadangan (idealnya dari akun Google terpisah, biar dapat jatah
// kuota harian sendiri-sendiri) -- kalau endpoint pertama timeout/limit/gagal,
// otomatis coba endpoint berikutnya, jumlahnya bebas berapa saja.
const APP_SCRIPT_URLS = [
    "https://script.google.com/macros/s/AKfycbykiMleti8gpCdAqTlHy3ZQ083cDx9xXuuLvGSTwIv69K2C1cRur4QERkinaiFe23yO/exec"
    // , "https://script.google.com/macros/s/DEPLOYMENT_ID_CADANGAN_1/exec"
    // , "https://script.google.com/macros/s/DEPLOYMENT_ID_CADANGAN_2/exec"
];
const GAS_API_KEY = "GwadevingProduction";
// PATCH: dulu cuma 1 spreadsheet (SPREADSHEET_ID). Sekarang jadi ARRAY supaya
// bisa nambah spreadsheet cadangan lain kalau yang utama kena limit Google
// (baik limit baca/gviz, maupun limit ukuran spreadsheet). Data dari SEMUA
// spreadsheet di array ini akan dibaca & digabung otomatis saat app dibuka.
// Cara nambah: tinggal tempel ID spreadsheet baru di array ini (ID = bagian
// setelah /d/ di URL spreadsheet-nya). Spreadsheet baru WAJIB punya struktur
// tab yang sama persis (DB_01/DB_02/DB_03/DB_05) seperti spreadsheet utama.
const SPREADSHEET_IDS = [
    "1Gm7kCNLpI5nvbLVtea-Z7m8XSSgHeEXGgnGETmFH9EA"
    // , "ID_SPREADSHEET_CADANGAN_KEDUA"
    // , "ID_SPREADSHEET_CADANGAN_KETIGA"
];
const REALTIME_POLL_MS = 1000;
const TELEGRAM_BOT_TOKEN = "8873132791:AAH5XKQ6dcRVhY4NAgpGSJhsqzN5bVfK0lY";
const TELEGRAM_CHAT_ID = "-1004301320276";
const CHUNK_SIZE = 15 * 1024 * 1024;
const SECRET_KEY = "TeleCloud$3cur3Pss2026";
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 12;

let stateArray = { active: [], trash: [], folders: [] };
let currentTab = 'home';
let currentPath = '';
let currentUser = '';
let currentOwnerId = '';
let fileUrlCache = {};
let selectedFileIds = new Set();
let isSelectingMode = false;
let selectedFolderForAction = '';
let selectedFileForAction = null;
let suppressNextClick = false;
let accountsList = [];
let activeAccountOwnerId = '';
let accountSwitchToken = 0;
let preShareOwnerId = '';
let preShareUser = '';
let previewObjectUrls = new Set();
let selectedFolderPaths = new Set();
let moveTargetMode = '';
let clipboardItem = null; // { type: 'file'|'folder', id/path, label }
let uploadQueue = [];
let uploadQueueSeq = 0; // ID unik tiap item antrian (qid) -- dipakai untuk update kartu progress per-file
// Snapshot stabil dari file yang sedang benar-benar diproses worker pool saat
// upload jalan (lihat startMultiUpload). Dipakai HANYA untuk menghitung total
// aggregate progress -- terpisah dari uploadQueue supaya penghapusan otomatis
// file yang sudah "Selesai" (scheduleRemoveQueueItem) tidak bikin total salah.
let uploadDispatchList = [];
let activeUploadXhrs = new Set(); // FIX: dulu cuma 1 xhr aktif (currentActiveXhr) karena upload sekuensial;
                                  // sekarang beberapa file bisa upload BERSAMAAN jadi butuh Set biar
                                  // tombol batal (closeUploadModal) bisa abort SEMUA xhr yang lagi jalan.
const MAX_CONCURRENT_UPLOADS = 3; // berapa file yang boleh diupload bersamaan; sisanya otomatis antri
let editingTargetAccount = null;
let isUploadCancelled = false;
let lastUploadFailureMessage = null;
let isUploadInProgress = false;
let loginViewCloseable = false;
let sharedWithMeItems = [];
let realtimePollTimer = null;
let realtimePollBusy = false;
let lastDataSignature = null;
let lastSharedSignature = null;
// ID file yang lagi "ditunggu" untuk di-scroll+highlight begitu kartunya
// selesai dirender di tab Berkas (dipakai oleh goToFileAndHighlight()).
let pendingHighlightFileId = null;

// Share modal state
let shareCtx = { itemId: '', itemType: '', privacy: 'private', allowedUsers: [], shareId: null, linkRole: 'view' };
let shareUserSearchTimer = null;

// Upload-lewat-share state (dipakai saat viewer dengan akses Edit meng-upload file ke folder yang dibagikan)
let sharedUploadActive = false;
let sharedUploadFabRole = 'view';
let sharedUploadShareId = null;
let sharedUploadViewerUid = '';

// Shared public-view state
let pendingShareCode = null;
let pendingShareResolved = null;
let sharedViewerUid = '';
let sharedIsOwnerView = false;
// Peran (view/edit) untuk share tipe FILE tunggal (bukan folder) -- dipakai
// untuk menampilkan tombol "Ganti Nama" di halaman file yang dibagikan.
let sharedFileShareRole = 'view';
let sharedRootItem = null;
let sharedCurrentPath = '';
// FIX: dipakai renderSharedFolderBody() untuk tahu apakah pemanggilan ini
// adalah re-render REALTIME (dari tick polling, saat data berubah) atau
// navigasi manual/pembukaan awal -- supaya animasi masuk kartu cuma
// diputar sekali di awal, bukan tiap kali data di-refresh.
let sharedIsRealtimeRefresh = false;
let sharedHasRenderedOnce = false;
// Sama seperti sharedIsRealtimeRefresh di atas, tapi untuk halaman drive
// milik sendiri (lihat renderUI() & realtimePollTick).
let isOwnRealtimeRefresh = false;
// FIX BUG "STUCK SAAT RENAME/PRIVASI DIUBAH SAAT SEDANG DIBUKA": posisi
// browsing di dalam folder share disimpan sebagai SEGMEN NAMA relatif dari
// root (bukan path absolut). Path absolut basi kalau root/leluhurnya
// di-rename dari perangkat lain -- segmen nama relatif tidak, karena root
// selalu dihitung ulang segar tiap kali (lihat navigateSharedTo & polling).
let sharedPathSegments = [];
let sharedPollTimer = null;
let sharedLoginPromptDismissed = false;
let sharedSelectedIds = new Set();
let sharedSelectedFolderPaths = new Set();
let sharedIsSelecting = false;
let sharedContentsCache = { subfolders: [], files: [] };
let sharedCurrentFolderName = '';
let sharedDownloadCancelled = false;
const SHARE_POLL_INTERVAL_MS = 1000;
let sharedDataSignature = null;

let globalAbortController = null;
let currentActiveXhr = null;

let previewQueue = [];
let currentPreviewIndex = -1;
let sharedPreviewQueue = [];
let currentSharedPreviewIndex = -1;

// ==========================================
// FIX: ANTI CACHE-BASI GVIZ
// ==========================================
// Root cause 2 bug: "rename folder sempat kedeteksi hilang" dan "ubah privasi
// share gak nempel di halaman shared". Keduanya sama-sama gara-gara data
// dibaca lewat endpoint gviz (fetchRawSheets -> docs.google.com/.../gviz/tq),
// yang punya cache internal di sisi Google (BUKAN cache browser -- parameter
// "_=Date.now()" di URL-nya gak ngaruh ke ini) selama puluhan detik setelah
// ada tulisan baru ke Sheet. Jadi begitu kita habis nulis (rename/ubah privasi),
// polling berikutnya yang baca via gviz masih dapat snapshot LAMA dan menimpa
// tampilan yang tadinya sudah benar (bikin folder "hilang" sesaat / privasi
// balik seperti semula) -- sampai cache gviz-nya sendiri kedaluwarsa.
//
// Solusi: begitu ada aksi tulis, tandai "masa tenang" beberapa detik. Selama
// masa tenang itu, jangan percaya hasil gviz -- pakai jalur GAS langsung
// (callGasAPI / callGasAPIFetch) yang selalu baca data ter-update, walau
// sedikit lebih lambat/berat. Ditandai per-scope (per ownerId untuk data
// sendiri, per shareId untuk halaman share) dan disimpan di localStorage
// supaya juga kepakai lintas tab/lintas reload (kasus "halaman shared" biasanya
// dibuka di tab/reload terpisah dari tempat privasinya diubah).
const GVIZ_COOLDOWN_MS = 45000; // Cache gviz Google umumnya kedaluwarsa < 1 menit
function markRecentWrite(scopeKey) {
    if (!scopeKey) return;
    try { localStorage.setItem('gviz_cooldown_' + scopeKey, String(Date.now())); } catch (e) {}
}
function isInGvizCooldown(scopeKey) {
    if (!scopeKey) return false;
    try {
        const t = parseInt(localStorage.getItem('gviz_cooldown_' + scopeKey) || '0', 10);
        return (Date.now() - t) < GVIZ_COOLDOWN_MS;
    } catch (e) { return false; }
}


document.addEventListener('DOMContentLoaded', async () => {
    loadAccountsFromStorage();

    const urlParams = new URLSearchParams(window.location.search);
    const shareCode = urlParams.get('share');
    if (shareCode) { await handleSharedLink(shareCode); return; }

    await bootNormalApp();
});



async function bootNormalApp() {
    if (accountsList.length > 0) {
        showLoadingOverlay("Memeriksa sesi akun Anda...", false, false);
        const validAccounts = [];
        let hadNetworkIssue = false;

        for (const acc of accountsList) {
            const res = await callGasAPI('verify_account', { ownerId: acc.ownerId });
            if (res && res.success) { validAccounts.push(acc); }
            else if (res && res.networkError) { validAccounts.push(acc); hadNetworkIssue = true; }
        }

        accountsList = validAccounts;
        saveAccountsToStorage();

        if (accountsList.length > 0) {
            const activeAcc = getActiveStoredAccount();
            setActiveAccount(activeAcc);
            document.getElementById('login-view').style.display = 'none';
            document.getElementById('app-layout').style.display = 'flex';
            await syncData();
            startSharedWithMePolling();
            hideLoadingOverlay();
            if (hadNetworkIssue) showToast("Koneksi sedang tidak stabil / server sibuk. Sebagian data mungkin belum sinkron.", true);
        } else {
            hideLoadingOverlay();
            showLoginView();
        }
    } else {
        showLoginView();
    }
}

function showLoginView(closeable = false) {
    document.getElementById('app-layout').style.display = 'none';
    document.getElementById('shared-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'flex';
    loginViewCloseable = closeable;
    document.getElementById('login-close-btn').style.display = closeable ? 'flex' : 'none';
}
function closeLoginView() {
    if (!loginViewCloseable) return;
    document.getElementById('login-view').style.display = 'none';
    if (pendingShareResolved) { document.getElementById('shared-view').style.display = 'flex'; }
    else { document.getElementById('app-layout').style.display = accountsList.length > 0 ? 'flex' : 'none'; }
}

// ==========================================
// CUSTOM ALERTS & CONFIRMS
// ==========================================
let confirmActionCallback = null;
function showConfirm(message, title = "Konfirmasi", onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    confirmActionCallback = onConfirm;
    document.getElementById('custom-confirm-modal').style.display = 'flex';
}
function closeConfirm() { document.getElementById('custom-confirm-modal').style.display = 'none'; confirmActionCallback = null; }
document.getElementById('confirm-yes-btn').onclick = () => { if (confirmActionCallback) confirmActionCallback(); closeConfirm(); };

function showLoadingOverlay(text = "Memproses data...", showProgress = false, showCancel = false) {
    document.getElementById('loading-overlay-text').innerText = text;
    document.getElementById('loading-overlay-bar').style.width = '0%';
    document.getElementById('loading-overlay-percent').innerText = '0%';
    document.getElementById('loading-progress-container').style.display = showProgress ? 'flex' : 'none';
    document.getElementById('loading-cancel-btn').style.display = showCancel ? 'flex' : 'none';
    document.getElementById('loading-overlay-modal').style.display = 'flex';
}
function updateLoadingOverlay(percent, text) {
    if (text) document.getElementById('loading-overlay-text').innerText = text;
    document.getElementById('loading-overlay-bar').style.width = percent + '%';
    document.getElementById('loading-overlay-percent').innerText = percent + '%';
}
function hideLoadingOverlay() { document.getElementById('loading-overlay-modal').style.display = 'none'; }

function abortGlobalLoading() {
    sharedDownloadCancelled = true;
    if (globalAbortController) { globalAbortController.abort(); globalAbortController = null; }
    if (currentActiveXhr) { currentActiveXhr.abort(); currentActiveXhr = null; }
    hideLoadingOverlay();
    showToast("Operasi dibatalkan oleh pengguna.", true);
}

// ==========================================
// AUTH & ENCRYPTION SYSTEM
// ==========================================
function switchAuthView(viewId) {
    document.querySelectorAll('.auth-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}
function encryptPassword(pass) {
    let result = '';
    for (let i = 0; i < pass.length; i++) result += String.fromCharCode(pass.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
    return btoa(result);
}
function decryptPassword(encoded) {
    try {
        let decoded = atob(encoded); let result = '';
        for (let i = 0; i < decoded.length; i++) result += String.fromCharCode(decoded.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
        return result;
    } catch (e) { return encoded; }
}
function loadAccountsFromStorage() {
    try {
        let stored = localStorage.getItem('telecloud_accounts');
        if (stored) accountsList = JSON.parse(stored);
        if (!Array.isArray(accountsList)) accountsList = [];
        activeAccountOwnerId = localStorage.getItem('telecloud_active_owner') || (accountsList[0] && accountsList[0].ownerId) || '';
    } catch (e) { accountsList = []; }
}
function saveAccountsToStorage() { localStorage.setItem('telecloud_accounts', JSON.stringify(accountsList)); if (activeAccountOwnerId) localStorage.setItem('telecloud_active_owner', activeAccountOwnerId); }
function setActiveAccount(acc) { if (!acc) return; currentUser = acc.user; currentOwnerId = acc.ownerId; activeAccountOwnerId = acc.ownerId; localStorage.setItem('telecloud_active_owner', acc.ownerId); }
function getActiveStoredAccount() { return accountsList.find(a => a.ownerId === activeAccountOwnerId) || accountsList[0] || null; }

async function login(afterLoginCallback) {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    const btn = document.getElementById('btn-login');
    if (!u || !p) return showToast("Username dan kata sandi wajib diisi.", true);

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px; animation: spin 1s linear infinite;">sync</span> Loading...`;

    try {
        const encPass = encryptPassword(p);
        const res = await callGasAPI('login', { username: u, password: encPass });
        if (res && res.success) {
            const existingIndex = accountsList.findIndex(acc => acc.user === u || acc.ownerId === res.ownerId);
            const accountRecord = { user: u, pass: encPass, ownerId: res.ownerId };
            if (existingIndex >= 0) accountsList[existingIndex] = accountRecord; else accountsList.push(accountRecord);
            setActiveAccount(accountRecord);
            saveAccountsToStorage();

            document.getElementById('login-view').style.display = 'none';
            showToast(`Berhasil Login! Sebagai ${u}`, false);

            if (pendingShareCode) {
                await handleSharedLink(pendingShareCode);
            } else {
                document.getElementById('app-layout').style.display = 'flex';
                await syncData();
                startSharedWithMePolling();
            }
            if (typeof afterLoginCallback === 'function') afterLoginCallback();
        } else {
            showToast((res && res.message) || "Username atau sandi salah.", true);
        }
    } finally { btn.disabled = false; btn.innerHTML = originalText; }
}

async function registerAccount() {
    const u = document.getElementById('reg-username').value.trim();
    const p = document.getElementById('reg-password').value.trim();
    const btn = document.getElementById('btn-register');
    if (!u || !p) return showToast("Semua kolom wajib diisi.", true);
    // FIX #5: validasi format di client (server tetap validasi ulang -- ini cuma
    // supaya user langsung dapat feedback tanpa perlu roundtrip ke server dulu).
    if (!/^[A-Za-z0-9_.\-]{3,24}$/.test(u)) return showToast("Username hanya boleh huruf, angka, titik, garis bawah, atau strip (3-24 karakter).", true);

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px; animation: spin 1s linear infinite;">sync</span> Memproses...`;
    try {
        const encPass = encryptPassword(p);
        const res = await callGasAPI('signup', { username: u, password: encPass });
        if (res && res.success !== false) {
            showToast("Akun berhasil dibuat! Silakan masuk.", false);
            document.getElementById('username').value = u; document.getElementById('password').value = p;
            switchAuthView('sec-login');
        } else { showToast((res && res.message) || "Username sudah dipakai.", true); }
    } finally { btn.disabled = false; btn.innerHTML = originalText; }
}

async function resetPassword() {
    const u = document.getElementById('forgot-username').value.trim();
    const btn = document.getElementById('btn-forgot');
    if (!u) return showToast("Masukkan username Anda.", true);
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px; animation: spin 1s linear infinite;">sync</span> Memproses...`;
    const res = await callGasAPI('forgot_password', { username: u });
    btn.disabled = false; btn.innerHTML = originalText;
    if (res && res.success !== false) { showToast("Instruksi reset sandi telah diproses.", false); switchAuthView('sec-login'); }
    else { showToast((res && res.message) || "Username tidak ditemukan.", true); }
}

function openProfileModal() {
    const container = document.getElementById('account-list-container');
    container.innerHTML = '';
    accountsList.forEach(acc => {
        const isActive = acc.user === currentUser;
        const item = document.createElement('div');
        item.className = `account-item ${isActive ? 'active-acc' : ''}`;
        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex:1;" onclick="switchAccountByName('${acc.user}')">
                <span class="material-symbols-rounded" style="color: ${isActive ? 'var(--primary)' : 'var(--text-muted)'};">account_circle</span>
                <div>
                    <div style="font-size:14px; font-weight:700; color:var(--text-primary);">${acc.user}</div>
                    <div class="account-uid-tag">ID: ${acc.ownerId}</div>
                </div>
            </div>
            <button class="icon-btn" onclick="openEditAccountModal('${acc.user}', event)" title="Opsi Akun"><span class="material-symbols-rounded" style="font-size:22px;">more_vert</span></button>
        `;
        container.appendChild(item);
    });
    document.getElementById('profile-modal').style.display = 'flex';
}
function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }

function openEditAccountModal(username, event) {
    if (event) event.stopPropagation();
    editingTargetAccount = accountsList.find(a => a.user === username);
    if (!editingTargetAccount) return;
    document.getElementById('update-username').value = editingTargetAccount.user;
    document.getElementById('update-password').value = decryptPassword(editingTargetAccount.pass);
    document.getElementById('edit-account-modal').style.display = 'flex';
}
function closeEditAccountModal() { document.getElementById('edit-account-modal').style.display = 'none'; editingTargetAccount = null; }

function switchAccountByName(username) { const acc = accountsList.find(a => a.user === username); if (acc) switchAccount(acc); }

async function switchAccount(acc) {
    if (!acc || !acc.ownerId) return;
    const token = ++accountSwitchToken;
    closeProfileModal();
    showLoadingOverlay(`Beralih ke akun ${acc.user}...`, false, false);
    try {
        const res = await callGasAPI('verify_account', { ownerId: acc.ownerId });
        if (token !== accountSwitchToken) return;
        if (!res || (!res.success && !res.networkError)) throw new Error((res && res.message) || 'Akun tidak valid.');
        setActiveAccount(acc);
        stateArray = { active: [], trash: [], folders: [] };
        selectedFileIds.clear(); selectedFolderPaths.clear();
        lastDataSignature = null;
        // FIX: dulu currentTab/currentPath dibiarkan APA ADANYA saat pindah
        // akun -- kalau sebelumnya sedang berada di dalam sebuah folder,
        // path folder itu (milik akun LAMA) ikut kebawa ke akun baru. Karena
        // folder dengan path itu hampir pasti tidak ada di akun baru, hasilnya
        // tampilan "nyangkut" kosong di lokasi yang tidak pernah ada. Sekarang
        // dipaksa reset ke Beranda (root) setiap kali pindah akun.
        currentTab = 'home'; currentPath = '';
        document.getElementById('search-input').value = '';
        ['home', 'files', 'folders', 'trash'].forEach(t => {
            const sb = document.getElementById('nav-' + t); if (sb) sb.className = t === 'home' ? 'nav-item active' : 'nav-item';
            const bn = document.getElementById('bnav-' + t); if (bn) bn.className = t === 'home' ? 'bottom-nav-item active' : 'bottom-nav-item';
        });
        renderUI();
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('app-layout').style.display = 'flex';
        await syncData();
        if (token === accountSwitchToken) startSharedWithMePolling();
    } catch (e) {
        showToast('Gagal berpindah akun: ' + e.message, true);
    } finally {
        if (token === accountSwitchToken) hideLoadingOverlay();
    }
}

async function updateCredentials() {
    if (!editingTargetAccount) return;
    const newUsername = document.getElementById('update-username').value.trim();
    const newPassword = document.getElementById('update-password').value.trim();
    if (!newUsername || !newPassword) return showToast("Username dan Password baru wajib diisi", true);

    showLoadingOverlay("Menyimpan Kredensial Baru...", false, false);
    const encPass = encryptPassword(newPassword);
    const res = await callGasAPI('update_credentials', { oldOwnerId: editingTargetAccount.ownerId, newUsername: newUsername, newPassword: encPass });
    hideLoadingOverlay();
    if (res && res.success) {
        const idx = accountsList.findIndex(a => a.user === editingTargetAccount.user);
        if (idx !== -1) { accountsList[idx].user = newUsername; accountsList[idx].pass = encPass; }
        if (currentUser === editingTargetAccount.user) currentUser = newUsername;
        saveAccountsToStorage();
        showToast("Kredensial berhasil diperbarui!", false);
        closeEditAccountModal();
        openProfileModal();
        renderUI();
    } else { showToast((res && res.message) || "Gagal mengubah akun.", true); }
}

function confirmDeleteAccountPermanently() {
    if (!editingTargetAccount) return;
    showConfirm(`Hapus akun ${editingTargetAccount.user} beserta semua berkasnya secara permanen dari server?`, "Hapus Akun Permanen", async () => {
        showLoadingOverlay("Menghapus akun dan berkas dari server...", false, false);
        const targetOwnerId = editingTargetAccount.ownerId;
        const targetUser = editingTargetAccount.user;
        await callGasAPI('delete_account_complete', { ownerId: targetOwnerId });
        hideLoadingOverlay();
        closeEditAccountModal();
        accountsList = accountsList.filter(acc => acc.user !== targetUser);
        saveAccountsToStorage();
        if (currentUser === targetUser) {
            activeAccountOwnerId = accountsList[0] ? accountsList[0].ownerId : '';
            if (accountsList.length > 0) switchAccount(getActiveStoredAccount()); else location.reload();
        } else { openProfileModal(); showToast("Akun berhasil dihapus.", false); }
    });
}

function addAnotherAccount() {
    closeProfileModal();
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    showLoginView(true);
    switchAuthView('sec-login');
}

function logoutCurrent() {
    accountsList = accountsList.filter(acc => acc.ownerId !== currentOwnerId);
    activeAccountOwnerId = accountsList[0] ? accountsList[0].ownerId : '';
    saveAccountsToStorage();
    if (accountsList.length > 0) switchAccount(getActiveStoredAccount()); else location.reload();
}

// ==========================================
// CORE APP FUNCTIONS
// ==========================================
function toggleSidebar() {
    document.getElementById('app-sidebar').classList.toggle('open');
    document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function openActionMenuModal() {
    const container = document.getElementById('action-menu-modal').querySelector('.modal-content > div:last-child');
    let pasteEl = document.getElementById('action-menu-paste-item');
    if (pasteEl) pasteEl.remove();
    if (clipboardItem && container && ['home','files'].includes(currentTab)) {
        const div = document.createElement('div');
        div.id = 'action-menu-paste-item';
        div.innerHTML = `
            <div class="action-menu-item" onclick="closeActionMenuModal(); pasteClipboardHere();">
                <span class="material-symbols-rounded" style="color:var(--primary);">content_paste</span><span>Tempel "${clipboardItem.label}" di sini</span>
            </div>
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">`;
        container.insertBefore(div, container.firstChild);
    }
    document.getElementById('action-menu-modal').style.display = 'flex';
}
function closeActionMenuModal() { document.getElementById('action-menu-modal').style.display = 'none'; }

function mimeFromExt(ext) {
    const f = (ext || '').toLowerCase();
    if (['mp4', 'mov'].includes(f)) return 'video/mp4'; if (f === 'webm') return 'video/webm';
    if (f === 'mkv') return 'video/x-matroska'; if (['jpg', 'jpeg'].includes(f)) return 'image/jpeg';
    if (f === 'png') return 'image/png'; if (f === 'webp') return 'image/webp';
    if (f === 'gif') return 'image/gif'; if (f === 'svg') return 'image/svg+xml';
    if (f === 'mp3') return 'audio/mpeg'; if (f === 'wav') return 'audio/wav';
    if (f === 'ogg') return 'audio/ogg'; if (f === 'm4a') return 'audio/mp4';
    if (f === 'pdf') return 'application/pdf';
    return 'application/octet-stream';
}

const CORS_PROXY_BUILDERS = [
    { label: 'Worker 1', build: (url) => WORKER_POOL[0] + '/proxy?token=' + WORKER_PASSWORD + '&url=' + encodeURIComponent(url) },
    { label: 'Worker 2', build: (url) => WORKER_POOL[1] + '/proxy?token=' + WORKER_PASSWORD + '&url=' + encodeURIComponent(url) },
    { label: 'corsproxy.io', build: (url) => 'https://corsproxy.io/?url=' + encodeURIComponent(url) },
    { label: 'allorigins', build: (url) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) }
];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetryRaw(url, { retries = 2, timeoutMs = 60000, onProgress, signal } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const combinedSignal = signal || controller.signal;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: combinedSignal });
            clearTimeout(timer);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const contentLength = response.headers.get('content-length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            if (!response.body) { const blob = await response.blob(); if (onProgress) onProgress(100); return blob; }
            const reader = response.body.getReader();
            let receivedLength = 0; const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) { chunks.push(value); receivedLength += value.length; if (onProgress && total > 0) onProgress(Math.round((receivedLength / total) * 100)); }
            }
            return new Blob(chunks);
        } catch (e) {
            clearTimeout(timer); lastErr = e;
            if (signal && signal.aborted) throw new Error("Dibatalkan oleh pengguna");
            if (attempt < retries) await sleep(800 * attempt);
        }
    }
    throw lastErr || new Error('Gagal memuat dari server.');
}

async function fetchBinaryWithFallback(url, onProgress, signal) {
    for (const proxy of CORS_PROXY_BUILDERS) {
        try { return await fetchWithRetryRaw(proxy.build(url), { retries: 1, timeoutMs: 30000, onProgress, signal }); } catch (e) { if (signal && signal.aborted) throw e; }
    }
    throw new Error('Semua jalur koneksi gagal.');
}

async function reconstructFileParts(chunksMeta, onOverallProgress, signal) {
    const parts = [];
    for (let i = 0; i < chunksMeta.length; i++) {
        if (signal && signal.aborted) throw new Error("Dibatalkan oleh pengguna");
        const chunk = chunksMeta[i];
        const pathBlob = await fetchBinaryWithFallback(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${chunk.telegramFileId}`, null, signal);
        const pathText = await pathBlob.text();
        const pathData = JSON.parse(pathText);
        if (!pathData.ok) throw new Error(`Gagal mengambil data.`);
        const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${pathData.result.file_path}`;
        const buf = await fetchBinaryWithFallback(fileUrl, (percent) => {
            if (onOverallProgress) { const overall = Math.round(((i * 100) + percent) / chunksMeta.length); onOverallProgress(overall, i + 1, chunksMeta.length); }
        }, signal);
        parts.push(buf);
    }
    return parts;
}

// ==========================================
// PATCH: pemanggil GAS 1 endpoint tunggal (dipakai internal oleh wrapper
// fallback di bawah). Sama persis seperti versi lama, cuma URL-nya sekarang
// jadi parameter, bukan konstanta tetap.
// ==========================================
function callGasAPIOnce_(gasUrl, action, payload) {
    return new Promise((resolve) => {
        payload.action = action; payload.apiKey = GAS_API_KEY;
        const callbackName = 'gas_callback_' + Math.round(100000 * Math.random());
        let isResolved = false;
        const timeoutId = setTimeout(() => {
            if (!isResolved) { isResolved = true; delete window[callbackName]; resolve({ success: false, message: "Koneksi terputus, server sedang sibuk. Coba lagi nanti.", networkError: true }); }
        }, 15000);
        window[callbackName] = function (data) { if (isResolved) return; isResolved = true; clearTimeout(timeoutId); delete window[callbackName]; resolve(data); };
        const script = document.createElement('script');
        script.src = `${gasUrl}?callback=${callbackName}&data=${encodeURIComponent(JSON.stringify(payload))}`;
        script.onerror = () => { if (isResolved) return; isResolved = true; clearTimeout(timeoutId); delete window[callbackName]; resolve({ success: false, message: "Koneksi server gagal. Coba lagi nanti.", networkError: true }); };
        document.body.appendChild(script);
    });
}

// Coba SEMUA endpoint di APP_SCRIPT_URLS berurutan. Pindah ke endpoint
// berikutnya HANYA kalau kegagalannya bersifat koneksi/limit/timeout
// (networkError:true) -- bukan kegagalan logika bisnis biasa (misal
// "Username sudah terdaftar!"), supaya pesan error yang relevan tetap
// sampai ke user apa adanya, bukan malah disembunyikan oleh percobaan ulang.
async function callGasAPI(action, payload = {}) {
    // FIX #4: sebelum benar-benar dianggap error, ulangi seluruh siklus endpoint
    // sampai 3x total (dengan jeda singkat) -- baru kalau SEMUA percobaan gagal
    // karena masalah koneksi/limit, hasil error itu diteruskan ke pemanggil.
    let lastResult = { success: false, message: "Tidak ada endpoint GAS yang terpasang.", networkError: true };
    for (let round = 0; round < 3; round++) {
        for (let i = 0; i < APP_SCRIPT_URLS.length; i++) {
            lastResult = await callGasAPIOnce_(APP_SCRIPT_URLS[i], action, { ...payload });
            if (!lastResult.networkError) return lastResult; // sukses ATAU gagal karena alasan bisnis -> berhenti di sini
            console.warn(`[Gwadeving] Endpoint GAS #${i + 1} gagal/limit, coba endpoint berikutnya...`);
        }
        if (round < 2) await sleep(600 * (round + 1));
    }
    return lastResult; // semua endpoint & semua percobaan ulang gagal
}

async function callGasAPIFetchOnce_(gasUrl, action, payload) {
    payload.action = action; payload.apiKey = GAS_API_KEY;
    try {
        const res = await fetch(`${gasUrl}?data=${encodeURIComponent(JSON.stringify(payload))}`, { method: 'GET' });
        if (!res.ok) return { success: false, message: 'Gagal terhubung ke server.', networkError: true };
        return await res.json();
    } catch (e) {
        return { success: false, message: 'Koneksi terputus, coba lagi nanti.', networkError: true };
    }
}

async function callGasAPIFetch(action, payload = {}) {
    // FIX #4: sama seperti callGasAPI -- coba ulang sampai 3x siklus dulu.
    let lastResult = { success: false, message: "Tidak ada endpoint GAS yang terpasang.", networkError: true };
    for (let round = 0; round < 3; round++) {
        for (let i = 0; i < APP_SCRIPT_URLS.length; i++) {
            lastResult = await callGasAPIFetchOnce_(APP_SCRIPT_URLS[i], action, { ...payload });
            if (!lastResult.networkError) return lastResult;
            console.warn(`[Gwadeving] Endpoint GAS #${i + 1} gagal/limit, coba endpoint berikutnya...`);
        }
        if (round < 2) await sleep(600 * (round + 1));
    }
    return lastResult;
}

// ==========================================
// PATCH: dulu pakai form + iframe tersembunyi yang cuma "percaya" request
// sukses begitu iframe-nya kelar loading (padahal itu juga tetap kelar
// loading walau GAS-nya error/limit -- gak bisa dibedain). Sekarang pakai
// fetch POST biasa (field 'payload', SAMA seperti yang dibaca index.gs lewat
// e.parameter.payload) supaya respons aslinya bisa dibaca, dan endpoint bisa
// di-fallback kalau salah satu limit/gagal -- sama seperti callGasAPI.
// ==========================================
// FIX BUG NYATA: sebelumnya pakai fetch() untuk POST ke GAS. Google Apps
// Script Web App SELALU membalas permintaan awal dengan redirect 302 ke URL
// eksekusi sebenarnya (script.googleusercontent.com) -- dan sesuai spesifikasi
// fetch(), redirect 301/302 pada method POST diubah paksa jadi GET TANPA BODY
// oleh browser. Akibatnya sesekali (tergantung timing/cache Google) request
// yang sampai ke server itu GET kosong -> e.parameter.data & e.parameter.payload
// dua-duanya kosong -> "Tidak ada data yang dikirim", PADAHAL upload
// chunk-nya sendiri sudah sukses duluan (makanya UI kadang sempat menampilkan
// filenya lewat polling gviz walau pesan error ini muncul). XMLHttpRequest
// (dipakai di sini) mempertahankan method POST & body-nya lewat redirect,
// jadi tidak kena masalah ini.
function saveMetadataOnce_(gasUrl, action, payload) {
    payload.action = action; payload.apiKey = GAS_API_KEY;
    return new Promise((resolve) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', gasUrl, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.timeout = 30000;
            xhr.onload = () => {
                if (xhr.status < 200 || xhr.status >= 300) { resolve({ success: false, message: 'Gagal terhubung ke server.', networkError: true }); return; }
                try { resolve(JSON.parse(xhr.responseText)); }
                catch (e) { resolve({ success: false, message: 'Respons server tidak valid.', networkError: true }); }
            };
            xhr.onerror = () => resolve({ success: false, message: 'Koneksi terputus, coba lagi nanti.', networkError: true });
            xhr.ontimeout = () => resolve({ success: false, message: 'Koneksi terputus, coba lagi nanti.', networkError: true });
            xhr.send('payload=' + encodeURIComponent(JSON.stringify(payload)));
        } catch (e) {
            resolve({ success: false, message: 'Koneksi terputus, coba lagi nanti.', networkError: true });
        }
    });
}

async function saveMetadataViaForm(payload, action = "save_metadata") {
    // FIX #4: retry penuh sampai 3x siklus sebelum dianggap gagal permanen.
    let lastResult = { success: false, message: "Tidak ada endpoint GAS yang terpasang.", networkError: true };
    for (let round = 0; round < 3; round++) {
        for (let i = 0; i < APP_SCRIPT_URLS.length; i++) {
            lastResult = await saveMetadataOnce_(APP_SCRIPT_URLS[i], action, { ...payload });
            if (!lastResult.networkError) return lastResult;
            console.warn(`[Gwadeving] Endpoint GAS #${i + 1} gagal/limit saat simpan metadata, coba endpoint berikutnya...`);
        }
        if (round < 2) await sleep(600 * (round + 1));
    }
    return lastResult;
}

// ==========================================
// ENKRIPSI DATA SENSITIF (harus SAMA PERSIS dengan CRYPTO_KEY di index.gs)
// Dipakai untuk mendekripsi kolom name/originalName/thumbId/chunksJSON yang
// dibaca langsung dari spreadsheet (gviz), supaya data mentah di spreadsheet
// tidak bisa dibaca sembarang orang meski sheet-nya terbuka/published.
// ==========================================
const CRYPTO_KEY = "TeleCloud$3cur3P@ss2026";

function encField(str) {
    if (!str) return '';
    try {
        const encodedURI = encodeURIComponent(String(str));
        let bin = '';
        for (let i = 0; i < encodedURI.length; i++) {
            bin += String.fromCharCode(encodedURI.charCodeAt(i) ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length));
        }
        return btoa(bin);
    } catch(e) { return String(str); }
}

function decField(str) {
    if (!str) return '';
    try {
        const bin = atob(String(str));
        let decodedURI = '';
        for (let i = 0; i < bin.length; i++) {
            decodedURI += String.fromCharCode(bin.charCodeAt(i) ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length));
        }
        try {
            return decodeURIComponent(decodedURI);
        } catch(err) {
            // Fallback keamanan jika membaca file lama yang belum pakai standar baru
            const kb = new TextEncoder().encode(CRYPTO_KEY);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ kb[i % kb.length];
            return new TextDecoder('utf-8').decode(bytes);
        }
    } catch(e) { return String(str); } 
}

// ==========================================
// BACA DARI SPREADSHEET (gviz)
// ==========================================
// FIX #4: bungkus gvizFetchSheet dengan retry (2x percobaan ulang) sebelum
// benar-benar melempar error ke pemanggil (fetchRawSheets).
async function gvizFetchSheetWithRetry_(sheetName, spreadsheetId, retries = 3) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try { return await gvizFetchSheet(sheetName, spreadsheetId); }
        catch (e) { lastErr = e; if (i < retries - 1) await sleep(500 * (i + 1)); }
    }
    throw lastErr;
}
function gvizFetchSheet(sheetName, spreadsheetId) {
    spreadsheetId = spreadsheetId || SPREADSHEET_IDS[0];
    return new Promise((resolve, reject) => {
        const cbName = 'gviz_cb_' + Math.round(1000000 * Math.random());
        let isDone = false;
        const timeoutId = setTimeout(() => {
            if (isDone) return; isDone = true; delete window[cbName];
            if (script.parentNode) script.remove();
            reject(new Error(`Timeout membaca sheet ${sheetName} (spreadsheet ${spreadsheetId})`));
        }, 10000);
        window[cbName] = function (resp) {
            if (isDone) return; isDone = true; clearTimeout(timeoutId); delete window[cbName];
            try {
                if (!resp || resp.status === 'error' || !resp.table) { reject(new Error(`gviz error pada sheet ${sheetName} (spreadsheet ${spreadsheetId})`)); return; }
                const rows = (resp.table.rows || []).map(r => (r.c || []).map(cell => (cell && cell.v !== undefined && cell.v !== null) ? cell.v : ''));
                resolve(rows);
            } catch (err) { reject(err); }
        };
        const script = document.createElement('script');
        script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json;responseHandler:${cbName}&sheet=${encodeURIComponent(sheetName)}&headers=1&_=${Date.now()}`;
        script.onerror = () => { if (isDone) return; isDone = true; clearTimeout(timeoutId); delete window[cbName]; reject(new Error(`Gagal memuat sheet ${sheetName} (spreadsheet ${spreadsheetId})`)); };
        script.onload = () => { if (script.parentNode) script.remove(); };
        document.body.appendChild(script);
    });
}

// ==========================================
// PATCH: REKONSTRUKSI FIELD PANJANG YANG MELEBIHI BATAS 1 CELL
// Google Sheets punya batas ~50.000 karakter per cell. Field seperti
// chunksJSON (daftar potongan file di Telegram) bisa melebihi itu untuk
// file besar yang kepecah jadi sangat banyak chunk. Konvensinya: kalau nilai
// di 1 cell "kepenggal", cell itu diakhiri penanda OVERFLOW_MARKER, dan
// sisanya disambung di kolom-kolom berikutnya (mulai index 9) pada baris
// yang sama, masing-masing juga diakhiri marker KECUALI potongan terakhir.
// PENTING: ini baru sisi BACA (front-end). Sisi TULIS (Google Apps Script /
// index.gs, yang memutuskan kapan harus memecah nilai panjang saat nyimpan)
// belum ikut di-update di sini karena file index.gs belum pernah dikirim ke
// saya -- kirim file itu kalau mau bagian tulisnya ikut dibuatkan.
// Field pendek (nama file dkk) 100% tidak terpengaruh/tetap seperti biasa,
// karena tidak akan pernah diakhiri marker ini.
// ==========================================
const OVERFLOW_MARKER = '§OVERFLOW§';
function reassembleLongField_(row, baseIndex, overflowStartIndex = 9) {
    let value = (row[baseIndex] !== undefined && row[baseIndex] !== null) ? String(row[baseIndex]) : '';
    if (!value.endsWith(OVERFLOW_MARKER)) return value; // muat penuh di 1 cell, tidak ada sambungan
    value = value.slice(0, -OVERFLOW_MARKER.length);
    let i = overflowStartIndex;
    while (row[i] !== undefined && row[i] !== null && row[i] !== '') {
        const part = String(row[i]);
        if (part.endsWith(OVERFLOW_MARKER)) { value += part.slice(0, -OVERFLOW_MARKER.length); i++; }
        else { value += part; break; }
    }
    return value;
}

function decryptFileRows_(rows, overflowStartIndex = 9) {
    // FIX #6: backend sekarang mengenkripsi SEMUA kolom (bukan cuma
    // name/originalName/thumbId/chunksJSON seperti sebelumnya) -- jadi
    // kolom id(0)/format(3)/folder(4)/size(5)/ownerId(overflowStartIndex-1)
    // ikut didekripsi di sini juga, supaya semua kode lain yang membaca
    // raw.sheet1Rows/raw.trashRows tetap menerima data PLAINTEXT seperti biasa.
    // Kolom 8 dipakai ownerId di data aktif (overflowStartIndex=9), kolom 9
    // dipakai ownerId di data Trash (overflowStartIndex=10, karena ada kolom
    // tambahan "expire" di index 8 yang juga sudah terenkripsi).
    const ownerIdIndex = overflowStartIndex - 1;
    return rows.map(r => {
        const copy = r.slice();
        if (copy.length > 0) copy[0] = decField(copy[0]);
        if (copy.length > 1) copy[1] = decField(reassembleLongField_(copy, 1, overflowStartIndex));
        if (copy.length > 2) copy[2] = decField(reassembleLongField_(copy, 2, overflowStartIndex));
        if (copy.length > 3) copy[3] = decField(copy[3]);
        if (copy.length > 4) copy[4] = decField(copy[4]);
        if (copy.length > 5) copy[5] = Number(decField(copy[5])) || 0;
        if (copy.length > 6) copy[6] = decField(reassembleLongField_(copy, 6, overflowStartIndex));
        if (copy.length > 7) copy[7] = decField(reassembleLongField_(copy, 7, overflowStartIndex));
        if (overflowStartIndex === 10 && copy.length > 8) copy[8] = decField(copy[8]); // expire (khusus Trash)
        if (copy.length > ownerIdIndex) copy[ownerIdIndex] = decField(copy[ownerIdIndex]);
        // Kolom overflow (index >= overflowStartIndex) sudah "menyatu" ke kolom 1/2/6/7
        // lewat reassembleLongField_ -- potong supaya bentuk baris balik konsisten (9/10 kolom).
        return copy.slice(0, overflowStartIndex);
    });
}

// FIX #6: DB_03 (folder) sekarang juga terenkripsi penuh -- path (0) & ownerId (1).
// Kolom 2 (createdDate) sudah terenkripsi sejak awal tapi tidak dipakai di client, dibiarkan.
function decryptFolderRows_(rows) {
    return rows.map(r => {
        const copy = r.slice();
        if (copy.length > 0) copy[0] = decField(copy[0]);
        if (copy.length > 1) copy[1] = decField(copy[1]);
        return copy;
    });
}

// FIX #6: DB_05 (share) sekarang juga terenkripsi penuh: shareId(0), itemId(1),
// itemType(2), ownerId(3), ownerName(4), privacy(5), allowedUsersJSON(6), linkRole(9).
// Kolom 7/8 (createdAt/updatedAt) sudah terenkripsi sejak awal & tidak dipakai client.
function decryptShareRows_(rows) {
    return rows.map(r => {
        const copy = r.slice();
        [0, 1, 2, 3, 4, 5, 6, 9].forEach(idx => { if (copy.length > idx) copy[idx] = decField(copy[idx]); });
        return copy;
    });
}

// PATCH: sebelumnya cuma baca 1 spreadsheet. Sekarang loop semua ID di
// SPREADSHEET_IDS secara paralel, lalu gabung hasilnya jadi satu data
// terpadu -- jadi walau datanya "terpencar" di beberapa spreadsheet (karena
// yang lama kena limit lalu ditambah spreadsheet baru), tetap tampil normal
// seolah satu sumber. Kalau salah satu spreadsheet gagal dibaca (limit/error/
// belum ada), yang itu dilewati saja, TIDAK bikin semuanya ikut gagal.
async function fetchRawSheets() {
    const results = await Promise.allSettled(SPREADSHEET_IDS.map(async (id) => {
        const [sheet1Rows, trashRows, folderRows, sharesRows] = await Promise.all([
            gvizFetchSheetWithRetry_('DB_01', id),
            gvizFetchSheetWithRetry_('DB_02', id),
            gvizFetchSheetWithRetry_('DB_03', id),
            gvizFetchSheetWithRetry_('DB_05', id)
        ]);
        return { sheet1Rows, trashRows, folderRows, sharesRows, id };
    }));

    const merged = { sheet1Rows: [], trashRows: [], folderRows: [], sharesRows: [] };
    results.forEach((r) => {
        if (r.status === 'fulfilled') {
            merged.sheet1Rows.push(...r.value.sheet1Rows);
            merged.trashRows.push(...r.value.trashRows);
            merged.folderRows.push(...r.value.folderRows);
            merged.sharesRows.push(...r.value.sharesRows);
        } else {
            console.warn('[Gwadeving] Satu spreadsheet gagal dibaca, dilewati:', r.reason);
        }
    });
    if (results.every(r => r.status === 'rejected')) {
        throw new Error('Semua spreadsheet gagal dibaca (cek koneksi / semua kena limit sekaligus).');
    }

    // Dedup berdasarkan ID baris (kolom index 0) jaga-jaga kalau suatu saat ada
    // ID yang sama kebetulan muncul di lebih dari satu spreadsheet.
    const dedupById = (rows) => {
        const map = new Map();
        for (const row of rows) { const id = String(row[0]); if (!map.has(id)) map.set(id, row); }
        return Array.from(map.values());
    };

    return {
        sheet1Rows: decryptFileRows_(dedupById(merged.sheet1Rows), 9),
        trashRows: decryptFileRows_(dedupById(merged.trashRows), 10),
        folderRows: decryptFolderRows_(dedupById(merged.folderRows)),
        sharesRows: decryptShareRows_(dedupById(merged.sharesRows))
    };
}


// Ambil metadata chunks (Telegram file id) langsung dari data mentah (gviz) yang
// sudah didekripsi, tanpa perlu memanggil backend GAS -> hemat kuota GAS untuk
// preview/unduh berkas di halaman share.
function getChunksFromRaw_(raw, fileId, ownerId) {
    if (!raw || !raw.sheet1Rows) return null;
    const row = raw.sheet1Rows.find(r => String(r[0]) === String(fileId) && String(r[8]) === String(ownerId));
    if (!row || !row[7]) return null;
    try { return JSON.parse(row[7]); } catch (e) { return null; }
}

function buildStateArrayFromRaw(raw, ownerId) {
    const activeMap = new Map(), trashMap = new Map(), folderMap = new Map();
    const exactShareMap = new Map();

    if (raw.sharesRows) {
        raw.sharesRows.forEach(r => {
            if (String(r[3]) === String(ownerId)) {
                exactShareMap.set(r[1] + '_' + r[2], { shareId: r[0], privacy: r[5], allowedUsers: r[6], linkRole: r[9] || 'view', isInherited: false });
            }
        });
    }

    function getEffectiveShare(itemId, itemFolder, isFile) {
        const exact = exactShareMap.get(itemId + '_' + (isFile ? 'file' : 'folder'));
        if (exact) return exact;

        let currentParent = isFile ? itemFolder : (itemId.lastIndexOf('/') !== -1 ? itemId.substring(0, itemId.lastIndexOf('/')) : null);
        
        while (currentParent && currentParent !== '#*null*#') {
            const parentShare = exactShareMap.get(currentParent + '_folder');
            if (parentShare) {
                return { shareId: parentShare.shareId, privacy: parentShare.privacy, allowedUsers: parentShare.allowedUsers, isInherited: true };
            }
            const lastSlash = currentParent.lastIndexOf('/');
            if (lastSlash === -1) break;
            currentParent = currentParent.substring(0, lastSlash);
        }
        return { shareId: null, privacy: 'private', allowedUsers: '[]', isInherited: false };
    }

    for (const row of raw.folderRows) { 
        if (String(row[1]) === String(ownerId)) { 
            const sInfo = getEffectiveShare(row[0], null, false);
            folderMap.set(row[0], { path: row[0], owner: row[1], shareInfo: sInfo }); 
        } 
    }
    
    for (const row of raw.sheet1Rows) { 
        if (String(row[8]) === String(ownerId)) { 
            const sInfo = getEffectiveShare(row[0], row[4], true);
            activeMap.set(row[0], { id: row[0], name: row[1], originalName: row[2], format: row[3], folder: row[4], size: row[5], thumbId: row[6], shareInfo: sInfo }); 
        } 
    }
    
    for (const row of raw.trashRows) { 
        if (String(row[9]) === String(ownerId)) { 
            trashMap.set(row[0], { id: row[0], name: row[1], originalName: row[2], format: row[3], folder: row[4], size: row[5], thumbId: row[6] }); 
        } 
    }
    return { active: Array.from(activeMap.values()), trash: Array.from(trashMap.values()), folders: Array.from(folderMap.values()) };
}

function resolveItemNameClient(sheet1Rows, folderRows, itemId, itemType, ownerId) {
    if (itemType === 'file') {
        for (const row of sheet1Rows) { if (row[0] === itemId && String(row[8]) === ownerId) return row[1]; }
        return null;
    }
    for (const row of folderRows) { if (row[0] === itemId && String(row[1]) === ownerId) return itemId.split('/').pop(); }
    for (const row of sheet1Rows) { if (String(row[8]) === ownerId && row[4] && (row[4] === itemId || String(row[4]).indexOf(itemId + '/') === 0)) return itemId.split('/').pop(); }
    return null;
}

function buildSharedWithMeFromRaw(raw, uid) {
    const results = [];
    for (const row of raw.sharesRows) {
        if (row[5] !== 'restricted' || row[2] !== 'folder') continue;
        let allowed = [];
        try { allowed = JSON.parse(row[6] || '[]'); } catch (e) { continue; }
        if (!allowed.some(u => u.uid === uid)) continue;
        const itemId = row[1], ownerId = String(row[3]);
        const itemName = resolveItemNameClient(raw.sheet1Rows, raw.folderRows, itemId, 'folder', ownerId);
        if (itemName === null) continue;
        results.push({ shareId: row[0], itemType: 'folder', itemName: itemName, ownerName: row[4] });
    }
    return results;
}

async function realtimePollTick() {
    if (!currentOwnerId || realtimePollBusy) return;
    realtimePollBusy = true;
    try {
        // FIX: kalau baru saja ada tulisan (rename/dsb) punya akun ini, gviz
        // masih kemungkinan besar basi -- lewati tick ini daripada menimpa
        // balik state yang sudah benar dengan snapshot lama.
        if (isInGvizCooldown(currentOwnerId)) { realtimePollBusy = false; return; }

        const raw = await fetchRawSheets();

        const data = buildStateArrayFromRaw(raw, currentOwnerId);
        const sig = JSON.stringify(data);
        if (sig !== lastDataSignature) {
            lastDataSignature = sig; stateArray = data;
            isOwnRealtimeRefresh = true;
            renderUI();
            // FIX REALTIME: kalau ada modal preview yang lagi terbuka pas
            // perubahan ini masuk (mis. nama/ukuran file yang sedang dilihat
            // diubah dari perangkat lain), judul & info di modalnya sendiri
            // dulu TIDAK pernah ikut ter-refresh (cuma daftar di belakangnya
            // yang berubah) -- sekarang disamakan lewat fungsi di bawah,
            // tanpa mengulang proses download/pratinjau isi berkasnya.
            refreshOpenPreviewMetaIfNeeded();
        }

        const shared = buildSharedWithMeFromRaw(raw, currentOwnerId);
        const sig2 = JSON.stringify(shared);
        if (sig2 !== lastSharedSignature) {
            lastSharedSignature = sig2; sharedWithMeItems = shared;
            if (currentTab === 'shared') renderSharedWithMeMain(document.getElementById('search-input') ? document.getElementById('search-input').value : '');
        }
    } catch (e) {
    } finally { realtimePollBusy = false; }
}
function startRealtimePolling() { stopRealtimePolling(); realtimePollTimer = setInterval(realtimePollTick, REALTIME_POLL_MS); }
function stopRealtimePolling() { if (realtimePollTimer) { clearInterval(realtimePollTimer); realtimePollTimer = null; } }

// Sinkronkan judul/info folder pada modal preview MILIK SENDIRI (bukan
// halaman share) kalau lagi terbuka saat data berubah dari perangkat lain --
// tanpa mengulang proses download/pratinjau isi berkasnya (sama seperti
// updateSharedFileMetaDisplay di halaman share, tapi versi untuk Drive sendiri).
function refreshOpenPreviewMetaIfNeeded() {
    const modal = document.getElementById('preview-modal');
    if (!modal || modal.style.display === 'none') return;
    if (currentPreviewIndex < 0 || !previewQueue[currentPreviewIndex]) return;
    const openedId = previewQueue[currentPreviewIndex].id;
    const source = currentTab === 'trash' ? (stateArray.trash || []) : (stateArray.active || []);
    const fresh = source.find(f => f.id === openedId);
    if (!fresh) {
        // Berkas yang sedang dibuka sudah tidak ada lagi di tab ini (mis.
        // dipindah ke Sampah / dipulihkan / dihapus permanen dari perangkat lain).
        closePreviewModal();
        showToast("Berkas yang sedang dibuka sudah tidak ada lagi di sini.", true);
        return;
    }
    previewQueue[currentPreviewIndex] = fresh;
    let displayName = fresh.name;
    const ext = (fresh.format || '').toLowerCase();
    if (ext && !displayName.toLowerCase().endsWith('.' + ext)) displayName += '.' + ext;
    const titleEl = document.getElementById('preview-filename');
    if (titleEl && titleEl.innerText !== displayName) { titleEl.innerText = displayName; titleEl.title = displayName; }
    let fText = fresh.folder && fresh.folder !== "#*null*#" ? `Folder: ${fresh.folder.split('/').pop()}` : 'Beranda';
    if (currentTab === 'trash') fText = 'Di Dalam Sampah';
    const folderInfoEl = document.getElementById('preview-folder-info');
    if (folderInfoEl) folderInfoEl.innerHTML = `<span class="material-symbols-rounded" style="font-size: 14px;">${currentTab === 'trash' ? 'delete' : 'folder'}</span> ${escapeHtml(fText)}`;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024, dm = 2, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(format) {
    const ext = (format || '').toLowerCase();
    if (ext === 'sys_folder') return 'folder';
    if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) return 'movie';
    if (['jpg', 'png', 'jpeg', 'webp', 'gif', 'svg', 'cr2', 'nef', 'arw', 'dng', 'raw', 'rw2', 'orf', 'pef', 'srw'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audiotrack';
    if (['pdf'].includes(ext)) return 'picture_as_pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'table_view';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'folder_zip';
    if (['html', 'css', 'js', 'json', 'xml', 'txt', 'py', 'md', 'php', 'sql', 'sh', 'bat', 'env', 'log', 'ini', 'conf', 'yaml', 'yml', 'c', 'cpp', 'h', 'hpp', 'java', 'rb', 'go', 'rs', 'ts', 'jsx', 'tsx', 'vue'].includes(ext)) return 'code';
    return 'draft';
}

function isInsideTrashedFolder(path, trashedFolderPaths) {
    if (!path) return false;
    if (trashedFolderPaths.has(path)) return true;
    let parts = path.split('/');
    let accum = '';
    for (let i=0; i<parts.length; i++) {
        accum = accum ? accum + '/' + parts[i] : parts[i];
        if (trashedFolderPaths.has(accum)) return true;
    }
    return false;
}

async function syncData() {
    try {
        // FIX: selama masa tenang pasca-tulis, langsung pakai jalur GAS (selalu
        // fresh) daripada gviz (bisa basi) supaya syncData() gak balik menimpa
        // hasil rename/aksi lain yang baru saja dilakukan.
        if (isInGvizCooldown(currentOwnerId)) throw new Error('gviz_cooldown_skip');
        const raw = await fetchRawSheets();
        const data = buildStateArrayFromRaw(raw, currentOwnerId);
        lastDataSignature = JSON.stringify(data);
        stateArray = data;
        renderUI();
    } catch (e) {
        const res = await callGasAPI('get_all_data', { ownerId: currentOwnerId });
        if (res && res.success) {
            stateArray = res.data || { active: [], trash: [], folders: [] };
            if (!stateArray.active) stateArray.active = []; if (!stateArray.trash) stateArray.trash = []; if (!stateArray.folders) stateArray.folders = [];
            lastDataSignature = JSON.stringify(stateArray);
            renderUI();
        } else {
            if (res && res.networkError) { showToast("Gagal menyinkronkan data: server sedang sibuk. Coba lagi nanti.", true); return; }
            showToast((res && res.message) || "Gagal menyinkronkan data.", true);
            if (res && res.message && res.message.includes("Sesi tidak valid")) setTimeout(logoutCurrent, 2000);
        }
    }
}

// ==========================================
// UI RENDERERS
// ==========================================
function switchTab(tab) {
    currentTab = tab; currentPath = ''; clearSelection();
    document.getElementById('search-input').value = '';
    ['home', 'files', 'folders', 'trash', 'shared'].forEach(t => {
        const sb = document.getElementById('nav-' + t); if (sb) sb.className = t === tab ? 'nav-item active' : 'nav-item';
        const bn = document.getElementById('bnav-' + t); if (bn) bn.className = t === tab ? 'bottom-nav-item active' : 'bottom-nav-item';
    });
    document.getElementById('app-sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
    renderUI();
}
function navigateToFolder(path) {
    currentTab = 'home'; currentPath = path; clearSelection();
    document.getElementById('search-input').value = '';
    ['home', 'files', 'folders', 'trash', 'shared'].forEach(t => {
        const sb = document.getElementById('nav-' + t); if (sb) sb.className = t === 'home' ? 'nav-item active' : 'nav-item';
        const bn = document.getElementById('bnav-' + t); if (bn) bn.className = t === 'home' ? 'bottom-nav-item active' : 'bottom-nav-item';
    });
    // FIX: beda dengan switchTab(), fungsi ini dulu TIDAK menutup drawer
    // sidebar mobile (hamburger menu) -- kalau navigasi ini dipicu saat
    // sidebar itu sedang terbuka (mis. dari alur redirectOwnerToDrive di HP),
    // overlay sidebar+backdrop bisa ketinggalan menutupi layar termasuk
    // bottom-nav, membuatnya terlihat "hilang"/nge-bug di HP.
    document.getElementById('app-sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
    renderUI();
}

function getAllFolderPaths() {
    const folders = new Set();
    if (stateArray.folders) {
        stateArray.folders.forEach(f => {
            if (f.path && f.owner === currentOwnerId) {
                folders.add(f.path);
                let parts = f.path.split('/'); let accum = '';
                for (let i = 0; i < parts.length - 1; i++) { accum = accum ? accum + '/' + parts[i] : parts[i]; folders.add(accum); }
            }
        });
    }
    return Array.from(folders).sort();
}

function getDirectSubFoldersAndFiles() {
    const allFolders = getAllFolderPaths(); const subFolders = new Set();
    allFolders.forEach(folder => {
        if (currentPath === '') { let firstSegment = folder.split('/')[0]; if (firstSegment) subFolders.add(firstSegment); }
        else {
            if (folder.startsWith(currentPath + '/')) {
                let relative = folder.substring(currentPath.length + 1);
                let nextSegment = relative.split('/')[0];
                if (nextSegment) subFolders.add(currentPath + '/' + nextSegment);
            }
        }
    });
    return Array.from(subFolders);
}

function getFolderStats(folderPath) {
    let count = 0, size = 0, subfCount = 0;
    if (stateArray.active) stateArray.active.forEach(f => { if (f.folder === folderPath || (f.folder && f.folder.startsWith(folderPath + '/'))) { count++; size += parseInt(f.size) || 0; } });
    getAllFolderPaths().forEach(f => { if (f.startsWith(folderPath + '/') && f !== folderPath) subfCount++; });
    return { files: count, subfolders: subfCount, size: size };
}

// ==========================================
// PATCH: RENDER BERTAHAP (LAZY BATCH RENDERING)
// Sebelumnya renderFiles/renderFoldersAndFiles bikin DOM card + fetch
// thumbnail untuk SEMUA item sekaligus dalam 1 kali render -- kalau
// datanya ratusan ribu, browser freeze. Sekarang render per-batch: batch
// pertama langsung tampil, sisanya baru dirender pelan-pelan begitu user
// scroll mendekati akhir list (folder maupun file, dua-duanya kepakai
// fungsi generik yang sama ini).
// ==========================================
const RENDER_BATCH_SIZE = 60;
function renderInBatches_(container, items, buildItemFn, emptyHTML, minInitialCount) {
    // Bersihkan observer render-bertahap sebelumnya (kalau container ini
    // dipakai ulang lagi) supaya observer gak numpuk tiap kali render ulang.
    if (container.__batchObserver) { container.__batchObserver.disconnect(); container.__batchObserver = null; }
    container.innerHTML = '';
    if (!items || items.length === 0) {
        if (emptyHTML) container.innerHTML = emptyHTML;
        return;
    }
    let renderedCount = 0;
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'grid-column:1/-1; height:1px;';
    // PATCH: kalau ada item tertentu yang WAJIB langsung ada di DOM (mis. mau
    // di-scroll+highlight setelah render), batch PERTAMA dilebarkan sampai
    // minimal mencakup index item itu -- sisanya tetap lanjut per-batch
    // seperti biasa begitu user scroll, jadi list ratusan ribu item tetap
    // gak dirender sekaligus semuanya.
    const firstBatchSize = Math.max(RENDER_BATCH_SIZE, minInitialCount || 0);

    function renderNextBatch(batchSize) {
        const end = Math.min(renderedCount + (batchSize || RENDER_BATCH_SIZE), items.length);
        const frag = document.createDocumentFragment();
        for (let i = renderedCount; i < end; i++) {
            const node = buildItemFn(items[i]);
            if (node) frag.appendChild(node);
        }
        renderedCount = end;
        if (sentinel.parentNode) container.insertBefore(frag, sentinel);
        else container.appendChild(frag);
        if (renderedCount >= items.length) {
            sentinel.remove();
            if (container.__batchObserver) { container.__batchObserver.disconnect(); container.__batchObserver = null; }
        }
    }

    renderNextBatch(firstBatchSize); // batch pertama langsung tampil, gak nunggu scroll
    if (renderedCount < items.length) {
        container.appendChild(sentinel);
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) renderNextBatch(RENDER_BATCH_SIZE);
        }, { root: null, rootMargin: '600px' }); // mulai render batch berikutnya sebelum user beneran nyampe bawah
        observer.observe(sentinel);
        container.__batchObserver = observer;
    }
}

function renderUI() {
    const titleEl = document.getElementById('view-title');
    const breadcrumbEl = document.getElementById('breadcrumb-nav');
    const searchInput = document.getElementById('search-input');
    const q = searchInput ? searchInput.value : '';

    // FIX: sama seperti di halaman shared -- dulu kartu folder/file replay
    // animasi masuk SETIAP KALI ada refresh realtime (bukan cuma sekali di
    // awal), jadi kelihatan "naik-turun" tiap ada perubahan data (mis. dari
    // perangkat lain). Flag ini HANYA diset true oleh tick polling tepat
    // sebelum memanggil renderUI() (lihat realtimePollTick), lalu langsung
    // direset di sini supaya panggilan LAIN ke renderUI() (aksi pengguna
    // sendiri: upload, buat folder, dsb.) tetap dapat animasi seperti biasa.
    const ownFolderList = document.getElementById('folder-list');
    const ownFileList = document.getElementById('file-list');
    if (isOwnRealtimeRefresh) { if (ownFolderList) ownFolderList.classList.add('no-entrance-anim'); if (ownFileList) ownFileList.classList.add('no-entrance-anim'); }
    else { if (ownFolderList) ownFolderList.classList.remove('no-entrance-anim'); if (ownFileList) ownFileList.classList.remove('no-entrance-anim'); }
    isOwnRealtimeRefresh = false;

    if (currentTab === 'trash') {
        titleEl.innerText = "Sampah"; breadcrumbEl.innerHTML = "";
        document.getElementById('folder-container-wrapper').style.display = 'none';
        document.getElementById('files-section-title').innerText = 'Berkas di Sampah';
        renderFiles(q, 'trash');
    } else if (currentTab === 'files') {
        titleEl.innerText = "Berkas"; breadcrumbEl.innerHTML = "";
        document.getElementById('folder-container-wrapper').style.display = 'none';
        document.getElementById('files-section-title').innerText = 'Semua Berkas';
        renderFiles(q, 'allFiles');
    } else if (currentTab === 'folders') {
        titleEl.innerText = "Folder"; breadcrumbEl.innerHTML = "";
        document.getElementById('files-section-title').innerText = '';
        renderFolderTabOnly(q);
    } else if (currentTab === 'shared') {
        titleEl.innerText = "Dibagikan"; breadcrumbEl.innerHTML = "";
        document.getElementById('files-section-title').innerText = '';
    } else {
        if (currentPath === '') { titleEl.innerText = "Beranda"; breadcrumbEl.innerHTML = ""; }
        else {
            let segments = currentPath.split('/');
            titleEl.innerText = segments[segments.length - 1];
            titleEl.title = segments[segments.length - 1];
            let crumbHTML = `<span onclick="navigateToFolder('')">Beranda</span>`; let builtPath = '';
            segments.forEach((seg, idx) => {
                builtPath = builtPath ? builtPath + '/' + seg : seg;
                if (idx === segments.length - 1) crumbHTML += ` / <span>${seg}</span>`;
                else crumbHTML += ` / <span onclick="navigateToFolder('${builtPath}')">${seg}</span>`;
            });
            breadcrumbEl.innerHTML = crumbHTML;
            // Scroll ke ujung kanan supaya folder yang lagi dibuka (paling
            // relevan) yang kelihatan, bukan "Beranda" di ujung kiri.
            requestAnimationFrame(() => { breadcrumbEl.scrollLeft = breadcrumbEl.scrollWidth; });
        }
        document.getElementById('files-section-title').innerText = 'Berkas';
        renderFoldersAndFiles(q);
    }
    if (currentTab === 'shared') renderSharedWithMeMain(q);
    updateSelectionToolbar();
    updateFabForPaste(); 
}

function renderFoldersAndFiles(filterText = '') {
    const folderList = document.getElementById('folder-list');
    let subFolders = getDirectSubFoldersAndFiles();

    if (filterText) subFolders = subFolders.filter(fp => fp.split('/').pop().toLowerCase().includes(filterText.toLowerCase()));

    if (subFolders.length === 0) { document.getElementById('folder-container-wrapper').style.display = 'none'; folderList.innerHTML = ''; }
    else {
        document.getElementById('folder-container-wrapper').style.display = 'block';
        document.getElementById('folder-section-label').innerText = 'Folder';
        renderInBatches_(folderList, subFolders, buildFolderCard_, null);
    }
    renderFiles(filterText, 'home');
}

function buildFolderCard_(fullFolderPath) {
    let displayName = fullFolderPath.split('/').pop();
    const stats = getFolderStats(fullFolderPath);
    let metaText = `${stats.files} file`; 
    if (stats.size > 0) metaText += ` • ${formatBytes(stats.size)}`;

    const folderObj = stateArray.folders.find(f => f.path === fullFolderPath);
    const isShared = folderObj && folderObj.shareInfo && folderObj.shareInfo.privacy !== 'private';
    const folderIcon = isShared ? 'folder_shared' : 'folder';
    
    let shareBadgeHTML = '';
    if (isShared) {
        if (folderObj.shareInfo.privacy === 'link') {
            shareBadgeHTML = `<div style="font-size:11px; color:var(--primary); font-weight:700; margin-top:4px; display:flex; align-items:center; gap:4px;"><span class="material-symbols-rounded" style="font-size:14px;">public</span> Publik</div>`;
        } else if (folderObj.shareInfo.privacy === 'restricted') {
            let count = 0;
            try { count = JSON.parse(folderObj.shareInfo.allowedUsers).length; } catch(e){}
            shareBadgeHTML = `<div style="font-size:11px; color:var(--primary); font-weight:700; margin-top:4px; display:flex; align-items:center; gap:4px;"><span class="material-symbols-rounded" style="font-size:14px;">group</span> Shared to ${count} orang</div>`;
        }
    }

    // FIX #5: nama folder juga input pengguna -> escape sebelum ditaruh di innerHTML.
    const card = document.createElement('div'); card.className = `folder-card ${selectedFolderPaths.has(fullFolderPath) ? 'selected' : ''} ${isSelectingMode ? 'selecting' : ''}`;
    const safeAttrPath = fullFolderPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    card.innerHTML = `
        <input type="checkbox" class="folder-checkbox" ${selectedFolderPaths.has(fullFolderPath) ? 'checked' : ''} onchange="toggleSelectFolder('${safeAttrPath}', this)">
        <div class="folder-icon-box"><span class="material-symbols-rounded">${folderIcon}</span></div>
        <div class="folder-info">
            <span class="folder-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
            <span class="folder-meta">${metaText}</span>
            ${shareBadgeHTML}
        </div>
        <button class="icon-btn" style="padding:4px; margin-right:-4px;" onclick="openFolderOptions(event, '${safeAttrPath}')"><span class="material-symbols-rounded" style="font-size:22px;">more_vert</span></button>
    `;
    attachLongPressHandlers(card, () => { suppressNextClick=true; isSelectingMode=true; const chk=card.querySelector('.folder-checkbox'); chk.checked=!selectedFolderPaths.has(fullFolderPath); toggleSelectFolder(fullFolderPath,chk); }, (e) => { if(e.target.closest('button')||e.target.closest('input')) return; if(isSelectingMode){const chk=card.querySelector('.folder-checkbox');chk.checked=!chk.checked;toggleSelectFolder(fullFolderPath,chk);} else navigateToFolder(fullFolderPath); });
    return card;
}


function renderFolderTabOnly(filterText = '') {
    document.getElementById('folder-container-wrapper').style.display = 'block';
    document.getElementById('folder-section-label').innerText = 'Semua Folder';
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('select-all-container').style.display = 'none';
    const folderList = document.getElementById('folder-list');
    let all = getAllFolderPaths();
    if (filterText) all = all.filter(fp => fp.toLowerCase().includes(filterText.toLowerCase()));
    renderInBatches_(folderList, all, (fullFolderPath) => {
        const stats = getFolderStats(fullFolderPath);
        let metaText = `${stats.files} file`; if (stats.size > 0) metaText += ` • ${formatBytes(stats.size)}`;
        const card = document.createElement('div'); card.className = 'folder-card';
        card.onclick = (e) => { if (!e.target.closest('button')) navigateToFolder(fullFolderPath); };
        // FIX #5: escape teks + escape atribut onclick (dulu tidak di-escape sama sekali di sini).
        const safeAttrPath = fullFolderPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        card.innerHTML = `
            <div class="folder-icon-box"><span class="material-symbols-rounded">folder</span></div>
            <div class="folder-info"><span class="folder-name" title="${escapeHtml(fullFolderPath)}">${escapeHtml(fullFolderPath)}</span><span class="folder-meta">${metaText}</span></div>
            <button class="icon-btn" style="padding:4px; margin-right:-4px;" onclick="openFolderOptions(event, '${safeAttrPath}')"><span class="material-symbols-rounded" style="font-size:22px;">more_vert</span></button>
        `;
        return card;
    }, `<div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--text-muted); font-size:14px;">Belum ada folder.</div>`);
}


function filterFiles() {
    renderUI();
}

function renderFiles(filterText = '', mode = 'home') {
    const list = document.getElementById('file-list');
    let data;
    
    if (mode === 'trash') {
        // Hanya tampilkan Folder Induk yang ada di sampah dan file individu.
        // Sembunyikan isi dari folder sampah agar tidak bisa dipulihkan satu per satu.
        const trashedFolderPaths = new Set((stateArray.trash || []).filter(f => f.format === 'sys_folder').map(f => f.id));
        data = (stateArray.trash || []).filter(f => {
            return !isInsideTrashedFolder(f.folder, trashedFolderPaths);
        });
    } else if (mode === 'allFiles') {
        data = stateArray.active || [];
    } else {
        data = (stateArray.active || []).filter(f => (f.folder && f.folder !== "#*null*#" ? f.folder : '') === currentPath);
    }

    data = Array.from(new Map(data.map(f => [String(f.id), f])).values());
    if (filterText) data = data.filter(f => f.name.toLowerCase().includes(filterText.toLowerCase()));

    const selectAllCbContainer = document.getElementById('select-all-container');
    const selectAllCb = document.getElementById('select-all-cb');
    if (mode !== 'folders' && data.length > 0) {
        selectAllCbContainer.style.display = selectedFileIds.size > 0 ? 'flex' : 'none';
        if (selectedFileIds.size > 0) selectAllCb.checked = data.every(f => selectedFileIds.has(f.id));
    } else { selectAllCbContainer.style.display = 'none'; }

    // Kalau ada file yang lagi "ditunggu" untuk di-scroll+highlight (lihat
    // goToFileAndHighlight), cari posisinya dulu supaya batch render pertama
    // dilebarkan sampai mencakup file itu -- jadi kartunya dijamin ada di DOM
    // begitu selesai render, gak perlu nunggu observer scroll-lazy dulu.
    let targetIdx = -1;
    if (pendingHighlightFileId) targetIdx = data.findIndex(f => String(f.id) === String(pendingHighlightFileId));

    renderInBatches_(list, data, buildFileCard_, `<div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; color: var(--text-muted); font-size:14px;">Belum ada berkas di sini.</div>`, targetIdx >= 0 ? targetIdx + 1 : 0);

    if (targetIdx >= 0) {
        const targetId = pendingHighlightFileId;
        pendingHighlightFileId = null;
        // Tunggu 2 frame supaya layout/paint kartu barunya selesai dulu sebelum discroll.
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToAndHighlightFile(targetId)));
    } else if (pendingHighlightFileId && !filterText) {
        // File targetnya gak ada di daftar mode ini (mis. lagi ada di Sampah) -- batalkan penantiannya.
        pendingHighlightFileId = null;
    }
}

// Scroll ke kartu file tertentu (yang sudah ada di DOM) lalu beri highlight
// tipis SEMENTARA saja beberapa detik, bukan permanen.
function scrollToAndHighlightFile(fileId) {
    const el = document.getElementById('filecard-' + fileId);
    if (!el) return;
    // FIX: jangan pakai scrollIntoView -- di HP ia ikut menggeser viewport/dokumen
    // sehingga header (navbar) terdorong keluar layar. Scroll HANYA kontainer <main>.
    const mainEl = document.querySelector('main');
    if (mainEl) {
        const mr = mainEl.getBoundingClientRect(), er = el.getBoundingClientRect();
        mainEl.scrollTo({ top: mainEl.scrollTop + (er.top - mr.top) - (mr.height - er.height) / 2, behavior: 'smooth' });
    }
    window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
    el.classList.add('file-card-highlight-flash');
    setTimeout(() => { el.classList.remove('file-card-highlight-flash'); }, 3700);
}

// Arahkan pengguna ke tab Berkas, lalu scroll+highlight sementara ke file
// tertentu -- dipakai saat pengguna sendiri membuka link share yang
// ternyata berkas miliknya sendiri (bukan langsung membuka preview).
function goToFileAndHighlight(fileId) {
    pendingHighlightFileId = fileId;
    switchTab('files');
}

function buildFileCard_(f) {
    const isSelected = selectedFileIds.has(f.id);
    const card = document.createElement('div');
    card.id = 'filecard-' + f.id;
    card.className = `file-card ${isSelected ? 'selected' : ''} ${isSelectingMode ? 'selecting' : ''}`;
    const ext = (f.format || '').toLowerCase();
    
    attachLongPressHandlers(card, () => {
        suppressNextClick = true; isSelectingMode = true; toggleSelectFile(f.id, { checked: !isSelected });
    }, (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        if (isSelectingMode) { let chk = card.querySelector('.file-checkbox'); chk.checked = !chk.checked; toggleSelectFile(f.id, chk); }
        else {
            if (ext === 'sys_folder') {
                showToast("Pulihkan folder ini dari sampah terlebih dahulu untuk membuka isinya.", false);
                return;
            }
            let displayFilename = f.name; 
            if (ext && !displayFilename.toLowerCase().endsWith('.' + ext)) displayFilename += '.' + ext;
            previewFile(f.id, f.format, displayFilename);
        }
    });

    let initialIcon = getFileIcon(f.format);
    let displayFilename = f.name; 
    if (ext && ext !== 'sys_folder' && !displayFilename.toLowerCase().endsWith('.' + ext)) displayFilename += '.' + ext;

    let publicBadgeHTML = '';
    if (f.shareInfo && f.shareInfo.privacy === 'link') {
        publicBadgeHTML = `<div style="font-size:11px; color:var(--primary); font-weight:700; margin-top:2px; display:flex; align-items:center; gap:3px;"><span class="material-symbols-rounded" style="font-size:13px;">public</span> Publik</div>`;
    }
    
    let subText = ext === 'sys_folder' ? 'Folder (Sampah)' : formatBytes(f.size);

    // FIX #5: nama file berasal dari input pengguna (bisa diisi siapa saja lewat
    // upload/rename/share), jadi WAJIB di-escape sebelum ditaruh di innerHTML,
    // supaya tidak bisa dipakai untuk XSS (mis. nama file "<img src=x onerror=...>").
    const safeFilename = escapeHtml(displayFilename);
    card.innerHTML = `
        <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelectFile('${f.id}', this)">
        <button class="icon-btn file-menu-btn" onclick="openFileMenu(event, '${f.id}')"><span class="material-symbols-rounded" style="font-size:20px;">more_vert</span></button>
        <div class="file-thumbnail" id="thumb-${f.id}"><span class="material-symbols-rounded" style="font-size:42px; ${ext === 'sys_folder' ? 'color: var(--primary);' : ''}">${initialIcon}</span></div>
        <div class="file-info-area">
            <span class="file-title-text" title="${safeFilename}">${safeFilename}</span>
            <span class="file-sub">${subText}</span>
            ${publicBadgeHTML}
        </div>
    `;
    // Thumbnail cuma di-fetch begitu card ini BENERAN dirender (batch-nya
    // kena giliran) -- bukan untuk semua file sekaligus di awal.
    if (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || ['mp3', 'wav', 'ogg'].includes(ext)) loadCardThumbnail(f, ext, `thumb-${f.id}`);
    return card;
}

function attachLongPressHandlers(el, onLongPress, onTap) {
    let pressTimer = null; let longPressFired = false; let startX = 0, startY = 0; let moved = false;

    const start = (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        longPressFired = false; moved = false;
        const point = e.touches ? e.touches[0] : e;
        startX = point.clientX; startY = point.clientY;
        pressTimer = setTimeout(() => { if (!moved) { longPressFired = true; onLongPress(e); } }, LONG_PRESS_MS);
    };
    const move = (e) => {
        if (!pressTimer) return;
        const point = e.touches ? e.touches[0] : e;
        const dx = Math.abs(point.clientX - startX), dy = Math.abs(point.clientY - startY);
        if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) { moved = true; clearTimeout(pressTimer); pressTimer = null; }
    };
    const end = () => { clearTimeout(pressTimer); pressTimer = null; };

    el.onmousedown = start; el.ontouchstart = start;
    el.onmousemove = move; el.ontouchmove = move;
    el.onmouseup = end; el.onmouseleave = end; el.ontouchend = end; el.ontouchcancel = end;
    el.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        if (suppressNextClick || longPressFired || moved) { suppressNextClick = false; longPressFired = false; moved = false; return; }
        onTap(e);
    };
}

function toggleSelectFile(fileId, checkbox) {
    if (checkbox.checked) selectedFileIds.add(fileId); else selectedFileIds.delete(fileId);
    if (selectedFileIds.size === 0) isSelectingMode = false;
    renderUI();
}
function toggleSelectAll(checkbox) {
    let dataList = currentTab === 'trash' ? stateArray.trash : stateArray.active;
    let currentViewData = dataList.filter(f => currentTab === 'home' ? (f.folder && f.folder !== "#*null*#" ? f.folder : '') === currentPath : true);
    if (checkbox.checked) { isSelectingMode = true; currentViewData.forEach(f => selectedFileIds.add(f.id)); }
    else { currentViewData.forEach(f => selectedFileIds.delete(f.id)); if (selectedFileIds.size === 0) isSelectingMode = false; }
    renderUI();
}
function clearSelection() { selectedFileIds.clear(); selectedFolderPaths.clear(); isSelectingMode = false; renderUI(); }
function toggleSelectFolder(path, checkbox) { if (checkbox.checked) { selectedFolderPaths.add(path); isSelectingMode=true; } else selectedFolderPaths.delete(path); if(selectedFileIds.size+selectedFolderPaths.size===0)isSelectingMode=false; renderUI(); }

function copySelectedItemsToClipboard() { 
    const items=[]; 
    selectedFileIds.forEach(id=>{const f=stateArray.active.find(x=>x.id===id);if(f)items.push({type:'file',id:f.id,label:f.name+(f.format?'.'+f.format:'')});}); 
    selectedFolderPaths.forEach(path=>items.push({type:'folder',path,label:path.split('/').pop()})); 
    if(!items.length)return; 
    clipboardItem={type:'multi',items,label:`${items.length} item`}; 
    clearSelection(); 
    updateFabForPaste();
    showToast(`${items.length} item disalin. Buka folder tujuan lalu tekan Tempel.`,false); 
}

function updateSelectionToolbar() {
    const toolbar = document.getElementById('selection-toolbar');
    const actionContainer = document.getElementById('selection-action-container');
    const selectedCount = selectedFileIds.size + selectedFolderPaths.size;
    if (selectedCount > 0) {
        toolbar.classList.add('show');
        document.getElementById('selection-count').innerText = `${selectedCount} dipilih`;
        if (currentTab !== 'trash') {
            actionContainer.innerHTML = `
                <button class="icon-btn" onclick="copySelectedItemsToClipboard()" title="Salin"><span class="material-symbols-rounded">content_copy</span></button>
                <button class="icon-btn" onclick="downloadOwnSelectedBulk()" title="Download"><span class="material-symbols-rounded">download</span></button>
                <button class="icon-btn" onclick="openMoveModal('bulk')" title="Pindahkan"><span class="material-symbols-rounded">drive_file_move</span></button>
                <button class="icon-btn" onclick="processDeleteBulk()" style="color: var(--danger);" title="Pindah ke Sampah"><span class="material-symbols-rounded">delete</span></button>
            `;
        } else {
            actionContainer.innerHTML = `
                <button class="icon-btn" onclick="processRestoreBulk()" style="color: var(--primary);" title="Pulihkan"><span class="material-symbols-rounded">restore</span></button>
                <button class="icon-btn" onclick="processPermanentDeleteBulk()" style="color: var(--danger);" title="Hapus Permanen"><span class="material-symbols-rounded">delete_forever</span></button>
            `;
        }
    } else { toolbar.classList.remove('show'); }
}

// ==========================================
// MOVE ACTIONS
// ==========================================
function openMoveModal(mode) {
    moveTargetMode = mode;
    closeFileOptions(); closeFolderOptions();
    const list = document.getElementById('move-folder-list');
    
    let currentLocation = '';
    
    // 1. Deteksi lokasi item saat ini secara presisi
    if (mode === 'file' && selectedFileForAction) {
        currentLocation = (selectedFileForAction.folder && selectedFileForAction.folder !== "#*null*#") ? selectedFileForAction.folder : '';
    } else if (mode === 'folder' && selectedFolderForAction) {
        const lastSlash = selectedFolderForAction.lastIndexOf('/');
        currentLocation = lastSlash !== -1 ? selectedFolderForAction.substring(0, lastSlash) : '';
    } else if (mode === 'bulk') {
        currentLocation = currentPath; // Mode pilih banyak item selalu berada di currentPath
    }

    let isHomeDisabled = (currentLocation === '');

    // 2. Render Pilihan "Beranda"
    if (isHomeDisabled) {
        list.innerHTML = `<div class="move-list-item" style="opacity: 0.4; cursor: not-allowed; pointer-events: none; background: var(--surface-subtle);"><span class="material-symbols-rounded">home</span> Beranda </div>`;
    } else {
        list.innerHTML = `<div class="move-list-item" onclick="executeMove('')"><span class="material-symbols-rounded">home</span> Beranda</div>`;
    }

    // 3. Render Pilihan Folder Lainnya
    getAllFolderPaths().forEach(f => {
        let isDisabled = false;

        // Sembunyikan folder itu sendiri beserta subfoldernya (untuk mencegah error loop pindah)
        if (mode === 'folder' && (f === selectedFolderForAction || f.startsWith(selectedFolderForAction + '/'))) return; 
        
        // Dalam mode bulk, sembunyikan folder yang sedang dipilih agar tidak dipindah ke dalam dirinya sendiri
        if (mode === 'bulk') {
            for (let selectedFolder of selectedFolderPaths) {
                if (f === selectedFolder || f.startsWith(selectedFolder + '/')) return;
            }
        }

        // Disable folder yang menjadi lokasi item saat ini
        if (f === currentLocation) isDisabled = true;

        let escapedPath = f.replace(/'/g, "\\'");
        
        if (isDisabled) {
            // pointer-events: none memastikan elemen tidak akan memicu klik sama sekali
            list.innerHTML += `<div class="move-list-item" style="opacity: 0.4; cursor: not-allowed; pointer-events: none; background: var(--surface-subtle);"><span class="material-symbols-rounded">folder</span> ${f} </div>`;
        } else {
            list.innerHTML += `<div class="move-list-item" onclick="executeMove('${escapedPath}')"><span class="material-symbols-rounded">folder</span> ${f}</div>`;
        }
    });
    
    document.getElementById('move-destination-modal').style.display = 'flex';
}



function closeMoveModal() { document.getElementById('move-destination-modal').style.display = 'none'; }

async function executeMove(targetFolder) {
    closeMoveModal(); showLoadingOverlay("Memindahkan...", false, false);
    try {
        if (moveTargetMode === 'folder') {
            const oldPath = selectedFolderForAction;
            const newPath = targetFolder ? `${targetFolder}/${oldPath.split('/').pop()}` : oldPath.split('/').pop();
            const res = await callGasAPI('move_folder_dir', { oldPath: oldPath, newPath: newPath, ownerId: currentOwnerId });
            if (res && res.success === false) { hideLoadingOverlay(); return showToast(res.message || "Gagal memindahkan folder.", true); }
            if (stateArray.folders) stateArray.folders.forEach(f => { if (f.path === oldPath) f.path = newPath; else if (f.path.startsWith(oldPath + '/')) f.path = f.path.replace(oldPath, newPath); });
            if (stateArray.active) stateArray.active.forEach(f => { if (f.folder === oldPath) f.folder = newPath; else if (f.folder && f.folder.startsWith(oldPath + '/')) f.folder = f.folder.replace(oldPath, newPath); });
            showToast("Folder berhasil dipindahkan!", false);
            
        } else if (moveTargetMode === 'file') {
            const res = await callGasAPI('move_folder', { fileId: selectedFileForAction.id, folder: targetFolder, ownerId: currentOwnerId });
            if (res && res.success === false) { hideLoadingOverlay(); return showToast(res.message || "Gagal memindahkan file.", true); }
            selectedFileForAction.folder = targetFolder;
            showToast("Berkas berhasil dipindahkan!", false);
            
        } else if (moveTargetMode === 'bulk') {
            // SEKARANG MENGAMBIL KEDUANYA (FILE & FOLDER)
            const fileIds = Array.from(selectedFileIds);
            const folderPaths = Array.from(selectedFolderPaths);
            
            let failCount = 0;
            let doneCount = 0;

            // 1. Eksekusi pemindahan untuk semua FILE terpilih
            if (fileIds.length > 0) {
                const fileResults = await Promise.all(fileIds.map(id => callGasAPI('move_folder', { fileId: id, folder: targetFolder, ownerId: currentOwnerId })));
                fileIds.forEach((id, i) => {
                    if (fileResults[i] && fileResults[i].success === false) { failCount++; } 
                    else {
                        doneCount++;
                        const file = stateArray.active.find(f => f.id === id);
                        if (file) file.folder = targetFolder;
                    }
                });
            }

            // 2. Eksekusi pemindahan untuk semua FOLDER terpilih
            if (folderPaths.length > 0) {
                const folderResults = await Promise.all(folderPaths.map(oldPath => {
                    const newPath = targetFolder ? `${targetFolder}/${oldPath.split('/').pop()}` : oldPath.split('/').pop();
                    return callGasAPI('move_folder_dir', { oldPath: oldPath, newPath: newPath, ownerId: currentOwnerId })
                        .then(res => ({ oldPath, newPath, res }));
                }));
                
                folderResults.forEach(({oldPath, newPath, res}) => {
                    if (res && res.success === false) { failCount++; } 
                    else {
                        doneCount++;
                        // Update cache UI lokal untuk folder beserta isinya
                        if (stateArray.folders) stateArray.folders.forEach(f => { if (f.path === oldPath) f.path = newPath; else if (f.path.startsWith(oldPath + '/')) f.path = f.path.replace(oldPath, newPath); });
                        if (stateArray.active) stateArray.active.forEach(f => { if (f.folder === oldPath) f.folder = newPath; else if (f.folder && f.folder.startsWith(oldPath + '/')) f.folder = f.folder.replace(oldPath, newPath); });
                    }
                });
            }

            clearSelection();
            if (failCount > 0) showToast(`${doneCount} item dipindahkan, ${failCount} gagal.`, true);
            else showToast("Semua item berhasil dipindahkan!", false);
        }
    } catch (e) { showToast("Terjadi kendala saat memindahkan.", true); }
    
    hideLoadingOverlay(); 
    await syncData(); // Paksa sync untuk menormalkan struktur tree folder dari server
    renderUI();
}


// ==========================================
// COPY - PASTE (file & folder)
// File yang sama tidak diupload ulang: backend cukup membuat baris metadata baru
// dengan ID unik baru yang tetap menunjuk ke chunksJSON (biner Telegram) yang sama.
// ==========================================
function updateFabForPaste() {
    const fab = document.querySelector('.fab-btn');
    if (!fab) return;
    
    // LOGIKA BARU: Hilangkan tombol jika bukan di tab beranda/folder (home)
    if (currentTab !== 'home') {
        fab.style.display = 'none';
        return;
    } else {
        fab.style.display = 'flex'; 
    }

    if (clipboardItem) {
        fab.style.width = 'auto';
        fab.style.borderRadius = '28px';
        fab.style.padding = '0 16px';
        fab.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="material-symbols-rounded" onclick="event.stopPropagation(); clearClipboard()" style="font-size:20px; cursor:pointer; padding:6px; margin-left:-8px; border-radius:50%; transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='transparent'">close</span>
                <div style="width:1.5px; height:24px; background:rgba(255,255,255,0.4);"></div>
                <span class="material-symbols-rounded" style="font-size: 24px; margin-left:4px;">content_paste</span>
                <span style="font-size:14.5px; font-weight:700; margin-right:4px;">Tempel</span>
            </div>
        `;
        fab.onclick = pasteClipboardHere;
    } else {
        fab.style.width = '56px';
        fab.style.borderRadius = '50%';
        fab.style.padding = '0';
        fab.innerHTML = `<span class="material-symbols-rounded" style="font-size: 26px;">add</span>`;
        fab.onclick = openActionMenuModal;
    }
}


function clearClipboard() {
    clipboardItem = null;
    updateFabForPaste();
    showToast("Batal menyalin.", false);
}

function copyFileToClipboard() {
    closeFileOptions();
    if (!selectedFileForAction) return;
    let displayName = selectedFileForAction.name + (selectedFileForAction.format ? '.' + selectedFileForAction.format : '');
    clipboardItem = { type: 'file', id: selectedFileForAction.id, label: displayName };
    updateFabForPaste();
    showToast(`"${displayName}" disalin. Buka folder tujuan lalu tekan Tempel.`, false);
}

function copyFolderToClipboard() {
    closeFolderOptions();
    if (!selectedFolderForAction) return;
    const folderName = selectedFolderForAction.split('/').pop();
    clipboardItem = { type: 'folder', path: selectedFolderForAction, label: folderName };
    updateFabForPaste();
    showToast(`Folder "${folderName}" disalin. Buka folder tujuan lalu tekan Tempel.`, false);
}

async function pasteClipboardHere() {
    if (!clipboardItem) return;
    const targetFolder = (currentTab === 'home') ? currentPath : '';
    const items = clipboardItem.type === 'multi' ? clipboardItem.items : [clipboardItem];
    showLoadingOverlay(`Menyalin ${items.length} item...`, true, false);
    let done=0, failed=0;
    try {
        for (const item of items) {
            let res;
            if (item.type==='file') res=await callGasAPI('copy_file',{fileId:item.id,targetFolder,ownerId:currentOwnerId});
            else {
                if (targetFolder===item.path || targetFolder.startsWith(item.path+'/')) { failed++; continue; }
                res=await callGasAPI('copy_folder',{folderPath:item.path,targetParent:targetFolder,ownerId:currentOwnerId});
            }
            if(res&&res.success){
                if(item.type==='file'&&res.newFile) stateArray.active.push(res.newFile);
                if(item.type==='folder'){ if(!stateArray.folders)stateArray.folders=[];if(!stateArray.active)stateArray.active=[];(res.newFolders||[]).forEach(f=>stateArray.folders.push(f));(res.newFiles||[]).forEach(f=>stateArray.active.push(f)); }
                done++;
            } else failed++;
            updateLoadingOverlay(Math.round((done+failed)/items.length*100),`Menyalin (${done+failed}/${items.length})...`);
        }
    } finally {
        clipboardItem = null; 
        updateFabForPaste();
        hideLoadingOverlay(); renderUI();
        showToast(failed?`${done} item berhasil ditempel, ${failed} gagal.`:`${done} item berhasil ditempel.`,failed>0);
        await syncData();
    }
}

// FOLDER ACTIONS
function openFolderOptions(e, path) {
    e.stopPropagation(); 
    selectedFolderForAction = path;
    document.getElementById('opt-folder-title').innerText = path.split('/').pop();
    document.getElementById('opt-folder-title').title = path.split('/').pop();
    
    const container = document.getElementById('folder-opt-container');
    container.innerHTML = `
        <div class="action-menu-item" onclick="openShareModal('folder')"><span class="material-symbols-rounded">share</span> Bagikan Folder</div>
        <div class="action-menu-item" onclick="openRenameFolderModal()"><span class="material-symbols-rounded">edit</span> Ganti Nama Folder</div>
        <div class="action-menu-item" onclick="downloadFolderAsZipOwner()"><span class="material-symbols-rounded">folder_zip</span> Download sebagai ZIP</div>
        <div class="action-menu-item" onclick="openMoveModal('folder')"><span class="material-symbols-rounded">drive_file_move</span> Pindahkan Folder</div>
        <div class="action-menu-item" onclick="copyFolderToClipboard()"><span class="material-symbols-rounded">content_copy</span> Salin Items</div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">
        <div class="action-menu-item danger" onclick="confirmDeleteFolder()"><span class="material-symbols-rounded">delete</span> Hapus Folder</div>
    `;
    
    document.getElementById('folder-options-modal').style.display = 'flex';
}

function closeFolderOptions() { document.getElementById('folder-options-modal').style.display = 'none'; }

async function createFolder() {
    const input = document.getElementById('new-folder-name');
    const folderName = input.value.trim();
    if (!folderName) return showToast("Nama folder tidak boleh kosong.", true);
    // FIX #5/#7: validasi panjang di client (sinkron dengan batas di server) supaya
    // langsung dapat feedback jelas, bukan silently gagal/terpotong di spreadsheet.
    if (folderName.length > 300) return showToast("Nama folder terlalu panjang (maksimal 300 karakter).", true);
    if (/[<>]/.test(folderName)) return showToast("Nama folder tidak boleh mengandung karakter < atau >.", true);
    const fullPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    closeCreateFolderModal(); showLoadingOverlay("Membuat folder...", false, false);
    const res = await callGasAPI('create_folder', { folderPath: fullPath, ownerId: currentOwnerId });
    hideLoadingOverlay();
    if (res && res.success !== false) {
        if (!stateArray.folders) stateArray.folders = [];
        stateArray.folders.push({ path: fullPath, owner: currentOwnerId });
        input.value = ''; renderUI(); showToast("Folder dibuat!", false);
    } else { showToast((res && res.message) || "Gagal membuat folder.", true); }
}

function confirmDeleteFolder() {
    showConfirm("Pindahkan folder ini beserta seluruh isinya ke tempat sampah?", "Hapus Folder", async () => {
        const pathToDelete = selectedFolderForAction; 
        closeFolderOptions();
        
        showLoadingOverlay("Memindahkan folder ke sampah...", false, false);
        try {
            const res = await callGasAPI('trash_folder', { folderPath: pathToDelete, ownerId: currentOwnerId });
            if (res && res.success !== false) { 
                await syncData();
                showToast("Folder berhasil dipindahkan ke sampah.", false);
            } else { 
                showToast((res && res.message) || "Gagal menghapus folder.", true); 
            }
        } catch (error) {
            showToast("Gagal menghapus folder.", true);
        } finally {
            hideLoadingOverlay();
        }
    });
}
// FILE ACTIONS
function openFileMenu(e, fileId) {
    e.stopPropagation();
    let dataList = currentTab === 'trash' ? stateArray.trash : stateArray.active;
    selectedFileForAction = dataList.find(f => f.id === fileId);
    if (!selectedFileForAction) return;

    let displayFilename = selectedFileForAction.name;
    const ext = (selectedFileForAction.format || '').toLowerCase();
    if (ext && !displayFilename.toLowerCase().endsWith('.' + ext)) displayFilename += '.' + ext;

    document.getElementById('opt-file-title').innerText = displayFilename;
    document.getElementById('opt-file-title').title = displayFilename;
    const container = document.getElementById('file-opt-container');
    let html = '';
    
    if (currentTab !== 'trash') {
        html += `
            <div class="action-menu-item" onclick="openShareModal('file')"><span class="material-symbols-rounded">share</span> Bagikan</div>
            <div class="action-menu-item" onclick="openRenameModal()"><span class="material-symbols-rounded">edit</span> Ganti Nama</div>
            <div class="action-menu-item" onclick="openFileInfoModal()"><span class="material-symbols-rounded">info</span> Detail Berkas</div>
            <div class="action-menu-item" onclick="downloadSelectedFile()"><span class="material-symbols-rounded">download</span> Download Berkas</div>
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">
            <div class="action-menu-item" onclick="openMoveModal('file')"><span class="material-symbols-rounded">drive_file_move</span> Pindahkan</div>
            <div class="action-menu-item" onclick="copyFileToClipboard()"><span class="material-symbols-rounded">content_copy</span> Salin Items</div>
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">
            <div class="action-menu-item danger" onclick="confirmDeleteIndividualFile()"><span class="material-symbols-rounded">delete</span> Buang ke Sampah</div>
        `;
    } else {
        html += `
            <div class="action-menu-item" onclick="openFileInfoModal()"><span class="material-symbols-rounded">info</span> Detail Berkas</div>
            <div class="action-menu-item" onclick="processRestoreIndividualFile()" style="color:var(--primary);"><span class="material-symbols-rounded" style="color:var(--primary);">restore</span> Pulihkan Berkas</div>
            <div class="action-menu-item danger" onclick="confirmPermanentDelete()"><span class="material-symbols-rounded">delete_forever</span> Hapus Permanen</div>
        `;
    }
    container.innerHTML = html;
    document.getElementById('file-options-modal').style.display = 'flex';
}

function closeFileOptions() { document.getElementById('file-options-modal').style.display = 'none'; }

function openFileInfoModal() {
    closeFileOptions();
    if (!selectedFileForAction) return;
    let displayFilename = selectedFileForAction.name;
    const ext = (selectedFileForAction.format || '').toLowerCase();
    if (ext && !displayFilename.toLowerCase().endsWith('.' + ext)) displayFilename += '.' + ext;

    document.getElementById('info-name').innerText = displayFilename;
    document.getElementById('info-name').title = displayFilename;
    document.getElementById('info-format').innerText = ext || 'Tidak diketahui';
    document.getElementById('info-size').innerText = formatBytes(selectedFileForAction.size);
    document.getElementById('info-location').innerText = selectedFileForAction.folder ? selectedFileForAction.folder : 'Beranda';
    document.getElementById('info-id').innerText = selectedFileForAction.id;

    const exifContainer = document.getElementById('info-exif-container');
    exifContainer.innerHTML = '';
    if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'cr2', 'nef', 'arw', 'dng', 'raw', 'rw2', 'orf', 'pef', 'srw'].includes(ext)) {
        const cachedUrl = fileUrlCache['full_' + selectedFileForAction.id];
        if (cachedUrl) parseAndShowExif(cachedUrl, exifContainer); else loadExifForCurrentFile();
    }
    document.getElementById('file-info-modal').style.display = 'flex';
}
function closeFileInfoModal() { document.getElementById('file-info-modal').style.display = 'none'; }

async function loadExifForCurrentFile() {
    const exifContainer = document.getElementById('info-exif-container');
    exifContainer.innerHTML = `<div style="font-size:12.5px; color:var(--primary); margin-top:12px; display:flex; align-items:center; gap:6px;"><span class="spinner" style="width:14px; height:14px; border-width:2px; border-top-color:var(--primary);"></span> Memuat metadata foto...</div>`;
    try {
        const res = await callGasAPI('get_chunks', { fileId: selectedFileForAction.id, ownerId: currentOwnerId });
        if (!res || !res.success || !res.data) throw new Error("Metadata chunk tidak ditemukan");
        let chunks = res.data;
        if (typeof chunks === 'string') chunks = JSON.parse(chunks);
        if (!Array.isArray(chunks) || chunks.length === 0) throw new Error("Data chunk kosong");
        chunks.sort((a, b) => a.part - b.part);
        const pathBlob = await fetchBinaryWithFallback(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${chunks[0].telegramFileId}`);
        const pathText = await pathBlob.text();
        const pathData = JSON.parse(pathText);
        if (!pathData.ok || !pathData.result) throw new Error("Gagal resolusi path file Telegram");
        const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${pathData.result.file_path}`;
        const imageBlob = await fetchBinaryWithFallback(fileUrl);
        await parseAndShowExif(imageBlob, exifContainer);
    } catch (e) { exifContainer.innerHTML = `<div style="font-size:12px; color:var(--text-muted); margin-top:12px;">Tidak ada metadata ekstra atau gagal memuat.</div>`; }
}

// ==========================================
// PATCH: EXIFR LOADER YANG TAHAN BANTING
// Sebelumnya kalau window.exifr belum ada (misal file vendor/exifr.full.umd.js
// belum sempat kedownload/telat load), fitur metadata & cover RAW langsung
// nyerah. Sekarang: tunggu dulu beberapa detik (siapa tau cuma telat load),
// dan kalau tetap gagal, coba ambil dari CDN publik sebagai cadangan.
// ==========================================
let _exifrLoadPromise = null;
function ensureExifrLoaded(timeoutMs = 6000) {
    if (window.exifr) return Promise.resolve(true);
    if (_exifrLoadPromise) return _exifrLoadPromise;
    _exifrLoadPromise = new Promise((resolve) => {
        const start = Date.now();
        const poll = setInterval(() => {
            if (window.exifr) { clearInterval(poll); resolve(true); return; }
            if (Date.now() - start > timeoutMs) {
                clearInterval(poll);
                // Fallback: file lokal (vendor/) kemungkinan hilang/belum di-download,
                // coba ambil dari CDN publik supaya fitur tetap jalan.
                const existing = document.querySelector('script[data-exifr-fallback]');
                if (existing) { resolve(!!window.exifr); return; }
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js';
                s.setAttribute('data-exifr-fallback', '1');
                s.onload = () => resolve(!!window.exifr);
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            }
        }, 200);
    });
    return _exifrLoadPromise;
}

// ==========================================
// PATCH: EKSTRAKSI THUMBNAIL/PREVIEW RAW YANG BENAR-BENAR ANDAL
// Sebelumnya cuma dipanggil `exifr.thumbnail(blob)` polos. Masalahnya,
// exifr punya optimisasi "chunked reading": dia MENEBAK berapa byte yang
// perlu dibaca dari file, bukan langsung baca seluruh file. Untuk file
// RAW kamera (CR2/NEF/ARW/dll), preview JPEG yang ter-embed sering
// terletak jauh dari awal file — offset-nya melebihi tebakan chunk
// default exifr — jadi hasilnya diam-diam KOSONG (bukan error), padahal
// filenya sendiri sebenarnya punya preview.
//
// Perbaikan di sini:
//  1) Paksa `chunked:false` supaya exifr baca SELURUH file (aman untuk
//     file lokal/blob, beda dengan baca dari URL remote yang mahal).
//  2) Kalau exifr.thumbnail() tetap kosong, fallback manual: parse IFD0
//     + IFD1 untuk dapat ThumbnailOffset/ThumbnailLength, lalu potong
//     langsung dari ArrayBuffer file itu sendiri.
//  3) Timeout dinaikkan jadi 15 detik HANYA sebagai jaring pengaman
//     untuk file yang benar-benar besar/rusak, bukan mekanisme utama.
// ==========================================
async function extractRawEmbeddedPreview(blobOrFile, timeoutMs = 15000) {
    if (!(await ensureExifrLoaded())) return null;

    const withTimeout = (promise) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ekstraksi preview RAW')), timeoutMs))
    ]);

    // PATCH: sebelumnya cuma ambil thumbnail kecil dari IFD1 (biasanya
    // cuma ~160x120px, memang didesain buat file browser cepat, BUKAN
    // buat ditampilkan besar). Padahal kebanyakan file RAW kamera juga
    // menyimpan preview kedua yang jauh lebih besar (mid/full-res) di
    // lokasi IFD lain. Sekarang kita kumpulkan SEMUA kandidat gambar
    // yang ketemu, lalu pakai yang PALING BESAR ukuran byte-nya YANG
    // TERBUKTI BISA DIDEKODE (lihat validasi di bawah).
    const candidates = [];
    let buf = null;
    try { buf = await blobOrFile.arrayBuffer(); } catch (e) { return null; }

    const addCandidate = (data) => { if (data && data.byteLength > 0) candidates.push(data); };

    // Kandidat 1: cara resmi exifr (biasanya berhasil dapat thumbnail IFD1)
    try {
        const thumb = await withTimeout(exifr.thumbnail(buf, { chunked: false }));
        addCandidate(thumb);
    } catch (e) { /* lanjut */ }

    // Kandidat 2 & 3: baca manual tag offset/length di IFD0 DAN IFD1.
    // IFD0 kerap menyimpan preview yang lebih besar (mid/full-res),
    // sedangkan IFD1 biasanya cuma thumbnail kecil. Dua-duanya dicoba,
    // nanti yang paling besar yang dipakai.
    try {
        const output = await withTimeout(exifr.parse(buf, {
            tiff: true, ifd0: true, ifd1: true, mergeOutput: false,
            translateKeys: true, reviveValues: false, chunked: false
        }));
        [output && output.ifd0, output && output.ifd1].forEach(ifd => {
            if (!ifd) return;
            // Pasangan tag lama gaya EXIF (dipakai untuk thumbnail IFD1
            // maupun preview yang ditaruh langsung di IFD0 oleh sebagian kamera)
            const pairs = [
                [ifd.ThumbnailOffset, ifd.ThumbnailLength],
                [ifd.JpegIFOffset, ifd.JpegIFByteCount],
                // Beberapa RAW menaruh preview JPEG-nya sebagai "strip"
                // biasa (Compression = 6 artinya JPEG) alih-alih tag thumbnail.
                [ifd.Compression === 6 ? ifd.StripOffsets : undefined,
                 ifd.Compression === 6 ? ifd.StripByteCounts : undefined],
            ];
            pairs.forEach(([offset, length]) => {
                offset = Array.isArray(offset) ? offset[0] : offset;
                length = Array.isArray(length) ? length.reduce((a,b)=>a+b,0) : length;
                if (typeof offset === 'number' && typeof length === 'number' && length > 0 && offset + length <= buf.byteLength) {
                    addCandidate(buf.slice(offset, offset + length));
                }
            });
        });
    } catch (e) { /* memang tidak ada tag preview tambahan di file ini */ }

    // PATCH: kandidat cadangan TERAKHIR -- pindai LANGSUNG seluruh isi
    // byte file cari penanda awal/akhir JPEG (SOI 0xFFD8 ... EOI 0xFFD9).
    // Ini jaring pengaman untuk kasus yang sebelumnya bikin thumbnail
    // "gagal tergenerate": HEIC (bukan struktur TIFF, jadi tag IFD0/IFD1
    // di atas tidak ketemu apa-apa) dan varian RAW yang preview-nya
    // disimpan produsen kamera di lokasi non-standar (bukan di tag resmi
    // ThumbnailOffset/JpegIFOffset). Hampir semua format ini tetap
    // menyimpan minimal 1 JPEG mentah di dalam filenya (dipakai kamera
    // untuk preview di layar LCD), jadi pemindaian ini nyaris selalu
    // berhasil menemukan sesuatu walau tag metadata-nya tidak baku.
    //
    // Sengaja disiapkan (bukan langsung dijalankan) di sini -- baru
    // benar-benar dipakai di bawah, HANYA kalau kandidat dari tag metadata
    // ternyata tidak ada satupun yang valid saat divalidasi.
    const runByteScanFallback = () => { try { return scanForEmbeddedJpegs(buf); } catch (e) { return []; } };

    // PATCH: dulu kandidat terbesar langsung dipakai tanpa dicek dulu --
    // kalau ternyata potongan byte-nya korup/kepotong (mis. salah tebak
    // offset), thumbnail "tergenerate" tapi gambarnya rusak pas
    // ditampilkan. Sekarang setiap kandidat divalidasi dulu (coba
    // benar-benar didekode browser), mulai dari yang paling besar; yang
    // pertama TERBUKTI valid itu yang dipakai. Kalau SEMUA kandidat dari
    // tag metadata ternyata korup/tidak valid, baru jalankan pemindaian
    // byte mentah di atas sebagai upaya terakhir.
    const validateAndPick = async (list) => {
        list.sort((a, b) => b.byteLength - a.byteLength);
        for (const c of list) {
            try {
                const testBlob = new Blob([c], { type: 'image/jpeg' });
                const bitmap = await Promise.race([
                    createImageBitmap(testBlob),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('decode timeout')), 4000))
                ]);
                if (bitmap) { bitmap.close?.(); return c; }
            } catch (e) { /* kandidat ini korup/tidak bisa didekode, coba kandidat berikutnya */ }
        }
        return null;
    };

    let result = candidates.length > 0 ? await validateAndPick(candidates) : null;
    if (!result) {
        const scanned = runByteScanFallback();
        if (scanned.length > 0) result = await validateAndPick(scanned);
    }
    return result; // null kalau benar-benar tidak ada preview JPEG valid sama sekali di file ini
}

// Pindai buffer mentah cari semua segmen JPEG utuh (SOI...EOI). Dipakai
// sebagai jaring pengaman terakhir di extractRawEmbeddedPreview() di atas.
function scanForEmbeddedJpegs(buf) {
    const bytes = new Uint8Array(buf);
    const results = [];
    const MIN_SIZE = 4000; // buang potongan kecil yang cuma noise/ikon
    let i = 0;
    while (i < bytes.length - 1) {
        if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8) {
            let j = i + 2;
            let end = -1;
            while (j < bytes.length - 1) {
                if (bytes[j] === 0xFF && bytes[j + 1] === 0xD9) { end = j + 2; break; }
                j++;
            }
            if (end !== -1) {
                if (end - i >= MIN_SIZE) results.push(bytes.slice(i, end).buffer);
                i = end; // lompat ke akhir segmen ini, lanjut cari segmen berikutnya
                continue;
            } else {
                break; // SOI tanpa EOI (kepotong) -- berhenti, sisanya bukan JPEG utuh
            }
        }
        i++;
    }
    // Kalau ketemu banyak, batasi jumlah kandidat yang divalidasi (largest-first
    // di pemanggil) supaya tidak buang waktu decode berkali-kali.
    return results.slice(0, 4);
}


async function parseAndShowExif(urlOrBlob, container) {
    const exifrReady = await ensureExifrLoaded();
    if (!exifrReady || !window.exifr) { container.innerHTML = `<div style="margin-top:12px; font-size:12px; color:var(--text-muted);">Library EXIFR gagal dimuat (cek koneksi internet), coba buka lagi.</div>`; return; }
    try {
        // chunked:false: paksa baca seluruh file. Untuk RAW (CR2/NEF/dll) tag-tag
        // EXIF kadang berada di luar jangkauan tebakan chunk default exifr,
        // yang sebelumnya bisa bikin metadata tampak "tidak ada" padahal ada.
        const output = await exifr.parse(urlOrBlob, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, chunked: false });
        if (output && (output.Make || output.Model || output.ISO || output.ExposureTime || output.FNumber || output.FocalLength || (output.latitude && output.longitude))) {
            let html = `<div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border-color); font-size:13.5px;"><strong style="color:var(--text-primary); display:block; margin-bottom:10px;">Metadata Fotografi:</strong>`;
            if (output.Make || output.Model) {
                const brand = output.Make || ''; const model = output.Model || '';
                const fullName = model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`.trim();
                html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--primary);">photo_camera</span><span>Kamera: <b>${fullName}</b></span></div>`;
            }
            if (output.ISO) html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--primary);">iso</span><span>ISO: <b>${output.ISO}</b></span></div>`;
            if (output.ExposureTime) { const shutter = output.ExposureTime < 1 ? `1/${Math.round(1 / output.ExposureTime)}s` : `${output.ExposureTime}s`; html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--primary);">shutter_speed</span><span>Shutter: <b>${shutter}</b></span></div>`; }
            if (output.FNumber) html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--primary);">camera</span><span>Aperture: <b>f/${output.FNumber}</b></span></div>`;
            if (output.FocalLength) html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--primary);">straighten</span><span>Focal Length: <b>${output.FocalLength}mm</b></span></div>`;
            if (output.latitude && output.longitude) { const mapsUrl = `https://www.google.com/maps?q=${output.latitude},${output.longitude}`; html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--primary);">location_on</span><span>Lokasi: <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:700;">Buka di Maps</a></span></div>`; }
            html += `</div>`;
            container.innerHTML = html;
        } else { container.innerHTML = `<div style="margin-top:12px; font-size:12px; color:var(--text-muted);">Tidak ada metadata kamera pada file ini.</div>`; }
    } catch (e) { container.innerHTML = `<div style="margin-top:12px; font-size:12px; color:var(--text-muted);">Tidak ada metadata ekstra.</div>`; }
}

function openRenameModal() {
    closeFileOptions();
    document.getElementById('rename-input').value = selectedFileForAction.name;
    document.getElementById('rename-ext-label').innerText = selectedFileForAction.format ? `.${selectedFileForAction.format}` : '';
    document.getElementById('rename-modal').style.display = 'flex';
}
function closeRenameModal() { document.getElementById('rename-modal').style.display = 'none'; }
function executeRenameFile() {
    let newName = document.getElementById('rename-input').value.trim();
    // FIX #5/#7: validasi panjang & karakter berbahaya sebelum dikirim.
    if (newName.length > 300) { showToast("Nama file terlalu panjang (maksimal 300 karakter).", true); return; }
    if (/[<>]/.test(newName)) { showToast("Nama file tidak boleh mengandung karakter < atau >.", true); return; }
    if (newName && newName !== selectedFileForAction.name) {
        selectedFileForAction.name = newName;
        callGasAPI('rename_file', { fileId: selectedFileForAction.id, newName: newName, ownerId: currentOwnerId });
        renderUI();
    }
    closeRenameModal();
}

async function downloadSelectedFile() {
    const fileRef = selectedFileForAction;
    let downloadName = fileRef.name;
    const ext = (fileRef.format || '').toLowerCase();
    if (ext && !downloadName.toLowerCase().endsWith('.' + ext)) downloadName += '.' + ext;
    closeFileOptions();

    if (fileUrlCache['full_' + fileRef.id]) {
        const a = document.createElement('a'); a.href = fileUrlCache['full_' + fileRef.id]; a.download = downloadName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        return;
    }

    globalAbortController = new AbortController();
    showLoadingOverlay("Menyiapkan unduhan...", true, true);
    try {
        const res = await callGasAPI('get_chunks', { fileId: fileRef.id, ownerId: currentOwnerId });
        if (!res.success) throw new Error("Gagal memuat metadata berkas.");
        let chunks = res.data;
        if (typeof chunks === 'string') { try { chunks = JSON.parse(chunks); } catch (e) {} }
        if (!Array.isArray(chunks) || chunks.length === 0) throw new Error("Data tidak ditemukan.");
        chunks.sort((a, b) => a.part - b.part);

        const parts = await reconstructFileParts(chunks, (overall) => { updateLoadingOverlay(overall, `Mengunduh... ${overall}%`); }, globalAbortController.signal);
        const blob = new Blob(parts, { type: mimeFromExt(ext) });
        const blobUrl = URL.createObjectURL(blob);
        fileUrlCache['full_' + fileRef.id] = blobUrl;

        hideLoadingOverlay();
        const a = document.createElement('a'); a.href = blobUrl; a.download = downloadName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => { URL.revokeObjectURL(blobUrl); delete fileUrlCache['full_' + fileRef.id]; }, 10000);
    } catch (e) { hideLoadingOverlay(); if (e.message !== "Dibatalkan oleh pengguna") showToast("Gagal mengunduh: " + (e.message || 'kesalahan'), true); }
}

// Nama file ZIP untuk unduhan gabungan: <timestamp>-gwadeving.zip
function buildTimestampedZipName() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `${stamp}-gwadeving.zip`;
}

// PATCH: dulu fungsi ini SAMA SEKALI mengabaikan folder yang ikut dipilih
// (cuma memproses selectedFileIds) dan setiap file diunduh satu-satu secara
// terpisah walau yang dipilih banyak. Sekarang: kalau yang dipilih cuma 1
// (berupa file ATAU folder) tetap diunduh langsung seperti biasa (file
// langsung, folder jadi ZIP bernama folder itu sendiri). Begitu yang dipilih
// LEBIH DARI 1 -- baik banyak file, banyak folder, atau campuran -- semuanya
// digabung jadi SATU file ZIP, dengan isi tiap folder mengikuti struktur
// path aslinya (diletakkan di dalam sub-folder bernama folder itu sendiri).
async function downloadOwnSelectedBulk() {
    const fileIds = Array.from(selectedFileIds);
    const folderPaths = Array.from(selectedFolderPaths);
    const total = fileIds.length + folderPaths.length;
    if (total === 0) return;

    // Hanya 1 file saja yang dipilih -> unduh langsung (tanpa ZIP), seperti sebelumnya.
    if (total === 1 && fileIds.length === 1) {
        selectedFileForAction = stateArray.active.find(f => f.id === fileIds[0]);
        if (selectedFileForAction) await downloadSelectedFile();
        return;
    }
    // Hanya 1 folder saja yang dipilih -> unduh sebagai ZIP bernama folder itu sendiri.
    if (total === 1 && folderPaths.length === 1) {
        selectedFolderForAction = folderPaths[0];
        await downloadFolderAsZipOwner();
        return;
    }

    // Lebih dari 1 item terpilih (file dan/atau folder) -> gabung jadi 1 ZIP.
    if (!window.JSZip) { showToast("Gagal memuat pustaka ZIP. Periksa koneksi internet Anda.", true); return; }
    sharedDownloadCancelled = false;
    globalAbortController = new AbortController();

    // Kumpulkan dulu SEMUA file yang perlu diunduh + path relatifnya di dalam
    // ZIP. File tunggal yang dipilih langsung diletakkan di root ZIP (pakai
    // namanya sendiri), sedangkan isi tiap folder yang dipilih diletakkan
    // mengikuti struktur path ASLI-nya, di dalam sub-folder bernama folder
    // itu sendiri (persis strukturnya di Drive, bukan diratakan/di-flatten).
    const zipEntries = [];
    for (const id of fileIds) {
        const f = stateArray.active.find(x => x.id === id);
        if (!f) continue;
        const ext = f.format ? '.' + f.format : '';
        zipEntries.push({ id: f.id, relPath: f.name + ext });
    }
    for (const path of folderPaths) {
        const folderName = path.split('/').pop();
        stateArray.active.forEach(f => {
            if (f.folder === path || (f.folder && f.folder.startsWith(path + '/'))) {
                const sub = f.folder === path ? '' : f.folder.substring(path.length + 1) + '/';
                const ext = f.format ? '.' + f.format : '';
                zipEntries.push({ id: f.id, relPath: folderName + '/' + sub + f.name + ext });
            }
        });
    }

    if (zipEntries.length === 0) { showToast("Tidak ada berkas untuk diunduh (folder yang dipilih kosong).", true); return; }

    showLoadingOverlay(`Menyiapkan ZIP (0/${zipEntries.length})...`, true, true);
    const zip = new JSZip();
    let n = 0, failed = 0;
    try {
        for (const entry of zipEntries) {
            if (sharedDownloadCancelled || globalAbortController.signal.aborted) throw new Error("Dibatalkan oleh pengguna");
            n++;
            updateLoadingOverlay(Math.round(n / zipEntries.length * 90), `Mengunduh (${n}/${zipEntries.length})...`);
            const chunkRes = await callGasAPI('get_chunks', { fileId: entry.id, ownerId: currentOwnerId });
            if (!chunkRes.success) { failed++; continue; }
            let chunks = chunkRes.data; if (typeof chunks === 'string') { try { chunks = JSON.parse(chunks); } catch (e) {} }
            chunks.sort((a, b) => a.part - b.part);
            const parts = await reconstructFileParts(chunks, null, globalAbortController.signal);
            zip.file(entry.relPath, new Blob(parts));
        }
        updateLoadingOverlay(95, "Membungkus ZIP...");
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const url = URL.createObjectURL(zipBlob);
        hideLoadingOverlay();
        const a = document.createElement('a'); a.href = url; a.download = buildTimestampedZipName();
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 20000);
        if (failed > 0) showToast(`ZIP dibuat, tapi ${failed} berkas gagal diunduh.`, true);
        else showToast("ZIP berhasil diunduh.", false);
    } catch (e) {
        hideLoadingOverlay();
        if (e.message !== "Dibatalkan oleh pengguna") showToast("Gagal membuat ZIP: " + (e.message || 'kesalahan'), true);
        else showToast("Unduhan dibatalkan.", true);
    }
}

function confirmDeleteIndividualFile() {
    showConfirm("Pindahkan berkas ini ke tempat sampah?", "Hapus Berkas", async () => {
        const fileId = selectedFileForAction.id;
        const idx = stateArray.active.findIndex(f => f.id === fileId);
        closeFileOptions();
        
        if (idx !== -1) {
            showLoadingOverlay("Menghapus berkas...", false, false);
            
            try {
                const fileToMove = stateArray.active.splice(idx, 1)[0];
                fileToMove.expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                stateArray.trash.push(fileToMove);
                
                // Tunggu request API selesai
                await callGasAPI('delete_file', { fileId: fileId, ownerId: currentOwnerId });
                
                renderUI();
            } catch (error) {
                showToast("Gagal menghapus berkas.", true);
            } finally {
                hideLoadingOverlay();
            }
        }
    });
}
async function processRestoreIndividualFile() {
    const fileId = selectedFileForAction.id;
    const format = selectedFileForAction.format;
    closeFileOptions();
    
    showLoadingOverlay("Memulihkan...", false, false);
    try {
        if (format === 'sys_folder') {
            await callGasAPI('restore_folder', { folderPath: fileId, ownerId: currentOwnerId });
        } else {
            await callGasAPI('restore_file', { fileId: fileId, ownerId: currentOwnerId });
        }
        await syncData();
        showToast("Item berhasil dipulihkan.", false);
    } catch(e) { showToast("Gagal memulihkan.", true); }
    finally { hideLoadingOverlay(); }
}
async function confirmPermanentDelete() {
    showConfirm("Hapus item ini secara permanen? Data tidak dapat dikembalikan.", "Hapus Permanen", async () => {
        const fileId = selectedFileForAction.id;
        const format = selectedFileForAction.format;
        closeFileOptions();
        
        showLoadingOverlay("Menghapus permanen...", false, false);
        try {
            if (format === 'sys_folder') {
                await callGasAPI('delete_permanent_folder', { folderPath: fileId, ownerId: currentOwnerId });
            } else {
                await callGasAPI('delete_permanent', { fileId: fileId, ownerId: currentOwnerId });
            }
            await syncData();
            showToast("Item dihapus secara permanen.", false);
        } catch(e) { showToast("Gagal menghapus permanen.", true); }
        finally { hideLoadingOverlay(); }
    });
}
function processDeleteBulk() {
    const fileCount = selectedFileIds.size;
    const folderCount = selectedFolderPaths.size;
    const total = fileCount + folderCount;

    if (total === 0) return;

    showConfirm(`Pindahkan ${total} item ke tempat sampah? (Folder beserta isinya akan ikut terhapus)`, "Hapus Item", async () => {
        const ids = Array.from(selectedFileIds);
        const folderPaths = Array.from(selectedFolderPaths);
        showLoadingOverlay("Memindahkan ke sampah...", false, false);

        try {
            let apiPromises = [];
            
            ids.forEach(id => {
                apiPromises.push(callGasAPI('delete_file', { fileId: id, ownerId: currentOwnerId })); 
            });

            for (const path of folderPaths) {
                apiPromises.push(callGasAPI('trash_folder', { folderPath: path, ownerId: currentOwnerId }));
            }

            if (apiPromises.length > 0) { await Promise.all(apiPromises); }
            clearSelection();
            await syncData(); // Sinkronisasi otomatis pasca hapus besar-besaran
            showToast(`${total} item berhasil dipindahkan ke sampah.`, false);
        } catch (error) {
            showToast("Terjadi kesalahan saat menghapus data.", true);
        } finally {
            hideLoadingOverlay();
        }
    });
}

function processRestoreBulk() {
    showConfirm(`Pulihkan ${selectedFileIds.size} item terpilih?`, "Pulihkan Item", async () => {
        const ids = Array.from(selectedFileIds);
        showLoadingOverlay("Memulihkan...", false, false);
        try {
            let promises = [];
            ids.forEach(id => {
                const item = stateArray.trash.find(f => f.id === id);
                if (item) {
                    if (item.format === 'sys_folder') {
                        promises.push(callGasAPI('restore_folder', { folderPath: id, ownerId: currentOwnerId }));
                    } else {
                        promises.push(callGasAPI('restore_file', { fileId: id, ownerId: currentOwnerId }));
                    }
                }
            });
            await Promise.all(promises);
            clearSelection();
            await syncData();
            showToast("Semua item berhasil dipulihkan.", false);
        } catch(e) { showToast("Terjadi kendala saat memulihkan.", true); }
        finally { hideLoadingOverlay(); }
    });
}
function processPermanentDeleteBulk() {
    showConfirm(`Hapus permanen ${selectedFileIds.size} berkas? Tindakan ini tidak dapat dibatalkan.`, "Hapus Permanen", () => {
        const ids = Array.from(selectedFileIds);
        ids.forEach(id => { const idx = stateArray.trash.findIndex(f => f.id === id); if (idx !== -1) { stateArray.trash.splice(idx, 1); callGasAPI('delete_permanent', { fileId: id, ownerId: currentOwnerId }); } });
        clearSelection();
    });
}

async function loadCardThumbnail(file, ext, containerId) {
    if (fileUrlCache['thumb_' + file.id]) {
        // PATCH: card yang manggil fungsi ini BELUM tentu sudah nempel di
        // DOM saat baris ini jalan (proses build card & insert ke DOM
        // dilakukan terpisah). Kalau cache sudah ada, sebelumnya kode ini
        // langsung cari elemennya SAAT ITU JUGA (masih sinkron) — jadi
        // sering gagal nemu container-nya dan diam-diam nyerah, makanya
        // thumbnail muncul pas pertama kali (network fetch kasih jeda
        // waktu cukup buat DOM ke-insert dulu) tapi hilang begitu masuk
        // folder lain lalu balik lagi (langsung kena jalur cache yang
        // dieksekusi sebelum card sempat ke-insert). Kasih jeda 1 tick
        // dulu supaya proses insert-ke-DOM yang lagi berjalan selesai.
        await Promise.resolve();
        return applyThumbToContainer(fileUrlCache['thumb_' + file.id], ext, containerId);
    }
    try {
        let fetchId = file.thumbId || null;
        if (!fetchId && !['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            const res = await callGasAPI('get_chunks', { fileId: file.id, ownerId: currentOwnerId }).catch(() => null);
            if (res && res.success && res.data.length > 0) fetchId = res.data[0].telegramFileId;
        }
        if (!fetchId) return;
        const pathBlob = await fetchBinaryWithFallback(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fetchId}`);
        const pathText = await pathBlob.text();
        const pathData = JSON.parse(pathText);
        if (!pathData.result) return;
        const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${pathData.result.file_path}`;
        fileUrlCache['thumb_' + file.id] = url;
        applyThumbToContainer(url, ext, containerId);
    } catch (e) {}
}
function applyThumbToContainer(url, ext, containerId) {
    const container = document.getElementById(containerId); if (!container) return;
    // PATCH: sebelumnya <img> di sini tidak punya handler onerror sama
    // sekali -- kalau thumbnail-nya ternyata gagal dimuat/rusak (mis. cache
    // URL sudah kedaluwarsa, atau konten thumb-nya bukan gambar valid),
    // browser cuma nampilin ikon "gambar pecah" dan diam untuk selamanya.
    // Sekarang: begitu <img> gagal load, hapus entri cache URL-nya (biar
    // percobaan berikutnya fetch ulang, bukan kepakai cache yang rusak
    // terus-terusan) dan kembalikan tampilan ke ikon file biasa.
    const iconFallback = VIDEO_EXTENSIONS.has(ext) ? 'movie' : 'image';
    const onErrorAttr = `onerror="handleThumbLoadError(this, '${containerId}', '${iconFallback}')"`;
    if (VIDEO_EXTENSIONS.has(ext)) { 
        container.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" loading="lazy" ${onErrorAttr}><div class="video-play-overlay"><div class="play-badge"><span class="material-symbols-rounded">play_arrow</span></div></div>`; 
    }
    else if (IMAGE_EXTENSIONS.has(ext)) { 
        container.innerHTML = `<img src="${url}" alt="Thumb" loading="lazy" ${onErrorAttr}>`; 
    }
}
function handleThumbLoadError(imgEl, containerId, iconName) {
    // Buang cache URL thumbnail yang ternyata gagal dimuat supaya tidak
    // terus dipakai ulang di kartu/preview lain.
    for (const key in fileUrlCache) { if (fileUrlCache[key] === imgEl.src) delete fileUrlCache[key]; }
    const container = document.getElementById(containerId); if (!container) return;
    container.innerHTML = `<span class="material-symbols-rounded" style="font-size:42px;">${iconName}</span>`;
}

// ==========================================
// UPLOAD MULTI-FILE SYSTEM
// ==========================================
function openUploadModal() {
    isUploadCancelled = false; uploadQueue = []; uploadDispatchList = []; renderUploadQueue();
    // Jaga-jaga: pastikan dropzone & tombol Upload Semua selalu tampil lagi
    // tiap kali modal ini dibuka -- kalau sesi sebelumnya sempat ditutup
    // paksa (tombol X) di tengah upload, keduanya bisa ketinggalan
    // tersembunyi kalau tidak direset eksplisit di sini.
    const btn = document.getElementById('btn-upload'); if (btn) { btn.style.display = ''; btn.disabled = false; }
    const dropzone = document.getElementById('upload-dropzone'); if (dropzone) dropzone.style.display = '';
    document.getElementById('upload-modal').style.display = 'flex';
}
function closeUploadModal() {
    isUploadCancelled = true;
    // Batalkan SEMUA upload yang sedang berjalan bersamaan (bukan cuma 1 xhr seperti dulu).
    activeUploadXhrs.forEach(x => { try { x.abort(); } catch (e) {} });
    activeUploadXhrs.clear();
    if (currentActiveXhr) { currentActiveXhr.abort(); currentActiveXhr = null; }
    document.getElementById('upload-modal').style.display = 'none';
    uploadQueue.forEach(it => { if (it.previewUrl) URL.revokeObjectURL(it.previewUrl); });
    uploadQueue = [];
    uploadDispatchList = [];
    sharedUploadActive = false;
}

// FIX: tombol "+" di halaman share sekarang jadi menu kecil (bukan langsung
// buka upload) supaya viewer/editor dengan akses Edit juga bisa membuat
// folder baru di sini, bukan cuma upload file.
function openSharedFabMenu() {
    if (sharedUploadFabRole !== 'edit') { showToast("Anda tidak memiliki akses Edit di folder ini.", true); return; }
    document.getElementById('shared-fab-menu-modal').style.display = 'flex';
}
function closeSharedFabMenu() { document.getElementById('shared-fab-menu-modal').style.display = 'none'; }

// Dipanggil dari tombol "+" di halaman share (viewer dengan akses Edit).
// Modal upload yang sama dipakai ulang, tapi startMultiUpload() akan mengarahkan
// penyimpanan metadata ke action 'shared_save_metadata' & folder tujuan = folder
// yang sedang dibuka di halaman share, dengan file tetap tercatat milik pemilik share.
function openSharedUploadModal() {
    if (sharedUploadFabRole !== 'edit') { showToast("Anda tidak memiliki akses Edit di folder ini.", true); return; }
    sharedUploadActive = true;
    openUploadModal();
}

// FIX: dulu pakai prompt() bawaan browser (tampilannya kasar/tidak konsisten
// dengan UI app) -- sekarang pakai modal yang sama persis gayanya dengan
// modal "Buat Folder" di drive sendiri.
function openSharedCreateFolderModal() {
    if (sharedUploadFabRole !== 'edit') { showToast("Anda tidak memiliki akses Edit di folder ini.", true); return; }
    document.getElementById('shared-new-folder-name').value = '';
    document.getElementById('shared-folder-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('shared-new-folder-name').focus(), 50);
}
function closeSharedCreateFolderModal() { document.getElementById('shared-folder-modal').style.display = 'none'; }

async function executeSharedCreateFolder() {
    const input = document.getElementById('shared-new-folder-name');
    const trimmed = (input.value || '').trim();
    if (!trimmed) return showToast("Nama folder tidak boleh kosong.", true);
    if (trimmed.length > 300) return showToast("Nama terlalu panjang (maksimal 300 karakter).", true);
    if (/[<>\/]/.test(trimmed)) return showToast("Nama tidak boleh mengandung karakter < > /.", true);
    const newPath = sharedCurrentPath ? (sharedCurrentPath + '/' + trimmed) : trimmed;
    closeSharedCreateFolderModal();
    showLoadingOverlay("Membuat folder...", false, false);
    const res = await callGasAPI('shared_create_folder', { folderPath: newPath, shareId: pendingShareCode, viewerUid: sharedViewerUid });
    hideLoadingOverlay();
    if (res && res.success) {
        if (!sharedContentsCache.subfolders.includes(newPath)) sharedContentsCache.subfolders.push(newPath);
        showToast("Folder berhasil dibuat.", false);
        if (!sharedIsSelecting) renderSharedFolderBody({ item: { name: sharedCurrentFolderName, contents: sharedContentsCache }, ownerId: pendingShareResolved && pendingShareResolved.ownerId, ownerName: pendingShareResolved && pendingShareResolved.ownerName, role: sharedUploadFabRole }, pendingShareCode, sharedViewerUid, sharedCurrentPath);
    } else {
        showToast((res && res.message) || "Gagal membuat folder.", true);
    }
}

function handleMultiFileSelect(input) {
    if (!input.files || input.files.length === 0) return;
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const rawName = file.name || "Berkas";
        const lastDot = rawName.lastIndexOf('.');
        const ext = lastDot !== -1 ? rawName.substring(lastDot + 1) : '';
        const pureName = lastDot !== -1 ? rawName.substring(0, lastDot) : rawName;
        const item = {
            qid: ++uploadQueueSeq, file: file, customName: pureName, ext: ext,
            // selected  = baru dipilih, belum ditekan tombol Upload (masih bisa dihapus/rename)
            // queued    = sudah ditekan Upload, masih menunggu giliran slot worker kosong
            // uploading -> done | error | cancelled
            status: 'selected',
            progressPercent: 0, loadedBytes: 0, statusText: '',
            previewUrl: null, thumbBlob: null,
            cancelRequested: false, activeXhr: null, thumbAbortController: null
        };
        uploadQueue.push(item);
        prepareQueueItemPreview(item);
    }
    renderUploadQueue();
    setTimeout(() => { input.value = ""; }, 500);
}

// PRATINJAU VISUAL KARTU ANTRIAN (gaya Google Drive): dibuat LANGSUNG dari
// file lokal begitu dipilih, sebelum upload apa pun dimulai. Untuk video,
// hasil capture frame ini disimpan di item.thumbBlob dan dipakai ULANG nanti
// sebagai thumbnail server saat upload beneran jalan -- tidak digenerate 2x.
function prepareQueueItemPreview(item) {
    const format = (item.ext || '').toLowerCase();
    if (IMAGE_EXTENSIONS.has(format)) {
        // Preview instan dari file asli. Untuk RAW/HEIC yang browser tidak
        // bisa decode native, <img> di kartunya akan gagal load -- fallback
        // ke ikon ditangani lewat onerror di markup renderUploadQueue().
        item.previewUrl = URL.createObjectURL(item.file);
        renderUploadQueue();
    } else if (VIDEO_EXTENSIONS.has(format) || item.file.type.startsWith('video/')) {
        generateVideoThumbnail(item.file).then(blob => {
            if (!blob || !uploadQueue.includes(item)) return; // batal kalau item sudah dihapus dari antrian
            item.thumbBlob = blob;
            item.previewUrl = URL.createObjectURL(blob);
            renderUploadQueue();
        });
    }
}

function updateQueueName(index, newName) { if (uploadQueue[index]) uploadQueue[index].customName = newName; }
function removeFromQueue(index) {
    const item = uploadQueue[index];
    if (!item || item.status !== 'selected') return; // sudah ditekan Upload -- tidak boleh dihapus lagi
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    uploadQueue.splice(index, 1);
    renderUploadQueue();
}

// Batalkan 1 file tertentu (baik yang masih "menunggu giliran" maupun yang
// sedang aktif diupload) TANPA menghentikan file lain yang berjalan bersamaan.
function cancelQueueItem(index) {
    const item = uploadQueue[index];
    if (!item || (item.status !== 'queued' && item.status !== 'uploading')) return;
    item.cancelRequested = true;
    if (item.activeXhr) { try { item.activeXhr.abort(); } catch (e) {} }
    if (item.thumbAbortController) { try { item.thumbAbortController.abort(); } catch (e) {} }
    item.status = 'cancelled';
    item.statusText = 'Dibatalkan';
    renderUploadQueue();
    updateAggregateUploadUI();
}

// Ulangi upload untuk 1 file yang gagal/dibatalkan -- jalan independen, tidak
// perlu menekan tombol Upload utama lagi ataupun mengganggu file lain.
function retryQueueItem(index) {
    const item = uploadQueue[index];
    if (!item || (item.status !== 'error' && item.status !== 'cancelled')) return;
    item.cancelRequested = false;
    item.activeXhr = null; item.thumbAbortController = null;
    item.progressPercent = 0; item.loadedBytes = 0; item.statusText = '';
    item.status = 'uploading';
    renderUploadQueue();
    runSingleItemUpload(item);
}

async function runSingleItemUpload(item) {
    let ok = false;
    try { ok = await processQueueItem(item, 1, 1); }
    catch (e) { ok = false; item.statusText = (e && e.message) || 'Gagal.'; }
    if (item.status !== 'cancelled') item.status = ok ? 'done' : 'error';
    renderUploadQueue();
    updateAggregateUploadUI();
    if (ok) scheduleRemoveQueueItem(item.qid);
}

// FIX UI: file yang sudah selesai diupload otomatis hilang dari daftar 1 detik
// kemudian, dengan animasi fade+collapse yang smooth (lihat .uq-card-removing
// di style.css), bukan langsung dihapus tiba-tiba.
function scheduleRemoveQueueItem(qid) {
    setTimeout(() => {
        const stillThere = uploadQueue.some(it => it.qid === qid);
        if (!stillThere) return;
        const cardEl = document.getElementById(`upload-queue-card-${qid}`);
        const finalize = () => {
            const idx = uploadQueue.findIndex(it => it.qid === qid);
            if (idx !== -1) {
                if (uploadQueue[idx].previewUrl) URL.revokeObjectURL(uploadQueue[idx].previewUrl);
                uploadQueue.splice(idx, 1);
            }
            renderUploadQueue();
        };
        if (cardEl) {
            cardEl.classList.add('uq-card-removing');
            setTimeout(finalize, 320);
        } else {
            finalize();
        }
    }, 1000);
}

// Update murah (tanpa re-render seluruh list) yang dipanggil berkali-kali per
// detik selama chunk sedang jalan -- kalau pakai renderUploadQueue() penuh di
// sini, <img> thumbnail akan reflow/flicker terus dan berat di HP low-end.
function updateQueueItemProgress(qid, percent, statusText) {
    const bar = document.getElementById(`uq-bar-${qid}`);
    const txt = document.getElementById(`uq-text-${qid}`);
    if (bar) bar.style.width = percent + '%';
    if (txt && statusText !== undefined) txt.innerText = statusText;
}

// Ringkasan keseluruhan (dulu cuma nunjukkin 1 file yang lagi jalan; sekarang
// dihitung dari SEMUA file di antrian -- gabungan byte yang sudah terkirim
// dibagi total byte semua file, supaya tetap akurat walau beberapa file
// jalan bersamaan).
function updateAggregateUploadUI() {
    const progressBar = document.getElementById('upload-progress-bar');
    const percentEl = document.getElementById('upload-percentage');
    const fileNameText = document.getElementById('upload-filename');
    if (!progressBar && !percentEl && !fileNameText) return;
    // Pakai snapshot dispatch list kalau sedang ada upload batch jalan, supaya
    // total tidak berubah-ubah gara-gara file "Selesai" otomatis menghilang
    // dari uploadQueue (lihat scheduleRemoveQueueItem).
    const refList = uploadDispatchList.length > 0 ? uploadDispatchList : uploadQueue;
    let totalBytes = 0, loadedBytes = 0, doneCount = 0, errorCount = 0, uploadingCount = 0;
    refList.forEach(it => {
        const size = it.file ? it.file.size : 0;
        totalBytes += size;
        if (it.status === 'done') { loadedBytes += size; doneCount++; }
        else if (it.status === 'error' || it.status === 'cancelled') { errorCount++; }
        else if (it.status === 'uploading') { uploadingCount++; loadedBytes += (it.loadedBytes || 0); }
    });
    const percent = totalBytes > 0 ? Math.min(100, (loadedBytes / totalBytes) * 100).toFixed(1) : 0;
    if (progressBar) progressBar.style.width = percent + '%';
    if (percentEl) percentEl.innerText = percent + '%';
    if (fileNameText) fileNameText.innerText = `${doneCount}/${refList.length} selesai${errorCount ? ', ' + errorCount + ' gagal/dibatalkan' : ''}`;
}

function renderUploadQueue() {
    const container = document.getElementById('upload-queue-list');
    if (uploadQueue.length === 0) { container.innerHTML = ``; return; }
    let htmlContent = '';
    uploadQueue.forEach((qItem, index) => {
        const iconName = getFileIcon(qItem.ext);
        const thumbInner = qItem.previewUrl
            ? `<img src="${qItem.previewUrl}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'material-symbols-rounded',textContent:'${iconName}'}));">`
            : `<span class="material-symbols-rounded">${iconName}</span>`;

        let statusHTML;
        if (qItem.status === 'selected') {
            // Belum ditekan Upload -- jangan tampilkan status "antrean" apa pun,
            // cukup thumbnail + nama + format + ukuran (lihat card di bawah).
            statusHTML = '';
        } else if (qItem.status === 'done') {
            statusHTML = `<div class="uq-status uq-status-done"><span class="material-symbols-rounded" style="font-size:15px;">check_circle</span> Selesai</div>`;
        } else if (qItem.status === 'error') {
            statusHTML = `<div class="uq-status uq-status-error"><span class="material-symbols-rounded" style="font-size:15px;">error</span> ${escapeHtml(qItem.statusText || 'Gagal')}</div>`;
        } else if (qItem.status === 'cancelled') {
            statusHTML = `<div class="uq-status uq-status-cancelled"><span class="material-symbols-rounded" style="font-size:15px;">cancel</span> Dibatalkan</div>`;
        } else if (qItem.status === 'uploading') {
            statusHTML = `
                <div class="progress-track" style="height:5px; margin-top:6px;"><div class="progress-fill is-uploading" id="uq-bar-${qItem.qid}" style="width:${qItem.progressPercent || 0}%;"></div></div>
                <div class="uq-status" id="uq-text-${qItem.qid}" style="margin-top:3px;">${escapeHtml(qItem.statusText || 'Mengunggah...')}</div>`;
        } else { // 'queued' -- sudah ditekan Upload, masih menunggu slot worker kosong
            statusHTML = `<div class="uq-status uq-status-queued"><span class="material-symbols-rounded" style="font-size:15px;">schedule</span> Menunggu giliran</div>`;
        }

        const canEditName = qItem.status === 'selected';
        const nameField = canEditName
            ? `<div class="inline-input-group" style="margin-bottom:0;">
                   <input type="text" value="${escapeHtml(qItem.customName)}" oninput="updateQueueName(${index}, this.value)" placeholder="Nama berkas...">
                   <span class="ext-label">${escapeHtml(qItem.ext ? '.' + qItem.ext : '')}</span>
               </div>`
            : `<div class="uq-name">${escapeHtml(qItem.customName + (qItem.ext ? '.' + qItem.ext : ''))}</div>`;

        // FIX UI: satu status "selesai" saja (baris teks + ikon di bawah nama),
        // jadi TIDAK ada lagi ikon centang duplikat di sisi kanan kartu.
        let actionHTML;
        if (qItem.status === 'selected') {
            actionHTML = `<button class="icon-btn" style="color:var(--danger); padding:8px; background:var(--danger-light); border-radius:var(--radius-sm); flex-shrink:0;" onclick="removeFromQueue(${index})" title="Hapus"><span class="material-symbols-rounded" style="font-size:18px;">delete</span></button>`;
        } else if (qItem.status === 'queued' || qItem.status === 'uploading') {
            actionHTML = `<button class="icon-btn" style="color:var(--text-muted); padding:8px; border-radius:var(--radius-sm); flex-shrink:0;" onclick="cancelQueueItem(${index})" title="Batalkan"><span class="material-symbols-rounded" style="font-size:18px;">close</span></button>`;
        } else if (qItem.status === 'error' || qItem.status === 'cancelled') {
            actionHTML = `<button class="icon-btn" style="color:var(--primary); padding:8px; background:var(--primary-light,rgba(52,211,153,0.12)); border-radius:var(--radius-sm); flex-shrink:0;" onclick="retryQueueItem(${index})" title="Ulangi"><span class="material-symbols-rounded" style="font-size:18px;">refresh</span></button>`;
        } else { // 'done'
            actionHTML = '';
        }

        const cardClass = 'upload-queue-card' + (qItem.status === 'cancelled' ? ' uq-cancelled' : '');
        htmlContent += `
            <div class="${cardClass}" id="upload-queue-card-${qItem.qid}">
                <div class="upload-queue-thumb">${thumbInner}</div>
                <div class="upload-queue-info">
                    ${nameField}
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${formatBytes(qItem.file ? qItem.file.size : 0)}</div>
                    ${statusHTML}
                </div>
                ${actionHTML}
            </div>`;
    });
    container.innerHTML = htmlContent;
}

// Dipakai sebagai patokan kecepatan fallback lintas-chunk: begitu 1 chunk berhasil
// mengirim event progress asli, kecepatan itu dipakai untuk menaksir chunk berikutnya
// jika event asli ternyata tidak muncul lagi (umum terjadi di sebagian WebView HP).
let lastKnownUploadSpeedBps = 0;

function uploadChunkXHR(formData, startBytes, totalFileSize, onProgress, forceWorker, item) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeUploadXhrs.add(xhr);
        if (item) item.activeXhr = xhr; // dipakai tombol Batalkan per-file untuk abort xhr ini
        
        // PATCH: sebelumnya SELALU acak (getRandomWorker()), jadi kalau chunk ini
        // sedang di-retry gara-gara worker pertama gagal, ada kemungkinan (1/N)
        // random-nya balik lagi ke worker yang SAMA yang baru saja gagal --
        // retry jadi percuma. forceWorker (opsional) dipakai oleh pemanggil
        // (loop retry di startMultiUpload) untuk MEMAKSA worker tertentu yang
        // BEDA dari percobaan sebelumnya. Kalau tidak diisi, perilaku lama
        // (acak) tetap dipakai -- tidak mengubah pemanggil lain (mis. upload
        // thumbnail) yang belum diupdate untuk kirim parameter ini.
        const activeWorker = forceWorker || getRandomWorker();
        const uploadUrl = `${activeWorker}/upload?token=${WORKER_PASSWORD}&bot_token=${TELEGRAM_BOT_TOKEN}`;
        
        // Ubah target POST ke Worker Anda
        xhr.open("POST", uploadUrl);

        const docBlob = (typeof formData.get === 'function') ? formData.get('document') : null;
        const chunkSize = docBlob ? docBlob.size : 0;
        const sendStart = Date.now();
        let gotRealEvent = false;
        let lastLoaded = 0;

        const emit = (loadedInChunk) => {
            if (loadedInChunk < lastLoaded) return; // jangan pernah mundur
            lastLoaded = loadedInChunk;
            const loadedTotal = startBytes + loadedInChunk;
            if (typeof onProgress === 'function') onProgress(loadedTotal, totalFileSize);
        };
        
        xhr.upload.onprogress = (e) => {
            gotRealEvent = true;
            const elapsed = (Date.now() - sendStart) / 1000;
            if (elapsed > 0 && e.loaded > 0) lastKnownUploadSpeedBps = e.loaded / elapsed;
            emit(e.loaded || 0);
        };

        // FALLBACK: sebagian browser/WebView (terutama di HP) tidak pernah memicu
        // xhr.upload.onprogress sama sekali, sehingga progress bar diam di 0% terus
        // walau upload sebenarnya berjalan. Timer ini menaksir progres berdasarkan
        // kecepatan chunk sebelumnya (atau asumsi awal 300KB/s), dibatasi maksimal
        // 95% dari ukuran chunk ini sampai server benar-benar mengonfirmasi selesai,
        // supaya tidak pernah "berbohong" sudah selesai lebih dulu.
        const fallbackSpeed = lastKnownUploadSpeedBps > 0 ? lastKnownUploadSpeedBps : (300 * 1024);
        const fallbackTimer = setInterval(() => {
            if (gotRealEvent) { clearInterval(fallbackTimer); return; }
            const elapsed = (Date.now() - sendStart) / 1000;
            const estLoaded = Math.min(chunkSize * 0.95, fallbackSpeed * elapsed);
            emit(estLoaded);
        }, 350);
        
        xhr.onload = () => { 
            clearInterval(fallbackTimer);
            activeUploadXhrs.delete(xhr); 
            // FIX: sebelumnya kalau gagal cuma dilempar "HTTP 400" doang -- gak
            // kelihatan ALASAN aslinya (Telegram/Cloudflare biasanya balikin body
            // JSON berisi description yang jelas, mis. "Bad Request: file must be
            // non-empty" atau semacamnya). Sekarang badan responsnya ikut dibaca
            // dan ditampilkan, biar pesan errornya kelihatan penyebab pastinya --
            // bukan cuma kode status doang.
            if (item && item.activeXhr === xhr) item.activeXhr = null;
            if (xhr.status !== 200) {
                let detail = '';
                try {
                    const errJson = JSON.parse(xhr.responseText);
                    detail = errJson.description || errJson.error || (typeof errJson === 'string' ? errJson : '');
                } catch (e) { detail = (xhr.responseText || '').slice(0, 200); }
                return reject(new Error('HTTP ' + xhr.status + (detail ? (': ' + detail) : '')));
            }
            try { 
                const json = JSON.parse(xhr.responseText); 
                if (!json.ok) return reject(new Error('Error Telegram: ' + (json.description || JSON.stringify(json)).toString().slice(0,200))); 
                emit(chunkSize); // pastikan chunk ini genap 100% begitu server konfirmasi sukses
                resolve(json); 
            } catch (e) { reject(e); } 
        };
        
        xhr.onerror = () => { clearInterval(fallbackTimer); activeUploadXhrs.delete(xhr); if (item && item.activeXhr === xhr) item.activeXhr = null; reject(new Error('Koneksi terputus saat mengunggah')); };
        xhr.onabort = () => { clearInterval(fallbackTimer); activeUploadXhrs.delete(xhr); if (item && item.activeXhr === xhr) item.activeXhr = null; reject(new Error('Upload dibatalkan.')); };
        
        xhr.send(formData);
    });
}


function generateVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.style.position = 'fixed'; video.style.top = '-9999px'; 
        video.style.width = '1px'; video.style.height = '1px';
        video.muted = true; video.playsInline = true;
        
        const url = URL.createObjectURL(file);
        let isResolved = false; let timeoutId;
        
        const cleanup = (result) => { 
            if (isResolved) return; 
            isResolved = true; 
            clearTimeout(timeoutId); 
            URL.revokeObjectURL(url); 
            if (video.parentNode) video.parentNode.removeChild(video); 
            resolve(result); 
        };
        
        timeoutId = setTimeout(() => cleanup(null), 8000); 
        
        video.addEventListener('loadeddata', () => { 
            try { 
                // Mengambil persis di 100ms (0.1 detik) sesuai permintaan Anda
                video.currentTime = 0.1; 
            } catch (e) { cleanup(null); } 
        });
        
        video.addEventListener('seeked', () => {
            if (isResolved) return;
            
            // Jeda 400ms dipertahankan agar HP selesai me-render frame ke memori sebelum difoto
            setTimeout(() => {
                try {
                    const canvas = document.createElement('canvas');
                    let w = video.videoWidth || 640; let h = video.videoHeight || 360;
                    
                    if (w > 800 || h > 800) { 
                        const ratio = Math.min(800 / w, 800 / h); 
                        w = Math.round(w * ratio); h = Math.round(h * ratio); 
                    }
                    
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d'); 
                    
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    // FIX #2: thumbnail disimpan sebagai WEBP (bukan JPEG) dan dijamin
                    // maksimal 5MB lewat convertImageToWebP yang sudah dipakai untuk
                    // thumbnail gambar, supaya konsisten & ringan saat di-load.
                    canvas.toBlob(async (blob) => {
                        if (!blob) return cleanup(null);
                        try {
                            // canvas.toBlob() di atas SUDAH PASTI menghasilkan JPEG yang valid
                            // (baru dibuat dari frame video, bukan file luar yang tidak jelas
                            // asalnya) -- jadi kalau convertImageToWebP gagal/null (kompresi
                            // webp-nya yang gagal, bukan gambarnya yang rusak), tetap pakai
                            // JPEG mentah ini apa adanya daripada dibuang jadi null.
                            const converted = await convertImageToWebP(blob, 5 * 1024 * 1024);
                            cleanup(converted || blob);
                        }
                        catch (e) { cleanup(blob); }
                    }, 'image/jpeg', 0.9);
                } catch (e) { cleanup(null); }
            }, 400); 
        });
        
        video.addEventListener('error', () => cleanup(null)); 
        video.addEventListener('abort', () => cleanup(null));
        video.src = url; 
        document.body.appendChild(video); 
        video.load();
    });
}



// ==========================================
// FIX BESAR: UPLOAD PARALEL + KARTU VISUAL PER FILE (gaya Google Drive)
// Dulu: 1 file diupload dulu sampai selesai, baru lanjut ke file berikutnya
// (while-loop sekuensial), dan UI-nya cuma 1 progress bar teks global yang
// dipakai bergantian untuk file yang sedang jalan.
// Sekarang: sampai MAX_CONCURRENT_UPLOADS file diupload BERSAMAAN (worker
// pool), sisanya otomatis "menunggu giliran" dan langsung lanjut begitu ada
// slot kosong. Tiap file punya kartu sendiri (thumbnail/ikon + progress bar +
// status sendiri) di renderUploadQueue(), bukan cuma teks nama+persentase.
// ==========================================
async function startMultiUpload() {
    if (uploadQueue.length === 0) return showToast("Pilih file terlebih dahulu!", true);
    if (isUploadInProgress) return;

    // PATCH: DETEKSI FILE 0 BYTE SEBELUM DIKIRIM -- dulu dicek di tengah
    // while-loop sekuensial; sekarang semua file jalan berbarengan jadi
    // validasi ini harus selesai duluan, sebelum satu pun worker dimulai.
    // Hanya berlaku untuk file yang BELUM pernah dicoba ('selected') --
    // file yang sudah done/error/cancelled/queued dibiarkan apa adanya.
    for (let i = uploadQueue.length - 1; i >= 0; i--) {
        const it = uploadQueue[i];
        if (it.status !== 'selected') continue;
        const f = it.file;
        if (!f || f.size === 0) {
            showToast(`${it.customName}: file 0 byte / belum sepenuhnya terunduh (biasanya file iCloud/Files yang belum dibuka). Buka dulu filenya di app Files/Photos sampai terlihat penuh, lalu upload ulang.`, true);
            if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
            uploadQueue.splice(i, 1);
        }
    }
    // Antrean pengiriman: HANYA file yang baru dipilih & belum pernah dicoba.
    // Dipakai sebagai snapshot stabil untuk worker pool -- terpisah dari
    // uploadQueue (yang dipakai buat render & bisa menyusut duluan begitu
    // ada file yang selesai & menghilang -- lihat scheduleRemoveQueueItem).
    const dispatchList = uploadQueue.filter(it => it.status === 'selected');
    if (dispatchList.length === 0) return;

    isUploadInProgress = true;
    isUploadCancelled = false;
    lastUploadFailureMessage = null;

    const btn = document.getElementById('btn-upload');
    btn.disabled = true;
    // FIX UI: dulu tombol ini cuma di-disable (tetap kelihatan abu-abu), dan
    // area "Klik untuk memilih file" tetap aktif -- pengguna masih bisa
    // menambah file baru di tengah proses upload yang berjalan, bikin
    // antrean & progress campur aduk. Sekarang KEDUANYA disembunyikan total
    // begitu upload dimulai, dan baru dimunculkan lagi setelah SEMUA file di
    // antrean ini selesai diproses (baik semuanya sukses, sebagian gagal,
    // maupun dibatalkan) -- lihat ujung startMultiUpload().
    btn.style.display = 'none';
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) dropzone.style.display = 'none';
    const box = document.getElementById('upload-progress-box');
    box.style.display = 'block';

    dispatchList.forEach(it => {
        it.status = 'queued'; it.progressPercent = 0; it.loadedBytes = 0; it.statusText = '';
        it.cancelRequested = false; it.activeXhr = null; it.thumbAbortController = null;
    });
    uploadDispatchList = dispatchList;
    renderUploadQueue();
    updateAggregateUploadUI();

    const totalFiles = dispatchList.length;
    let successCount = 0;
    let nextIndex = 0;

    async function worker() {
        while (true) {
            if (isUploadCancelled) return;
            const myIndex = nextIndex++;
            if (myIndex >= dispatchList.length) return;
            const item = dispatchList[myIndex];
            // Sudah dibatalkan sebelum sempat giliran diproses -- lewati saja.
            if (item.status === 'cancelled' || item.cancelRequested) continue;
            item.status = 'uploading';
            renderUploadQueue();
            let ok = false;
            try { ok = await processQueueItem(item, myIndex + 1, totalFiles); }
            catch (e) { ok = false; item.statusText = (e && e.message) || 'Gagal.'; }
            if (item.status !== 'cancelled') item.status = ok ? 'done' : 'error';
            if (ok) successCount++;
            renderUploadQueue();
            updateAggregateUploadUI();
            if (ok) scheduleRemoveQueueItem(item.qid);
        }
    }

    const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, dispatchList.length);
    const runners = [];
    for (let w = 0; w < workerCount; w++) runners.push(worker());
    await Promise.all(runners);
    uploadDispatchList = [];

    // Semua file di antrean ini sudah selesai diproses -- munculkan lagi UI
    // pemilihan file & tombol upload (lihat catatan FIX UI di awal fungsi).
    btn.style.display = ''; btn.disabled = false;
    if (dropzone) dropzone.style.display = '';

    if (isUploadCancelled) {
        showToast(lastUploadFailureMessage ? `Upload berhenti: ${lastUploadFailureMessage}` : "Proses upload dibatalkan.", true);
        lastUploadFailureMessage = null;
        box.style.display = 'none'; isUploadInProgress = false;
        renderUploadQueue();
    } else {
        const failCount = totalFiles - successCount;
        const sText = document.getElementById('upload-status-text');
        sText.innerHTML = failCount > 0
            ? `Selesai! <b>${successCount} dari ${totalFiles}</b> berkas berhasil, ${failCount} gagal/dibatalkan.`
            : `Selesai! <b>${successCount} dari ${totalFiles}</b> berkas berhasil diunggah.`;
        if (sharedUploadActive) {
            if (!sharedIsSelecting) renderSharedFolderBody({ item: { name: sharedCurrentFolderName, contents: sharedContentsCache }, ownerId: pendingShareResolved && pendingShareResolved.ownerId, ownerName: pendingShareResolved && pendingShareResolved.ownerName, role: sharedUploadFabRole }, sharedUploadShareId, sharedViewerUid, sharedCurrentPath);
        } else {
            renderUI();
            await syncData();
        }
        isUploadInProgress = false;
        if (failCount > 0) {
            // Ada file gagal/dibatalkan -- modal TETAP terbuka supaya pengguna
            // bisa menekan tombol "Ulangi" per file (lihat retryQueueItem),
            // bukan langsung ditutup & dibuang begitu saja.
            renderUploadQueue();
        } else {
            setTimeout(() => { closeUploadModal(); box.style.display = 'none'; uploadQueue = []; }, 1400);
        }
    }
}

// Logika 1 file (thumbnail -> chunk upload dgn retry lintas-worker -> simpan
// metadata), diekstrak dari startMultiUpload lama. Dipanggil dari beberapa
// "worker" sekaligus di atas -- jadi TIDAK BOLEH menulis ke elemen UI tunggal
// (dulu sText/percentEl/fileNameText global); semua status/progress ditulis
// ke kartu milik file ini sendiri lewat item & updateQueueItemProgress(qid,..).
// Return true = sukses, false = gagal (file lain di antrian tetap lanjut).
async function processQueueItem(item, currentIdx, totalFiles) {
    const fileInput = item.file;
    const customName = item.customName.trim() || fileInput.name.split('.')[0];
    const format = item.ext.toLowerCase();
    const folderTarget = sharedUploadActive ? sharedCurrentPath : ((currentTab === 'home') ? currentPath : '');
    const uniqueId = 'FILE_' + Date.now() + '_' + item.qid;
    const prefix = totalFiles > 1 ? `[${currentIdx}/${totalFiles}] ` : '';
    let itemCancelled = false; // FIX: dulu 1 chunk gagal total (semua worker dicoba & tetap gagal)
                                // langsung men-set isUploadCancelled GLOBAL, jadi ikut menghentikan
                                // file lain yang sedang berbarengan diupload. Sekarang kegagalan
                                // fatal hanya menghentikan FILE INI -- file lain tetap lanjut.

    const setStatusText = (txt) => { item.statusText = txt; updateQueueItemProgress(item.qid, item.progressPercent, txt); };
    setStatusText(`${prefix}Menyiapkan...`);

    let thumbTelegramId = null;

    // =====================================
    // PENANGANAN THUMBNAIL VIDEO
    // =====================================
    if (fileInput.type.startsWith('video/') || VIDEO_EXTENSIONS.has(format)) {
        setStatusText(`${prefix}Membuat thumbnail video...`);
        // Kalau preview kartu di antrian SUDAH digenerate saat file dipilih
        // (lihat prepareQueueItemPreview), pakai ulang blob yang sama persis
        // -- tidak perlu capture frame video 2x untuk hal yang identik.
        let thumbBlob = item.thumbBlob || await generateVideoThumbnail(fileInput);

        if (isUploadCancelled || item.cancelRequested) return false;

        if (thumbBlob) {
            const fdThumb = new FormData();
            fdThumb.append('chat_id', TELEGRAM_CHAT_ID);
            fdThumb.append('document', thumbBlob, 'cover.dat');

            const activeWorker = getRandomWorker();
            const uploadUrl = `${activeWorker}/upload?token=${WORKER_PASSWORD}&bot_token=${TELEGRAM_BOT_TOKEN}`;
            item.thumbAbortController = new AbortController();
            try {
                const tRes = await fetch(uploadUrl, { method: 'POST', body: fdThumb, signal: item.thumbAbortController.signal }).then(r => r.json());
                if (tRes.ok) {
                    if (tRes.result.document) thumbTelegramId = tRes.result.document.file_id;
                    else if (tRes.result.sticker) thumbTelegramId = tRes.result.sticker.file_id;
                }
            } catch (e) { console.error("Gagal upload thumb", e); }
            item.thumbAbortController = null;
        }
    }
    // =====================================
    // PENANGANAN THUMBNAIL GAMBAR
    // =====================================
    else if (IMAGE_EXTENSIONS.has(format)) {
        setStatusText(`${prefix}Menyiapkan preview image...`);
        let previewBlob = null;
        let extractedJpegFallback = null;

        try {
            previewBlob = await Promise.race([
                convertImageToWebP(fileInput, 5 * 1024 * 1024),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 9000))
            ]);
        } catch (e) { previewBlob = null; }

        if (!previewBlob && ['cr2', 'nef', 'arw', 'dng', 'raw', 'rw2', 'orf', 'pef', 'srw', 'heic', 'heif'].includes(format)) {
            try {
                const u8 = await extractRawEmbeddedPreview(fileInput);
                if (u8) {
                    const extracted = new Blob([u8], { type: 'image/jpeg' });
                    extractedJpegFallback = extracted;
                    try {
                        previewBlob = await Promise.race([
                            convertImageToWebP(extracted, 5 * 1024 * 1024),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 9000))
                        ]);
                    } catch (e) { previewBlob = null; }
                }
            } catch (e) { /* memang tidak ada preview JPEG apa pun yang bisa ditemukan di file ini */ }
        }

        if (!previewBlob && extractedJpegFallback) previewBlob = extractedJpegFallback;

        if (previewBlob) {
            const fdThumb = new FormData();
            fdThumb.append('chat_id', TELEGRAM_CHAT_ID);
            fdThumb.append('document', previewBlob, 'cover.dat');

            const activeWorker = getRandomWorker();
            const uploadUrl = `${activeWorker}/upload?token=${WORKER_PASSWORD}&bot_token=${TELEGRAM_BOT_TOKEN}`;
            item.thumbAbortController = new AbortController();
            try {
                const tRes = await fetch(uploadUrl, { method: 'POST', body: fdThumb, signal: item.thumbAbortController.signal }).then(r => r.json());
                if (tRes.ok) {
                    if (tRes.result.document) thumbTelegramId = tRes.result.document.file_id;
                    else if (tRes.result.sticker) thumbTelegramId = tRes.result.sticker.file_id;
                }
            } catch (e) { console.error("Gagal upload thumb", e); }
            item.thumbAbortController = null;
        }
    }

    if (isUploadCancelled || item.cancelRequested) return false;

    setStatusText(`${prefix}Memulai upload...`);
    const totalChunks = Math.ceil(fileInput.size / CHUNK_SIZE);
    const uploadedChunks = [];
    let bytesSoFar = 0;
    let fileStartTime = Date.now();

    // ==========================================
    // FIX #8: RETRY PER-CHUNK LINTAS WORKER (lihat penjelasan panjang di versi
    // lama) -- perilakunya dipertahankan persis sama di sini, cuma dipindah
    // jadi milik 1 file/1 pemanggilan fungsi ini.
    // ==========================================
    const CHUNK_MAX_ATTEMPTS = Math.max(3, WORKER_POOL.length * 2);
    for (let i = 0; i < totalChunks; i++) {
        if (isUploadCancelled || itemCancelled || item.cancelRequested) break;
        let chunkBlob = fileInput.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, fileInput.size));

        // PATCH: WORKAROUND BUG SAFARI/WEBKIT (lihat penjelasan versi lama) --
        // paksa baca semua byte ke memori dulu sebelum dipakai di FormData.
        try {
            const buf = await chunkBlob.arrayBuffer();
            if (!buf || buf.byteLength === 0) {
                throw new Error('Bagian file ini terbaca 0 byte oleh browser (kemungkinan masalah akses file di iOS/Safari). Coba pilih ulang filenya, atau buka dulu file aslinya di app Foto/Files sebelum upload.');
            }
            chunkBlob = new Blob([buf], { type: chunkBlob.type || 'application/octet-stream' });
        } catch (readErr) {
            itemCancelled = true;
            item.statusText = readErr.message || 'Gagal membaca isi file dari device.';
            setStatusText(item.statusText);
            showToast(`${customName}: ${item.statusText}`, true);
            break;
        }

        const caption = `[${uniqueId}] ${customName}.${format} - Part ${i + 1}/${totalChunks}`;

        let chunkResult = null;
        let chunkErr = null;
        for (let attempt = 0; attempt < CHUNK_MAX_ATTEMPTS; attempt++) {
            if (isUploadCancelled || itemCancelled || item.cancelRequested) break;
            // FormData harus dibuat baru tiap percobaan -- lihat catatan versi lama.
            const fd = new FormData();
            fd.append('chat_id', TELEGRAM_CHAT_ID);
            fd.append('document', chunkBlob, `part_${i + 1}.dat`);
            fd.append('caption', caption);
            const targetWorker = WORKER_POOL[attempt % WORKER_POOL.length];

            if (attempt > 0) setStatusText(`${prefix}Percobaan ulang chunk ${i + 1}/${totalChunks} (server ${(attempt % WORKER_POOL.length) + 1}/${WORKER_POOL.length})...`);

            try {
                chunkResult = await uploadChunkXHR(fd, bytesSoFar, fileInput.size, (loaded, total) => {
                    let percent = (loaded / total) * 100;
                    if (percent > 100) percent = 100;
                    percent = Number(percent.toFixed(1));
                    item.progressPercent = percent;
                    item.loadedBytes = loaded;

                    let now = Date.now();
                    let elapsed = (now - fileStartTime) / 1000;
                    let etaString = "Menghitung...";
                    if (elapsed > 0.5 && loaded > 0) {
                        let speed = loaded / elapsed;
                        let remaining = total - loaded;
                        let eta = remaining / speed;
                        if (eta !== Infinity && !isNaN(eta)) {
                            let mins = Math.floor(eta / 60);
                            let secs = Math.floor(eta % 60);
                            etaString = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                        }
                    }
                    updateQueueItemProgress(item.qid, percent, `${prefix}${percent}% • ETA ${etaString}`);
                    updateAggregateUploadUI();
                }, targetWorker, item);
                chunkErr = null;
                break; // sukses, keluar dari loop retry chunk ini
            } catch (e) {
                chunkErr = e;
                if (attempt < CHUNK_MAX_ATTEMPTS - 1 && !isUploadCancelled && !itemCancelled && !item.cancelRequested) {
                    await sleep(600 * (attempt + 1));
                }
            }
        }

        if (chunkErr) {
            itemCancelled = true;
            // Kalau ini akibat pengguna sendiri menekan tombol Batalkan, status
            // & pesannya sudah diset duluan oleh cancelQueueItem() ("Dibatalkan")
            // -- jangan ditimpa jadi pesan error teknis + jangan munculkan toast.
            if (!item.cancelRequested) {
                item.statusText = `Gagal (chunk ${i + 1}/${totalChunks}, sudah dicoba semua server): ${chunkErr.message}`;
                setStatusText(item.statusText);
                showToast(`${customName}: upload gagal dan dihentikan (${chunkErr.message})`, true);
            }
            break;
        }

        uploadedChunks.push({ part: i + 1, telegramFileId: chunkResult.result.document.file_id });
        bytesSoFar += chunkBlob.size;
    }

    if (isUploadCancelled) return false;
    if (itemCancelled) return false;
    if (item.cancelRequested) return false;

    setStatusText(`${prefix}Menyimpan metadata...`);
    let metaRes;
    if (sharedUploadActive) {
        metaRes = await saveMetadataViaForm({ fileId: uniqueId, customName: customName, originalName: fileInput.name, format: format, folder: folderTarget, fileSize: fileInput.size, totalChunks: totalChunks, chunks: uploadedChunks, thumbId: thumbTelegramId, shareId: sharedUploadShareId, viewerUid: sharedUploadViewerUid }, 'shared_save_metadata');
        if (metaRes && metaRes.success !== false && !sharedContentsCache.files.some(f => f.id === uniqueId)) sharedContentsCache.files.push({ id: uniqueId, name: customName, originalName: fileInput.name, format: format, folder: folderTarget, size: fileInput.size, thumbId: thumbTelegramId });
    } else {
        metaRes = await saveMetadataViaForm({ fileId: uniqueId, customName: customName, originalName: fileInput.name, format: format, folder: folderTarget, fileSize: fileInput.size, totalChunks: totalChunks, chunks: uploadedChunks, thumbId: thumbTelegramId, ownerId: currentOwnerId });
        if (metaRes && metaRes.success !== false && !stateArray.active.some(f => f.id === uniqueId)) stateArray.active.push({ id: uniqueId, name: customName, originalName: fileInput.name, format: format, folder: folderTarget, size: fileInput.size, thumbId: thumbTelegramId });
    }

    if (!metaRes || metaRes.success === false) {
        // FIX: sebelum benar-benar divonis gagal, cek dulu ke server apakah
        // baris metadata ini SEBENARNYA sudah tersimpan (bisa terjadi kalau
        // permintaan sempat sukses di server tapi RESPONSNYA yang gagal
        // sampai balik ke browser -- pesan errornya jadi menyesatkan padahal
        // datanya sudah ada). Kalau ternyata sudah ada, anggap sukses saja.
        const verifyRes = sharedUploadActive
            ? await callGasAPI('get_chunks', { fileId: uniqueId, shareId: sharedUploadShareId, viewerUid: sharedUploadViewerUid })
            : await callGasAPI('get_chunks', { fileId: uniqueId, ownerId: currentOwnerId });
        if (verifyRes && verifyRes.success) {
            if (sharedUploadActive) { if (!sharedContentsCache.files.some(f => f.id === uniqueId)) sharedContentsCache.files.push({ id: uniqueId, name: customName, originalName: fileInput.name, format: format, folder: folderTarget, size: fileInput.size, thumbId: thumbTelegramId }); }
            else { if (!stateArray.active.some(f => f.id === uniqueId)) stateArray.active.push({ id: uniqueId, name: customName, originalName: fileInput.name, format: format, folder: folderTarget, size: fileInput.size, thumbId: thumbTelegramId }); }
            item.progressPercent = 100;
            return true;
        }
        item.statusText = `Metadata gagal disimpan: ${(metaRes && metaRes.message) || 'semua server penuh/limit'}`;
        setStatusText(item.statusText);
        showToast(`Gagal menyimpan metadata untuk ${customName}: ${(metaRes && metaRes.message) || 'semua server penuh/limit'}.`, true);
        return false;
    }

    item.progressPercent = 100;
    return true;
}

function openCreateFolderModal() { document.getElementById('folder-modal').style.display = 'flex'; }
function closeCreateFolderModal() { document.getElementById('folder-modal').style.display = 'none'; }

// ==========================================
// SHARING SYSTEM
// ==========================================
async function openShareModal(itemType) {
    closeFileOptions(); closeFolderOptions();
    let targetId = itemType === 'file' ? selectedFileForAction.id : selectedFolderForAction;
    
    let itemObj = itemType === 'folder' 
        ? stateArray.folders.find(f => f.path === targetId) 
        : stateArray.active.find(f => f.id === targetId);
    
    shareCtx = { itemType: itemType, itemId: targetId, privacy: 'private', allowedUsers: [], shareId: null, isDirty: false, linkRole: 'view' };
    
    if (itemObj && itemObj.shareInfo) {
        shareCtx.privacy = itemObj.shareInfo.privacy;
        shareCtx.shareId = itemObj.shareInfo.isInherited ? null : itemObj.shareInfo.shareId; 
        shareCtx.linkRole = itemObj.shareInfo.linkRole === 'edit' ? 'edit' : 'view';
        try { shareCtx.allowedUsers = JSON.parse(itemObj.shareInfo.allowedUsers || '[]'); } catch(e){}
        shareCtx.allowedUsers = shareCtx.allowedUsers.map(u => ({ uid: u.uid, username: u.username, role: u.role === 'edit' ? 'edit' : 'view' }));
    }

    let displayName = itemType === 'file' 
        ? (selectedFileForAction.name + (selectedFileForAction.format ? '.' + selectedFileForAction.format : '')) 
        : targetId.split('/').pop();
        
    document.getElementById('share-modal-title').innerText = 'Bagikan "' + displayName + '"';
    document.getElementById('share-modal-title').title = 'Bagikan "' + displayName + '"';
    document.getElementById('share-modal').style.display = 'flex';
    document.getElementById('share-link-box').style.display = 'none';
    
    renderShareModalState(); 
}
function setShareFormLocked(locked) {
    const select = document.getElementById('share-privacy-select');
    const saveBtn = document.getElementById('share-save-btn');
    const searchInput = document.getElementById('share-user-search');
    if (select) select.disabled = locked;
    if (saveBtn) saveBtn.disabled = locked;
    if (searchInput) searchInput.disabled = locked;
    const panel = document.getElementById('share-modal-body');
    if (panel) panel.style.opacity = locked ? '0.5' : '1';
}
function closeShareModal() { document.getElementById('share-modal').style.display = 'none'; document.getElementById('user-search-results').style.display = 'none'; }

function selectPrivacy(privacy) { 
    shareCtx.privacy = privacy; 
    shareCtx.isDirty = true;
    renderShareModalState(); 
}
function toggleLinkRole() {
    // Balikkan nilainya: jika edit jadi view, jika view jadi edit
    shareCtx.linkRole = shareCtx.linkRole === 'edit' ? 'view' : 'edit';
    shareCtx.isDirty = true;
    
    // Panggil fungsi render untuk memperbarui warna tombol dan teks
    renderShareModalState(); 
}


function toggleUserRole(idx) {
    const u = shareCtx.allowedUsers[idx]; if (!u) return;
    u.role = (u.role === 'edit') ? 'view' : 'edit';
    shareCtx.isDirty = true;
    renderAllowedUsersList();
}
const PRIVACY_DESC = {
    private: 'Cuma bisa dibuka dari akun Anda sendiri.',
    link: 'Siapapun dengan link ini bisa membuka, tanpa perlu login.',
    restricted: 'Hanya akun tertentu yang bisa membuka (maks. 10 orang).'
};

function renderShareModalState() {
    const select = document.getElementById('share-privacy-select');
    if (select) select.value = shareCtx.privacy;
    
    const descEl = document.getElementById('share-privacy-desc');
    if (descEl) descEl.innerText = PRIVACY_DESC[shareCtx.privacy] || '';
    
    const restrictedPanel = document.getElementById('share-restricted-panel');
    if (restrictedPanel) restrictedPanel.style.display = shareCtx.privacy === 'restricted' ? 'block' : 'none';

    const linkRolePanel = document.getElementById('share-link-role-panel');
    if (linkRolePanel) {
        linkRolePanel.style.display = shareCtx.privacy === 'link' ? 'flex' : 'none';
        
        // Logika Update Tombol Toggle (Lihat / Edit)
        const roleBtn = document.getElementById('share-link-role-btn');
        const roleIcon = document.getElementById('share-link-role-icon');
        const roleText = document.getElementById('share-link-role-text');
        
        if (roleBtn) {
            if (shareCtx.linkRole === 'edit') {
                roleBtn.classList.add('is-edit');
                if (roleIcon) roleIcon.innerText = 'edit';
                if (roleText) roleText.innerText = 'Edit';
            } else {
                roleBtn.classList.remove('is-edit');
                if (roleIcon) roleIcon.innerText = 'visibility';
                if (roleText) roleText.innerText = 'Lihat';
            }
        }
    }

    renderAllowedUsersList();

    const linkBox = document.getElementById('share-link-box');
    if (shareCtx.shareId && shareCtx.privacy !== 'private' && !shareCtx.isDirty) {
        if (linkBox) linkBox.style.display = 'flex';
        const linkText = document.getElementById('share-link-text');
        if (linkText) linkText.innerText = buildShareLink(shareCtx.shareId);
    } else { 
        if (linkBox) linkBox.style.display = 'none'; 
    }

    const cascadeNote = document.getElementById('share-cascade-note');
    if (cascadeNote) {
        cascadeNote.style.display = (shareCtx.itemType === 'folder' && shareCtx.privacy !== 'private') ? 'block' : 'none';
    }
}


document.addEventListener('click', (e) => {
    const searchBox = document.getElementById('user-search-results');
    const searchInput = document.getElementById('share-user-search');
    if (searchBox && searchBox.style.display === 'block') {
        if (!searchBox.contains(e.target) && e.target !== searchInput) {
            searchBox.style.display = 'none';
        }
    }
});

function renderAllowedUsersList() {
    const container = document.getElementById('allowed-users-list');
    container.innerHTML = '';
    shareCtx.allowedUsers.forEach((u, idx) => {
        const isEdit = u.role === 'edit';
        const row = document.createElement('div'); row.className = 'allowed-user-row';
        // FIX #5: username orang lain (bisa didaftarkan siapa saja) -> escape dulu.
        row.innerHTML = `
            <div class="allowed-user-info">
                <div class="user-avatar"><span class="material-symbols-rounded" style="font-size:18px;">person</span></div>
                <div class="text-wrap">
                    <span class="usr-name" title="${escapeHtml(u.username)}">${escapeHtml(u.username)}</span>
                    <span class="usr-id">ID: ${escapeHtml(u.uid)}</span>
                </div>
            </div>
            <button type="button" class="role-toggle-pill ${isEdit ? 'is-edit' : ''}" onclick="toggleUserRole(${idx})" title="Ganti peran (Lihat/Edit)">
                <span class="material-symbols-rounded" style="font-size:14px;">${isEdit ? 'edit' : 'visibility'}</span>${isEdit ? 'Edit' : 'Lihat'}
            </button>
            <button class="btn-remove-user" onclick="removeUserFromShareList(${idx})" title="Hapus akses">
                <span class="material-symbols-rounded" style="font-size:22px;">close</span>
            </button>
        `;
        container.appendChild(row);
    });
    document.getElementById('allowed-users-count').innerText = `${shareCtx.allowedUsers.length} / 10 orang diberi akses`;
}

function onShareUserSearchInput() {
    clearTimeout(shareUserSearchTimer);
    const q = document.getElementById('share-user-search').value.trim();
    const box = document.getElementById('user-search-results');
    if (q.length === 0) { box.style.display = 'none'; return; }

    box.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px; display:flex; align-items:center; justify-content:center; gap:8px;"><span class="spinner" style="width:16px; height:16px; border-width:2px; border-top-color:var(--primary);"></span> Mencari pengguna...</div>';
    box.style.display = 'block';

    shareUserSearchTimer = setTimeout(async () => {
        const res = await callGasAPI('search_users', { query: q, excludeUid: currentOwnerId, ownerId: currentOwnerId });
        box.innerHTML = '';
        if (res && res.success && res.results.length > 0) {
            res.results.forEach(u => {
                if (shareCtx.allowedUsers.some(a => a.uid === u.uid)) return;

                const item = document.createElement('div'); item.className = 'user-search-item';
                // FIX #5: escape username sebelum ditaruh di innerHTML.
                item.innerHTML = `
                    <div class="user-avatar"><span class="material-symbols-rounded" style="font-size:20px;">person</span></div>
                    <div class="user-details">
                        <span class="usr-name" title="${escapeHtml(u.username)}">${escapeHtml(u.username)}</span>
                        <span class="usr-id">ID: ${escapeHtml(u.uid)}</span>
                    </div>
                `;
                item.onclick = () => addUserToShareList(u);
                box.appendChild(item);
            });

            if(box.children.length === 0) {
                 box.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">Pengguna sudah ditambahkan.</div>';
            }
        } else if (res && res.networkError) {
            box.innerHTML = '<div style="padding:16px; text-align:center; color:var(--danger, #d9534f); font-size:13px;">Gagal terhubung ke server. Coba lagi.</div>';
        } else {
            box.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">Pengguna tidak ditemukan.</div>';
        }
    }, 350); 
}

function addUserToShareList(user) {
    if (shareCtx.allowedUsers.length >= 10) { showToast("Maksimal 10 orang yang bisa diberi akses pribadi.", true); return; }
    if (shareCtx.allowedUsers.some(u => u.uid === user.uid)) return;
    shareCtx.allowedUsers.push({ uid: user.uid, username: user.username, role: 'view' });
    shareCtx.isDirty = true;
    document.getElementById('share-user-search').value = '';
    document.getElementById('user-search-results').style.display = 'none';
    renderAllowedUsersList();
    renderShareModalState();
}

function removeUserFromShareList(idx) { 
    shareCtx.allowedUsers.splice(idx, 1); 
    shareCtx.isDirty = true;
    renderAllowedUsersList(); 
    renderShareModalState();
}

function buildShareLink(shareId) { return `${location.origin}${location.pathname}?share=${shareId}`; }

async function saveShare() {
    if (shareCtx.privacy === 'restricted' && shareCtx.allowedUsers.length === 0) { showToast("Tambahkan minimal 1 orang, atau pilih opsi lain.", true); return; }
    showLoadingOverlay("Menyimpan pengaturan berbagi...", false, false);
    
    const res = await callGasAPI('save_share', {
        itemId: shareCtx.itemId, itemType: shareCtx.itemType, ownerId: currentOwnerId, ownerName: currentUser,
        privacy: shareCtx.privacy, allowedUsers: shareCtx.allowedUsers, linkRole: shareCtx.linkRole,
        cascade: shareCtx.itemType === 'folder'
    });
    
    hideLoadingOverlay();
    if (res && res.success) {
        shareCtx.shareId = res.shareId;
        shareCtx.isDirty = false;
        markRecentWrite(res.shareId); // FIX: halaman /?share=xxx pakai jalur GAS dulu selama cooldown, bukan gviz basi
        showToast("Pengaturan berbagi disimpan!", false);
        renderShareModalState();
        renderUI();
    } else { 
        showToast((res && res.message) || "Gagal menyimpan pengaturan berbagi.", true); 
    }
}
function copyShareLink() {
    const text = document.getElementById('share-link-text').innerText;
    if (!text) return;
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => showToast("Link disalin!", false)).catch(() => {
        const tmp = document.createElement('textarea'); tmp.value = text; document.body.appendChild(tmp); tmp.select();
        document.execCommand('copy'); document.body.removeChild(tmp); showToast("Link disalin!", false);
    });
}
function copyCurrentPageLink() {
    navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => showToast("Link disalin!", false)).catch(() => showToast("Gagal menyalin link.", true));
}

function startSharedWithMePolling() {
    refreshSharedWithMe();
    startRealtimePolling();
}
async function refreshSharedWithMe() {
    if (!currentOwnerId) return;
    try {
        const raw = await fetchRawSheets();
        const items = buildSharedWithMeFromRaw(raw, currentOwnerId);
        lastSharedSignature = JSON.stringify(items);
        sharedWithMeItems = items;
        if (currentTab === 'shared') renderSharedWithMeMain(document.getElementById('search-input') ? document.getElementById('search-input').value : '');
    } catch (e) {
        const res = await callGasAPI('get_shared_with_me', { uid: currentOwnerId });
        if (res && res.success) {
            sharedWithMeItems = (res.items || []).filter(it => it.itemType === 'folder');
            lastSharedSignature = JSON.stringify(sharedWithMeItems);
            if (currentTab === 'shared') renderSharedWithMeMain(document.getElementById('search-input') ? document.getElementById('search-input').value : '');
        }
    }
}
// PATCH: dulu daftar "Dibagikan Kepada Anda" ini ditaruh sebagai list kecil
// permanen di sidebar (bikin sidebar penuh). Sekarang dipindah jadi tab
// tersendiri ("Dibagikan"), dirender pakai grid folder yang sama seperti tab
// Folder lainnya -- klik salah satu itemnya tetap membuka link share itu di
// tab baru, sama seperti sebelumnya.
function renderSharedWithMeMain(filterText = '') {
    document.getElementById('folder-container-wrapper').style.display = 'block';
    document.getElementById('folder-section-label').innerText = 'Dibagikan Kepada Anda';
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('select-all-container').style.display = 'none';
    const folderList = document.getElementById('folder-list');
    let items = sharedWithMeItems;
    if (filterText) items = items.filter(it => (it.itemName || '').toLowerCase().includes(filterText.toLowerCase()));
    renderInBatches_(folderList, items, (item) => {
        const card = document.createElement('div'); card.className = 'folder-card';
        card.onclick = () => { window.open(buildShareLink(item.shareId), '_blank'); };
        card.innerHTML = `
            <div class="folder-icon-box"><span class="material-symbols-rounded">${item.itemType === 'folder' ? 'folder_shared' : 'description'}</span></div>
            <div class="folder-info">
                <span class="folder-name" title="${escapeHtml(item.itemName)}">${escapeHtml(item.itemName)}</span>
                <span class="folder-meta">Dibagikan oleh ${escapeHtml(item.ownerName)}</span>
            </div>
        `;
        return card;
    }, `<div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--text-muted); font-size:14px;">Belum ada folder yang dibagikan ke Anda.</div>`);
}

function getViewerAccountForOwner(ownerId) { return accountsList.find(a => a.ownerId === ownerId) || null; }

// Login/auth SUNGGUHAN ke akun pemilik (bukan cuma nge-fake viewerUid) --
// sesi akun aktif betul-betul dipindah ke akun pemilik ini, dengan syarat
// akunnya memang sudah tersimpan/login di perangkat ini sebelumnya.
async function authenticateToOwnerAccount(ownerAccount) {
    try {
        const verify = await callGasAPI('verify_account', { ownerId: ownerAccount.ownerId });
        if (!verify || (!verify.success && !verify.networkError)) return false;
    } catch (e) { return false; }
    accountsList = accountsList.filter(a => a.user !== ownerAccount.user);
    accountsList.unshift(ownerAccount);
    setActiveAccount(ownerAccount);
    saveAccountsToStorage();
    return true;
}

// FIX: spinner loading awal shared-link (terutama link berformat file
// tunggal) dulu dibuat pakai div height:60vh yang cuma center DI DALAM
// dirinya sendiri, dan itu ditaruh di bawah padding .shared-body (24px)
// + tinggi .shared-header -- hasilnya spinner kelihatan nempel ke atas,
// bukan dead-center layar. Sekarang posisinya position:fixed dan tingginya
// dihitung dari tinggi header yang SEBENARNYA dirender (bukan ditebak),
// jadi selalu pas di tengah area yang kelihatan, di semua ukuran layar.
// FIX BUG "NAVBAR HILANG SETELAH BUKA LINK FILE/FOLDER YANG DIBAGIKAN":
// #shared-view adalah kontainer scroll-nya sendiri (overflow-y:auto), dan
// .shared-header ada DI DALAM alur scroll itu (bukan position:sticky/fixed).
// Sebelumnya scrollTop kontainer ini TIDAK PERNAH direset -- kalau
// sebelumnya pengguna sempat scroll ke bawah (mis. di tab/instance app yang
// sama dipakai lagi untuk membuka link share lain), posisi scroll lama itu
// terbawa terus, sehingga begitu konten baru dirender, header ada di atas
// area yang sudah discroll lewat -- KELIHATAN hilang padahal cuma
// tersembunyi di atas viewport. Dipanggil di setiap TITIK NAVIGASI (buka
// link baru, pindah folder) -- BUKAN di setiap tick polling realtime,
// supaya update dari perangkat lain tidak memaksa scroll pengguna balik ke
// atas saat sedang membaca/scroll di tengah folder.
function resetSharedViewScroll() {
    const sv = document.getElementById('shared-view');
    if (sv) sv.scrollTop = 0;
}

function showSharedFullscreenLoader(text) {
    const headerEl = document.querySelector('#shared-view .shared-header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    document.getElementById('shared-body').innerHTML = `
        <div style="position:fixed; left:0; right:0; top:${headerH}px; bottom:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; background:var(--bg-main); z-index:1;">
            <div class="spinner"></div>
            <p style="color:var(--text-secondary); font-size:13.5px;">${escapeHtml(text)}</p>
        </div>`;
}

async function handleSharedLink(code) {
    pendingShareCode = code;
    sharedSelectedIds.clear(); sharedIsSelecting = false;
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-layout').style.display = 'none';
    document.getElementById('shared-view').style.display = 'flex';
    resetSharedViewScroll();
    document.getElementById('shared-breadcrumb').style.display = 'none';
    showSharedFullscreenLoader('Memuat tautan yang dibagikan...');

    const activeAcc = getActiveStoredAccount();
    preShareOwnerId = activeAcc ? activeAcc.ownerId : '';
    preShareUser = activeAcc ? activeAcc.user : '';
    sharedViewerUid = activeAcc ? activeAcc.ownerId : '';
    sharedIsOwnerView = false;

    // FIX: pemuatan PERTAMA kali link share dibuka juga bisa kena race gviz
    // yang sama seperti di polling (lihat catatan di startSharedPolling) --
    // misalnya link dibuka persis sesaat setelah pemiliknya rename folder/ubah
    // privasi di HP lain. Sama seperti di polling: kalau gviz kelihatan gagal,
    // konfirmasi SEKALI ke GAS (live, gak ada cache) -- bukan retry/nunggu
    // berkali-kali, karena itu cuma menunda tanpa menjamin datanya jadi benar.
    let res = await getSharedDataFromSheets(code, sharedViewerUid);
    if (!res || !res.success) {
        res = await getSharedDataFromSheets(code, sharedViewerUid, null, true);
    }
    pendingShareResolved = res;

    if (!res) { stopSharedPolling(); renderShare404(); updateSharedViewChrome(); return; }

    // Item sudah dihapus/masuk sampah. Kalau kebetulan pemiliknya sendiri yang
    // buka link ini dan akunnya ada di perangkat ini, LOGIN BENERAN dulu ke
    // akun itu (kalau belum aktif), baru arahkan ke tempat yang tepat.
    if (res.deleted) {
        const ownerAccount = res.ownerId ? getViewerAccountForOwner(res.ownerId) : null;
        if (ownerAccount) {
            let ok = true;
            if (sharedViewerUid !== ownerAccount.ownerId) {
                showLoadingOverlay(`Masuk ke akun ${ownerAccount.user}...`, false, false);
                ok = await authenticateToOwnerAccount(ownerAccount);
                hideLoadingOverlay();
            }
            if (ok) {
                if (res.inTrash) { await redirectOwnerToTrash(ownerAccount, res); return; }
                await redirectOwnerToDeletedError(ownerAccount, res); return;
            }
        }
        stopSharedPolling(); renderShare404(); updateSharedViewChrome(); return;
    }

    if (!res.success) { stopSharedPolling(); renderShare404(); updateSharedViewChrome(); return; }

    // Belum diotorisasi (privasi private/restricted, dan akun yang sedang
    // aktif bukan pemiliknya). Cek dulu apakah pemiliknya punya akun di
    // perangkat ini -- kalau ada, LOGIN BENERAN ke akun itu (bukan nge-fake
    // identitas viewer), baru ambil ulang datanya pakai sesi akun yang
    // sebenarnya sudah berpindah.
    if (!res.authorized) {
        const ownerAccount = res.ownerId ? getViewerAccountForOwner(res.ownerId) : null;
        if (ownerAccount) {
            showLoadingOverlay(`Masuk ke akun ${ownerAccount.user}...`, false, false);
            const switched = await authenticateToOwnerAccount(ownerAccount);
            hideLoadingOverlay();
            if (switched) {
                sharedViewerUid = ownerAccount.ownerId;
                res = await getSharedDataFromSheets(code, sharedViewerUid);
                pendingShareResolved = res;
            }
        }
        if (!res || !res.success) {
            if (res && res.deleted) { stopSharedPolling(); renderShare404(); updateSharedViewChrome(); return; }
            renderSharedAuthWall(res); startSharedPolling(code); return;
        }
    }

    // Kalau ownernya sendiri yang buka link ini (baik sudah aktif dari awal,
    // atau baru saja berhasil di-login-kan otomatis di atas), langsung
    // alihkan ke Drive miliknya sendiri -- gak perlu lewat tampilan "shared".
    // Untuk folder langsung dibuka foldernya, untuk file langsung dicariin
    // lewat kolom cari.
    const ownerAccount = getViewerAccountForOwner(res.ownerId);
    if (ownerAccount) {
        let ok = true;
        if (sharedViewerUid !== ownerAccount.ownerId) {
            showLoadingOverlay(`Masuk ke akun ${ownerAccount.user}...`, false, false);
            ok = await authenticateToOwnerAccount(ownerAccount);
            hideLoadingOverlay();
        }
        if (ok) { await redirectOwnerToDrive(ownerAccount, res); return; }
    }

    // FIX BUG "LOADING TERUS": kalau sampai titik ini viewer TETAP belum
    // authorized (baik karena privacy 'private' maupun 'restricted', dan
    // akun pemiliknya juga tidak ada di perangkat ini untuk auto-login),
    // res.item TIDAK ADA sama sekali. Sebelumnya kode di bawah ini langsung
    // baca res.item.path tanpa cek dulu -> exception -> layar macet selamanya
    // di spinner "Memuat tautan yang dibagikan...". Sekarang ditangani
    // eksplisit SEBELUM res.item disentuh sama sekali, untuk SEMUA jenis
    // privasi (dulu cuma privacy 'restricted' yang dicek di sini, padahal
    // privacy 'private' juga bisa authorized:false tanpa res.item).
    if (!res.authorized) { renderSharedAuthWall(res); updateSharedViewChrome(); startSharedPolling(code); return; }

    sharedRootItem = { path: res.item.path || '', name: res.item.name, itemType: res.itemType, ownerId: res.ownerId };
    sharedCurrentPath = res.item.path || '';
    sharedPathSegments = []; // baru masuk lagi dari root
    updateSharedViewChrome();

    document.getElementById('shared-owner-banner').style.display = 'flex';
    document.getElementById('shared-owner-banner').innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;">person</span> Dibagikan oleh <b>&nbsp;${res.ownerName}</b>`;

    // FIXED: Menggunakan sharedViewerUid bukan viewerUid
    if (res.itemType === 'file') renderSharedFileBody(res, code, sharedViewerUid);
    else renderSharedFolderBody(res, code, sharedViewerUid, res.item.path);
    resetSharedViewScroll();

    startSharedPolling(code);
}


async function redirectOwnerToDrive(ownerAccount, res) {
    stopSharedPolling();
    pendingShareCode = null; 
    pendingShareResolved = null; 

    // FIX: paksa aktifkan akun pemilik lagi di sini juga (jaga-jaga) --
    // sebelumnya kita cuma PERCAYA bahwa authenticateToOwnerAccount() di
    // pemanggil sudah benar-benar mengubah currentOwnerId. Kalau karena
    // sebab apapun itu belum "nempel" (mis. dipanggil dari cabang lain),
    // syncData() di bawah akan salah ambil data akun yang MASIH AKTIF lama,
    // sehingga berkas yang dicari "tidak ketemu". Dipanggil ulang di sini
    // supaya currentOwnerId dijamin benar SEBELUM syncData() jalan.
    setActiveAccount(ownerAccount);

    document.getElementById('shared-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-layout').style.display = 'flex';
    // FIX (HP): pastikan drawer sidebar mobile & backdrop-nya tidak ketinggalan
    // dalam kondisi "terbuka" saat beralih dari halaman share ke drive sendiri --
    // kalau ketinggalan, overlay itu bisa menutupi bottom-nav dan membuatnya
    // terlihat hilang/nge-bug begitu mendarat di layar HP.
    document.getElementById('app-sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');

    window.history.replaceState({}, document.title, location.origin + location.pathname);

    showLoadingOverlay("Membuka item Anda...", false, false);
    await syncData();

    // FIX: kadang data sheet (gviz) belum ke-update di sisi Google beberapa
    // detik setelah aksi terakhir (delay cache bawaan Google, di luar kendali
    // kita), jadi berkas yang baru saja dibuka linknya belum muncul di
    // stateArray meskipun akun sudah benar. Kalau item belum ketemu, tunggu
    // sebentar lalu sync ULANG sekali sebelum benar-benar menyerah, supaya
    // pencarian di bawah tidak "kosong" gara-gara balapan waktu ini.
    const stillMissing = res.itemType === 'folder'
        ? !getAllFolderPaths().some(p => p.toLowerCase() === (res.item.path || '').toLowerCase())
        : !stateArray.active.some(f => f.id === res.item.id);
    if (stillMissing) {
        await new Promise(r => setTimeout(r, 1200));
        await syncData();
    }

    startSharedWithMePolling();
    hideLoadingOverlay();

    if (res.itemType === 'folder') {
        navigateToFolder(res.item.path || '');
        showToast("Ini adalah folder Anda sendiri — dialihkan ke Drive Anda.", false);
    } else {
        let displayName = res.item.name + (res.item.format ? '.' + res.item.format : '');
        // FIX: dulu file yang dituju dicari/disorot lewat SEARCH BOX
        // berdasarkan NAMA -- kalau ada beberapa file dengan nama sama di
        // folder itu, hasilnya ambigu (bisa nyorot file yang salah). Sekarang
        // dicocokkan lewat fileId-nya (unik per file), jadi yang di-highlight
        // dijamin persis file yang link-nya dibuka, apa pun namanya.
        // PATCH: sebelumnya di sini langsung previewFile() (buka modal
        // preview begitu saja) -- sekarang, seperti Google Drive, TIDAK
        // langsung dibuka: pengguna diarahkan ke tab Berkas, discroll
        // otomatis ke file itu, lalu diberi highlight tipis SEMENTARA saja
        // supaya jelas file mana yang dimaksud tanpa memaksa preview terbuka.
        const exactFile = stateArray.active.find(f => f.id === res.item.id);
        if (exactFile) goToFileAndHighlight(exactFile.id);
        else navigateToFolder((res.item.folder && res.item.folder !== "#*null*#") ? res.item.folder : '');
        showToast(`Ini adalah berkas Anda sendiri ("${displayName}") — dialihkan ke Drive Anda.`, false);
    }
}

// Item ternyata masih ada di Sampah pemiliknya sendiri -- langsung buka tab
// Sampah dan cari itemnya di sana (bukan cuma dikasih 404).
async function redirectOwnerToTrash(ownerAccount, res) {
    stopSharedPolling();
    pendingShareCode = null;
    pendingShareResolved = null;

    // FIX: paksa aktifkan akun pemilik lagi di sini juga (jaga-jaga, sama
    // seperti di redirectOwnerToDrive) -- supaya currentOwnerId dijamin benar
    // sebelum syncData() mengambil datanya.
    setActiveAccount(ownerAccount);

    document.getElementById('shared-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-layout').style.display = 'flex';
    // FIX (konsisten dengan redirectOwnerToDrive): pastikan drawer sidebar
    // mobile & backdrop-nya tidak ketinggalan dalam kondisi "terbuka" di sini juga.
    document.getElementById('app-sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');

    window.history.replaceState({}, document.title, location.origin + location.pathname);

    showLoadingOverlay("Membuka Sampah Anda...", false, false);
    await syncData();

    // FIX: sama seperti di redirectOwnerToDrive -- kalau item belum muncul
    // (kemungkinan cache gviz belum ter-update), sync ulang sekali sebelum
    // menampilkan tab Sampah.
    if (res.item && res.item.id && !stateArray.trash.some(f => f.id === res.item.id)) {
        await new Promise(r => setTimeout(r, 1200));
        await syncData();
    }

    startSharedWithMePolling();
    hideLoadingOverlay();

    currentTab = 'trash';
    document.getElementById('search-input').value = '';
    let displayName = '';
    if (res.item && res.item.name) {
        displayName = res.item.name + (res.item.format && res.item.format !== 'sys_folder' ? '.' + res.item.format : '');
        // PATCH: dulu disorot lewat filter NAMA di search box (ambigu kalau
        // ada beberapa item bernama sama). Sekarang pakai id unik yang sama
        // seperti mekanisme highlight di tab Berkas.
        if (res.item.id) pendingHighlightFileId = res.item.id;
    }
    renderUI();
    showToast(displayName ? `Item ini ("${displayName}") ada di Sampah Anda.` : "Item ini ada di Sampah Anda.", false);
}

// Item sudah dihapus permanen (tidak ada di aktif maupun Sampah) -- kasih
// tahu pemiliknya lewat error toast, tetap dialihkan ke Drive-nya sendiri.
async function redirectOwnerToDeletedError(ownerAccount, res) {
    stopSharedPolling();
    pendingShareCode = null;
    pendingShareResolved = null;

    // Akun aktif sudah beneran dipindah ke akun pemilik oleh
    // authenticateToOwnerAccount() sebelum fungsi ini dipanggil.
    document.getElementById('shared-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-layout').style.display = 'flex';
    // FIX (konsisten dengan redirectOwnerToDrive): pastikan drawer sidebar
    // mobile & backdrop-nya tidak ketinggalan dalam kondisi "terbuka" di sini juga.
    document.getElementById('app-sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');

    window.history.replaceState({}, document.title, location.origin + location.pathname);

    showLoadingOverlay("Membuka Drive Anda...", false, false);
    await syncData();
    startSharedWithMePolling();
    hideLoadingOverlay();

    navigateToFolder('');
    showToast(res.itemType === 'folder' ? "Folder ini sudah dihapus permanen." : "Berkas ini sudah dihapus permanen.", true);
}

function updateSharedViewChrome() {
    const closeBtn = document.getElementById('shared-close-btn');
    if (closeBtn) closeBtn.style.display = sharedViewerUid ? 'flex' : 'none';
    if (!sharedViewerUid) maybeShowGuestLoginBadge(); else closeShareLoginPrompt(true);
}
function maybeShowGuestLoginBadge() {
    if (sharedLoginPromptDismissed) return;
    document.getElementById('share-login-text').innerText = 'Login untuk membuka Drive Anda sendiri';
    document.getElementById('share-login-prompt').style.display = 'flex';
}

// Tombol "+" upload di halaman share — hanya muncul kalau peran viewer saat ini
// adalah 'edit'. Dipanggil ulang tiap tick polling (1x/detik) supaya kalau
// pemilik mengubah peran viewer dari Lihat -> Edit (atau sebaliknya), tombolnya
// langsung muncul/hilang tanpa perlu refresh halaman.
function updateSharedUploadFab(role, shareId, viewerUid) {
    sharedUploadFabRole = role === 'edit' ? 'edit' : 'view';
    sharedUploadShareId = shareId;
    sharedUploadViewerUid = viewerUid;
    const fab = document.getElementById('shared-upload-fab');
    if (fab) fab.style.display = sharedUploadFabRole === 'edit' ? 'flex' : 'none';
}
function hideSharedUploadFab() {
    sharedUploadFabRole = 'view';
    const fab = document.getElementById('shared-upload-fab');
    if (fab) fab.style.display = 'none';
}

// FIX BUG "404 PALSU / DATA BASI SAAT RENAME": gviz (Google Sheets) punya cache
// internal di sisi Google yang bisa basi sampai puluhan detik SETELAH ada
// tulisan baru (rename folder, ubah privasi, dst). ADA 2 GEJALA berbeda dari
// staleness ini, dan dua-duanya ditangani di sini:
//  1) "Gagal palsu" -- gviz sesaat gak nemu baris share/foldernya (padahal
//     linknya valid) -> dulu langsung divonis 404 di tick itu juga.
//  2) "Sukses tapi basi" -- gviz TETAP berhasil balikin data, tapi datanya
//     masih snapshot LAMA (nama folder lama, dst) -- ini TIDAK pernah masuk
//     jalur error sama sekali, jadi sebelumnya gak ada yang mengoreksinya;
//     ditunggu berapa lama pun kalau gviz kebetulan tetap konsisten
//     menyajikan snapshot lama, datanya gak akan pernah berubah sendiri.
// Solusinya BUKAN "tunggu N kali gagal dulu baru boleh dipercaya" (itu cuma
// menunda gejala #1 dan sama sekali gak menyentuh gejala #2). Solusinya:
// begitu gviz kelihatan gagal, LANGSUNG konfirmasi SEKALI ke GAS (baca
// Spreadsheet live, bukan cache) -- bukan nunggu/coba-coba ulang berkali2.
// Dan supaya gejala #2 juga ketangkep, tiap beberapa detik dipaksa 1x baca
// live ke GAS juga WALAU tick sebelumnya "sukses" -- ini yang bikin rename
// beneran ke-refresh dalam hitungan detik, bukan nunggu cache gviz habis
// sendiri (yang kadang gak pernah habis-habis kalau nasib snapshotnya apes).
const SHARED_FORCE_LIVE_EVERY_TICKS = 4; // paksa baca live tiap ~4 detik, terlepas dari sukses/gagalnya gviz

// FIX BUG "404 SAAT FOLDER PERANTARA DI-RENAME": mekanisme forceLive di atas
// (lihat komentar di startSharedPolling) cuma menjamin ROOT folder yang
// dibagikan selalu diresolusi segar -- tapi sharedPathSegments (nama-nama
// folder di antara root dan folder yang lagi dibuka) tetap dipakai APA
// ADANYA. Kalau yang di-rename BUKAN root share itu sendiri, tapi salah
// satu folder PERANTARA di antaranya, nama lama itu bikin path hasil
// gabungan jadi tidak valid lagi walau isinya sendiri masih ada. Fungsi ini
// menelusuri dari root TURUN level demi level (bukan path absolut sekali
// jalan) supaya level mana pun yang masih valid tetap dipakai, dan baru
// berhenti persis di folder terakhir yang namanya benar-benar sudah
// berubah/hilang -- isinya tetap ditampilkan dengan benar (walau mungkin di
// level yang sedikit lebih tinggi dari posisi semula), bukan 404 mati.
async function tryResolveWithAncestorFallback(code, viewerUid, segments) {
    const rootRes = await getSharedDataFromSheets(code, viewerUid, null, true);
    if (!rootRes || !rootRes.success || !rootRes.authorized || !rootRes.item) return null;
    let lastGood = { res: rootRes, path: rootRes.item.path, segments: [] };
    let builtPath = rootRes.item.path;
    for (let i = 0; i < segments.length; i++) {
        const candidatePath = builtPath + '/' + segments[i];
        const candidateRes = await getSharedDataFromSheets(code, viewerUid, candidatePath, true);
        if (candidateRes && candidateRes.success && candidateRes.authorized) {
            lastGood = { res: candidateRes, path: candidatePath, segments: segments.slice(0, i + 1) };
            builtPath = candidatePath;
        } else break;
    }
    return lastGood;
}

function startSharedPolling(code) {
    stopSharedPolling();
    sharedDataSignature = null;
    sharedHasRenderedOnce = false;
    let tickCount = 0;
    
    sharedPollTimer = setInterval(async () => {
        if (pendingShareCode !== code || document.getElementById('shared-view').style.display === 'none') { stopSharedPolling(); return; }

        // FIX BUG "PROSES UPLOAD DIBATALKAN TERUS": polling realtime ini jalan
        // tiap 1 detik dan sebelumnya BISA memutus proses upload yang sedang
        // berjalan di folder yang sama -- setiap kali hasil resolve_share
        // "kelihatan" gagal/tidak authorized (termasuk cuma karena hiccup
        // sesaat pembacaan gviz saat trafik upload lagi tinggi), tick ini
        // langsung stopSharedPolling() + abort(globalAbortController) +
        // renderShare404()/renderSharedAuthWall(), padahal itemnya baik-baik
        // saja. Sekarang selama upload ke folder share ini masih berjalan,
        // tick realtime dilewati dulu (bukan dimatikan -- cuma ditunda),
        // supaya proses upload tidak pernah diinterupsi di tengah jalan.
        if (isUploadInProgress && sharedUploadActive) return;

        tickCount++;
        // Setiap beberapa tick, paksa lewati gviz sama sekali dan baca
        // langsung dari GAS -- ini yang menangkap kasus "sukses tapi basi"
        // (gejala #2 di atas) yang gak pernah ketahuan dari sisi gagal/sukses.
        const forceLive = (tickCount % SHARED_FORCE_LIVE_EVERY_TICKS === 0);

        // FIX BUG "STUCK SAAT RENAME/PRIVASI DIUBAH SAAT SEDANG DIBUKA": sama
        // seperti di navigateSharedTo() -- sharedCurrentPath (path absolut)
        // basi begitu root/leluhurnya di-rename dari perangkat lain, dan query
        // dengan path basi itu balas "berhasil tapi kosong", bukan error, jadi
        // gak pernah tertangkap sebagai kegagalan. Di tick forceLive, root
        // diresolusi ulang segar dulu (subPath=null -> selalu baca sh.itemId
        // yang live) lalu digabung dengan sharedPathSegments (nama relatif)
        // untuk mendapatkan path query yang BENAR-BENAR terkini. Tick biasa
        // (bukan forceLive) tetap pakai path yang sudah diketahui supaya tidak
        // menggandakan request tiap detik -- staleness-nya sendiri terkoreksi
        // di tick forceLive berikutnya (maksimal ~4 detik).
        let queryPath = sharedCurrentPath;
        if (forceLive) {
            const rootRes = await getSharedDataFromSheets(code, sharedViewerUid, null, true);
            if (rootRes && rootRes.success && rootRes.authorized && rootRes.item) {
                queryPath = sharedPathSegments.length ? (rootRes.item.path + '/' + sharedPathSegments.join('/')) : rootRes.item.path;
            }
        }

        let res = await getSharedDataFromSheets(code, sharedViewerUid, queryPath, forceLive);

        // FIX: cache gviz (Google Sheets published-web query) kadang lebih
        // lambat mengikuti perubahan (rename/hapus/upload) dibanding baca
        // langsung ke GAS -- akibatnya folder yang BARU di-rename bisa
        // sesaat terlihat "Tidak ada berkas di sini" (baris filenya masih
        // memuat snapshot path LAMA di cache gviz), padahal isinya
        // sebenarnya ada. Kalau hasil non-forceLive kelihatan KOSONG,
        // JANGAN langsung percaya path yang dipakai barusan (queryPath) --
        // itu juga bisa saja path LAMA yang belum sempat ter-update kalau
        // root/folder perantaranya baru saja di-rename. Hitung ulang dulu
        // path yang BENAR-benar terkini dari root (sama seperti tick
        // forceLive), baru konfirmasi ke sumber live (GAS, tanpa cache)
        // pakai path segar itu -- supaya tidak "kedip kosong lalu balik".
        const emptyLooking = res && res.success && res.authorized && res.itemType === 'folder' && res.item && res.item.contents &&
            res.item.contents.subfolders.length === 0 && res.item.contents.files.length === 0;
        if (!forceLive && emptyLooking) {
            const freshRootRes = await getSharedDataFromSheets(code, sharedViewerUid, null, true);
            const freshPath = (freshRootRes && freshRootRes.success && freshRootRes.authorized && freshRootRes.item)
                ? (sharedPathSegments.length ? (freshRootRes.item.path + '/' + sharedPathSegments.join('/')) : freshRootRes.item.path)
                : queryPath;
            const liveConfirm = await getSharedDataFromSheets(code, sharedViewerUid, freshPath, true);
            if (liveConfirm && liveConfirm.success) { res = liveConfirm; queryPath = freshPath; }
        }
        
        // Kalau gviz (bukan forceLive) kelihatan gagal/dihapus/tidak authorized,
        // JANGAN langsung divonis -- konfirmasi SEKALI SAJA ke sumber live (GAS)
        // sebelum dipercaya. Bukan retry berkali-kali/nunggu beberapa detik --
        // cukup 1x cek ke sumber yang gak ada cache-nya sama sekali, hasilnya
        // langsung final (dipakai apa adanya, sukses maupun gagal).
        if (!forceLive && (!res || !res.success || res.deleted || !res.authorized)) {
            res = await getSharedDataFromSheets(code, sharedViewerUid, sharedCurrentPath, true);
        }

        // Sebelum divonis 404/tidak authorized, kalau kita SEDANG browsing
        // lebih dalam dari root share (bukan pas root-nya sendiri), coba
        // dulu telusuri dari root turun level demi level -- ini menangkap
        // kasus folder PERANTARA (bukan root) yang di-rename, supaya isinya
        // tetap ditampilkan (bukan 404), lihat catatan di
        // tryResolveWithAncestorFallback().
        if ((!res || !res.success || res.deleted || !res.authorized) && sharedPathSegments.length > 0) {
            const fallback = await tryResolveWithAncestorFallback(code, sharedViewerUid, sharedPathSegments);
            if (fallback) {
                res = fallback.res;
                queryPath = fallback.path;
                if (fallback.segments.length !== sharedPathSegments.length) {
                    sharedPathSegments = fallback.segments;
                    showToast("Salah satu folder di jalur ini sudah diganti nama/dipindah pemiliknya — ditampilkan dari folder terdekat yang masih ada.", true);
                }
            }
        }

        // JIKA FILE DIHAPUS / PINDAH KE SAMPAH (sudah dikonfirmasi live, final)
        if (!res || !res.success || res.deleted) { 
            stopSharedPolling(); 
            closePreviewModal(); 
            hideSharedUploadFab();
            
            // --- KUNCI PEMBATALAN DOWNLOAD OTOMATIS ---
            sharedDownloadCancelled = true;
            if (globalAbortController) { 
                globalAbortController.abort(); // Hentikan paksa proses download/zip!
                globalAbortController = null; 
            }
            hideLoadingOverlay();
            // ------------------------------------------
            
            renderShare404(); 
            return; 
        }
        
        // JIKA HAK AKSES DICABUT / DIBATASI (sudah dikonfirmasi live, final --
        // berlaku untuk SEMUA jenis privasi, bukan cuma 'restricted').
        if (!res.authorized) { 
            stopSharedPolling(); 
            closePreviewModal(); 
            hideSharedUploadFab();
            
            // --- KUNCI PEMBATALAN DOWNLOAD OTOMATIS ---
            sharedDownloadCancelled = true;
            if (globalAbortController) { 
                globalAbortController.abort(); // Hentikan paksa proses download/zip!
                globalAbortController = null; 
            }
            hideLoadingOverlay();
            // ------------------------------------------

            // FIX: kalau pengguna SEDANG mengupload lewat halaman share ini
            // dan pemilik mendadak mengganti privasinya (dicabut/dibatasi),
            // upload yang sedang berjalan harus langsung terbatal juga --
            // dulu upload ini pakai jalur XHR/antrean sendiri (bukan
            // globalAbortController di atas) jadi tetap lanjut walau
            // akses sudah dicabut.
            if (sharedUploadActive && isUploadInProgress) {
                closeUploadModal();
                showToast("Upload dibatalkan: akses ke folder ini baru saja dicabut/diubah pemiliknya.", true);
            }
            
            renderSharedAuthWall(res); 
            return; 
        }

        // FIX: sama seperti di atas, tapi untuk kasus akses masih authorized
        // namun perannya TURUN dari 'edit' ke 'view' (mis. pemilik mengganti
        // linkRole atau menurunkan peran orang yang diberi akses manual) --
        // upload yang sedang berjalan harus ikut terbatal juga, bukan
        // dibiarkan lanjut sampai selesai.
        if (sharedUploadActive && isUploadInProgress && res.role !== 'edit') {
            closeUploadModal();
            showToast("Upload dibatalkan: akses Edit Anda di folder ini baru saja dicabut pemiliknya.", true);
        }

        pendingShareResolved = Object.assign({}, pendingShareResolved, res);

        // Update peran (view/edit) tiap detik walau isi folder tidak berubah,
        // supaya tombol "+" realtime mengikuti perubahan yang di-set pemilik.
        if (res.itemType === 'folder') updateSharedUploadFab(res.role, code, sharedViewerUid);
        else hideSharedUploadFab();

        const currentSig = JSON.stringify({ item: res.item });
        if (sharedDataSignature !== currentSig) {
            sharedDataSignature = currentSig;
            if (!sharedIsSelecting && res.itemType === 'folder') {
                sharedIsRealtimeRefresh = sharedHasRenderedOnce;
                sharedHasRenderedOnce = true;
                await renderSharedFolderBody(res, code, sharedViewerUid, queryPath);
                // FIX REALTIME: kalau ada modal preview file yang lagi
                // terbuka sambil browsing folder share ini, judulnya dulu
                // TIDAK pernah ikut disinkronkan waktu pemilik rename/hapus
                // file itu dari perangkat lain. Disamakan di sini juga.
                refreshOpenSharedPreviewMetaIfNeeded();
            } else if (res.itemType === 'file') {
                // FIX REALTIME: dulu perubahan pada file (mis. nama diganti
                // pemilik) tidak pernah ke-refresh sama sekali di sini --
                // signature-nya sempat dihitung ulang tapi tidak pernah
                // dipakai untuk apa pun kalau itemType 'file'. Sekarang judul
                // & ukurannya diperbarui langsung TANPA mengulang proses
                // unduh/pratinjau berkas (supaya tidak boros kuota & tidak
                // memutus pratinjau yang sedang berjalan).
                updateSharedFileMetaDisplay(res.item);
            }
        }
    }, 1000);
}

// Perbarui judul & info ukuran di halaman file yang dibagikan secara
// realtime (dipanggil dari tick polling), tanpa mengulang fetch/pratinjau
// isi berkasnya -- cuma teksnya saja yang disinkronkan.
function updateSharedFileMetaDisplay(item) {
    const body = document.getElementById('shared-body');
    if (!body || !body.querySelector('#shared-preview-container')) return; // bukan sedang di tampilan file
    let displayName = item.name + (item.format ? '.' + item.format : '');
    const titleEl = body.querySelector('h2');
    const sizeEl = body.querySelector('p');
    if (titleEl) { titleEl.innerText = displayName; titleEl.title = displayName; }
    if (sizeEl) sizeEl.innerText = formatBytes(item.size);
    const downloadBtn = body.querySelector('button.btn-primary');
    if (downloadBtn) downloadBtn.setAttribute('onclick', `downloadSharedFile('${item.id}','${item.format || ''}','${displayName.replace(/'/g, "\\'")}','${pendingShareCode}','${sharedViewerUid}')`);
}

// Sinkronkan judul modal preview file yang lagi terbuka SAAT browsing folder
// yang dibagikan (bukan halaman single-file-share) -- tanpa mengulang proses
// download/pratinjau isi berkasnya. Kalau file itu ternyata sudah tidak ada
// lagi di folder ini (dihapus/dipindah pemiliknya), modal ditutup + toast.
function refreshOpenSharedPreviewMetaIfNeeded() {
    const modal = document.getElementById('preview-modal');
    if (!modal || modal.style.display === 'none') return;
    if (currentSharedPreviewIndex < 0 || !sharedPreviewQueue[currentSharedPreviewIndex]) return;
    const openedId = sharedPreviewQueue[currentSharedPreviewIndex].id;
    const fresh = (sharedContentsCache.files || []).find(f => f.id === openedId);
    if (!fresh) {
        closePreviewModal();
        showToast("Berkas yang sedang dibuka sudah tidak ada lagi di sini.", true);
        return;
    }
    sharedPreviewQueue = sharedContentsCache.files || [];
    currentSharedPreviewIndex = sharedPreviewQueue.findIndex(f => f.id === fresh.id);
    let displayName = fresh.name;
    const ext = (fresh.format || '').toLowerCase();
    if (ext && !displayName.toLowerCase().endsWith('.' + ext)) displayName += '.' + ext;
    const titleEl = document.getElementById('preview-filename');
    if (titleEl && titleEl.innerText !== displayName) { titleEl.innerText = displayName; titleEl.title = displayName; }
}

function stopSharedPolling() { if (sharedPollTimer) { clearInterval(sharedPollTimer); sharedPollTimer = null; } }

function renderShare404() {
    document.getElementById('shared-owner-banner').style.display = 'none';
    document.getElementById('shared-breadcrumb').style.display = 'none';
    hideSharedUploadFab();
    document.getElementById('shared-body').innerHTML = `
        <div class="shared-404">
            <span class="material-symbols-rounded">link_off</span>
            <h2 style="font-size:22px; font-weight:800; color:var(--text-primary);">404 — Tidak Ditemukan</h2>
            <p style="color:var(--text-muted); font-size:13.5px; max-width:340px;">Link berbagi ini tidak valid, akses Anda sudah dicabut, atau berkas/foldernya sudah dihapus oleh pemiliknya.</p>
        </div>`;
}

function renderSharedAuthWall(res) {
    document.getElementById('shared-breadcrumb').style.display = 'none';
    hideSharedUploadFab();
    document.getElementById('shared-body').innerHTML = `
        <div class="shared-auth-wall">
            <span class="material-symbols-rounded">lock_person</span>
            <h2 style="font-size:20px; font-weight:800; color:var(--text-primary);">Akses Terbatas</h2>
            <p style="color:var(--text-muted); font-size:13.5px; max-width:340px;">${res.ownerName} hanya memberikan akses ke akun tertentu untuk item ini. Login dengan akun yang diberi akses untuk membukanya.</p>
        </div>`;
    document.getElementById('share-login-text').innerText = 'Login untuk membuka item ini';
    document.getElementById('share-login-prompt').style.display = 'flex';
}

function showShareLoginPrompt() {
    document.getElementById('share-login-text').innerText = 'Login untuk membuka item ini';
    document.getElementById('share-login-prompt').style.display = 'flex';
}
function closeShareLoginPrompt(silent) {
    document.getElementById('share-login-prompt').style.display = 'none';
    if (!silent) sharedLoginPromptDismissed = true;
}
function openLoginFromSharePrompt() { showLoginView(true); }

function renderSharedBreadcrumb(res, subPath) {
    const el = document.getElementById('shared-breadcrumb');
    if (res.itemType === 'file' && !res.item.folder) {
        el.style.display = 'flex';
        el.innerHTML = `<span>${res.ownerName || 'Beranda'}</span><span>&gt;</span><span>membagikan file</span>`;
        return;
    }
    el.style.display = 'flex';
    let html = `<span class="shared-owner-label" title="Dibagikan oleh ${escapeHtml(res.ownerName || 'Pengguna')}" style="cursor:default;color:var(--text-muted)">Dibagikan oleh ${escapeHtml(res.ownerName || 'Pengguna')}</span>`;
    const curParts = (subPath || '').split('/').filter(Boolean);
    // Segmen milik ROOT yang dibagikan sendiri (bisa lebih dari 1 kalau root-nya
    // folder bertingkat) ada di awal curParts; sisanya adalah sharedPathSegments
    // (hasil navigasi viewer sendiri di bawah root). Cuma segmen root PALING
    // AKHIR dan segmen-segmen di bawahnya yang boleh diklik (lompat lewat
    // jumpSharedBreadcrumb, berbasis nama relatif -- lihat catatan di
    // sharedPathSegments) -- segmen INTERNAL nama root sendiri tidak boleh
    // diklik karena viewer tidak boleh "naik" ke luar cakupan share.
    const rootPartsCount = Math.max(curParts.length - sharedPathSegments.length, 0);
    curParts.forEach((seg, idx) => {
        const isLast = idx === curParts.length - 1;
        if (isLast) { html += ` <span>/</span> <span>${seg}</span>`; return; }
        if (idx >= rootPartsCount - 1) {
            const relDepth = idx - rootPartsCount; // -1 = balik ke root
            html += ` <span>/</span> <span class="crumb-link" onclick="jumpSharedBreadcrumb(${relDepth})">${seg}</span>`;
        } else {
            html += ` <span>/</span> <span style="cursor:default;">${seg}</span>`;
        }
    });
    el.innerHTML = html;
}

// Masuk satu level ke subfolder yang sedang ditampilkan (dipanggil dari kartu
// folder). Disimpan sebagai NAMA relatif saja -- lihat catatan sharedPathSegments.
function enterSharedSubfolder(segmentName) {
    sharedPathSegments.push(segmentName);
    navigateSharedTo();
}
// Lompat ke level tertentu lewat breadcrumb. depthIndex -1 = kembali ke root.
function jumpSharedBreadcrumb(depthIndex) {
    sharedPathSegments = depthIndex < 0 ? [] : sharedPathSegments.slice(0, depthIndex + 1);
    navigateSharedTo();
}

// FIX BUG "STUCK SAAT RENAME/PRIVASI DIUBAH SAAT SEDANG DIBUKA": dulu fungsi
// ini menerima & mengirim PATH ABSOLUT yang di-cache di klien (sharedCurrentPath)
// langsung ke server sebagai subPath. Begitu pemilik me-rename folder root yang
// sedang dibagikan (atau leluhurnya) dari perangkat lain, path absolut lama itu
// tidak pernah cocok lagi dengan data terbaru -- server tetap balas "berhasil"
// (bukan error!) tapi isi foldernya KOSONG karena tidak ada satu pun baris yang
// diawali path basi itu. Klien tidak pernah tahu ada yang salah, jadi halaman
// share kelihatan "stuck" (kosong selamanya) walau linknya sendiri valid.
// Sekarang: root SELALU diresolusi ulang segar (subPath=null -> server baca
// langsung dari sh.itemId, yang dijamin ikut ter-update tiap kali rename_folder_dir
// jalan -- lihat backend.gs), lalu digabung dengan sharedPathSegments (nama
// relatif, bukan path absolut) untuk membentuk path query yang sebenarnya.
async function navigateSharedTo(forceLive) {
    showLoadingOverlay("Membuka folder...", false, false);
    let rootRes = await getSharedDataFromSheets(pendingShareCode, sharedViewerUid, null, !!forceLive);
    if (!rootRes || !rootRes.success || !rootRes.authorized) {
        rootRes = await getSharedDataFromSheets(pendingShareCode, sharedViewerUid, null, true);
    }
    if (!rootRes || !rootRes.success || !rootRes.item) {
        hideLoadingOverlay();
        if (rootRes && !rootRes.authorized) { renderSharedAuthWall(rootRes); return; }
        renderShare404();
        return;
    }
    if (!rootRes.authorized) { hideLoadingOverlay(); renderSharedAuthWall(rootRes); return; }

    const freshRootPath = rootRes.item.path;
    const targetPath = sharedPathSegments.length ? (freshRootPath + '/' + sharedPathSegments.join('/')) : freshRootPath;

    let r = (targetPath === freshRootPath) ? rootRes : await getSharedDataFromSheets(pendingShareCode, sharedViewerUid, targetPath);
    if (targetPath !== freshRootPath && (!r || !r.success || !r.authorized)) {
        r = await getSharedDataFromSheets(pendingShareCode, sharedViewerUid, targetPath, true);
    }
    hideLoadingOverlay();
    if (r && r.success && r.authorized) {
        renderSharedFolderBody({ ownerId: pendingShareResolved.ownerId, ownerName: pendingShareResolved.ownerName, itemType: 'folder', item: r.item, role: r.role }, pendingShareCode, sharedViewerUid, targetPath);
        resetSharedViewScroll();
    } else if (r && r.deleted && targetPath !== freshRootPath) {
        // Bukan root-nya yang hilang, tapi subfolder tempat viewer lagi berada
        // (dihapus/dipindah pemiliknya) -- mundur ke root, bukan macet di kosong.
        sharedPathSegments = [];
        showToast("Folder ini sudah tidak ada lagi, kembali ke folder utama.", true);
        navigateSharedTo(true);
    } else {
        renderShare404();
    }
}

// Ambil chunks (Telegram file id) sebuah berkas yang dibagikan langsung dari
// spreadsheet (gviz) terlebih dahulu -> tidak memakai kuota backend GAS sama
// sekali untuk pratinjau/unduh di halaman share. GAS hanya dipakai sebagai
// fallback kalau gviz gagal/belum ter-update.
async function getSharedFileChunks(fileId, ownerId, shareId, viewerUid) {
    // Shared previews/downloads MUST be authorized server-side. Do not read
    // chunks directly from the public spreadsheet because that bypasses share ACLs.
    return await callGasAPIFetch('get_chunks', { fileId: fileId, shareId: shareId, viewerUid: viewerUid });
}

async function renderSharedFileBody(res, shareId, viewerUid) {
    hideSharedUploadFab();
    // FIX: peran (view/edit) share tipe FILE tunggal dicatat di sini supaya
    // tombol "Ganti Nama" cuma tampil kalau viewer memang diberi akses edit.
    sharedFileShareRole = res.role === 'edit' ? 'edit' : 'view';
    const item = res.item;
    let displayName = item.name + (item.format ? '.' + item.format : '');
    renderSharedBreadcrumb(res, '');
    const body = document.getElementById('shared-body');
    const safeDisplayName = displayName.replace(/'/g, "\\'");
    const renameBtnHTML = sharedFileShareRole === 'edit'
        ? `<button class="icon-btn" style="margin-top:16px;" onclick="sharedRenameStandaloneFile('${item.id}','${escapeHtml(item.name).replace(/'/g, "\\'")}','${shareId}','${viewerUid}')" title="Ganti Nama"><span class="material-symbols-rounded">edit</span></button>`
        : '';
    body.innerHTML = `
        <div style="max-width:700px; margin:0 auto; background:#fff; border-radius:var(--radius-lg); padding:24px; box-shadow:var(--shadow-card);">
            <h2 style="font-size:18px; font-weight:800; margin-bottom:4px; word-break:break-all;">${displayName}</h2>
            <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:18px;">${formatBytes(item.size)}</p>
            <div id="shared-preview-container" style="min-height:280px; background:#0f172a; border-radius:var(--radius-md); display:flex; align-items:center; justify-content:center; overflow:auto;"></div>
            <div style="display:flex; align-items:center; gap:10px;">
                <button class="btn-primary" style="margin-top:16px;" onclick="downloadSharedFile('${item.id}','${item.format || ''}','${safeDisplayName}','${shareId}','${viewerUid}')"><span class="material-symbols-rounded">download</span> Unduh Berkas</button>
                ${renameBtnHTML}
            </div>
        </div>`;

    const container = document.getElementById('shared-preview-container');
    container.innerHTML = `<div style="text-align:center; padding:30px;"><div class="spinner" style="border-color: rgba(255,255,255,0.2); border-top-color: var(--accent);"></div><p style="color:#fff; margin-top:10px; font-size:13px;">Memuat pratinjau...</p></div>`;
    try {
        const chunkRes = await getSharedFileChunks(item.id, res.ownerId, shareId, viewerUid);
        if (!chunkRes.success) throw new Error(chunkRes.message || 'Gagal memuat berkas.');
        let chunks = chunkRes.data; if (typeof chunks === 'string') chunks = JSON.parse(chunks);
        chunks.sort((a, b) => a.part - b.part);
        const parts = await reconstructFileParts(chunks, null, null);
        const blob = new Blob(parts, { type: mimeFromExt(item.format) });
        const url = URL.createObjectURL(blob);
        renderPreviewContent(url, item.format, container, blob);
    } catch (e) { container.innerHTML = `<div style="color:#fff; text-align:center; padding:20px; font-size:13px;">Gagal memuat pratinjau: ${e.message}</div>`; }
}

// FIX: rename untuk share tipe FILE tunggal (bukan folder) -- hanya
// tersedia kalau linknya diberi peran Edit (lihat renderSharedFileBody).
// Validasi cakupan & peran tetap dilakukan di server (action
// 'shared_rename_file'), ini cuma UI-nya.
async function sharedRenameStandaloneFile(fileId, currentName, shareId, viewerUid) {
    const newName = prompt("Nama baru untuk berkas ini:", currentName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return showToast("Nama tidak boleh kosong.", true);
    if (trimmed.length > 300) return showToast("Nama terlalu panjang (maksimal 300 karakter).", true);
    if (/[<>]/.test(trimmed)) return showToast("Nama tidak boleh mengandung karakter < atau >.", true);
    showLoadingOverlay("Menyimpan nama baru...", false, false);
    const res = await callGasAPI('shared_rename_file', { fileId: fileId, newName: trimmed, shareId: shareId, viewerUid: viewerUid });
    hideLoadingOverlay();
    if (res && res.success) {
        showToast("Nama berhasil diubah.", false);
        const titleEl = document.querySelector('#shared-body h2');
        if (titleEl) {
            const dotIdx = titleEl.innerText.lastIndexOf('.');
            const ext = dotIdx !== -1 ? titleEl.innerText.substring(dotIdx) : '';
            titleEl.innerText = trimmed + ext;
        }
        if (pendingShareResolved && pendingShareResolved.item) pendingShareResolved.item.name = trimmed;
    } else {
        showToast((res && res.message) || "Gagal mengubah nama.", true);
    }
}

async function downloadSharedFile(fileId, format, displayName, shareId, viewerUid, silentOverlay) {
    if (!silentOverlay) { showLoadingOverlay("Menyiapkan unduhan...", true, true); globalAbortController = new AbortController(); }
    try {
        const ownerIdForChunks = (pendingShareResolved && pendingShareResolved.ownerId) || (sharedRootItem && sharedRootItem.ownerId);
        const chunkRes = await getSharedFileChunks(fileId, ownerIdForChunks, shareId, viewerUid);
        if (!chunkRes.success) throw new Error(chunkRes.message || 'Gagal memuat berkas.');
        let chunks = chunkRes.data; if (typeof chunks === 'string') chunks = JSON.parse(chunks);
        chunks.sort((a, b) => a.part - b.part);
        const parts = await reconstructFileParts(chunks, (overall) => updateLoadingOverlay(overall, `Mengunduh... ${overall}%`), globalAbortController ? globalAbortController.signal : null);
        const blob = new Blob(parts, { type: mimeFromExt(format) });
        const url = URL.createObjectURL(blob);
        if (!silentOverlay) hideLoadingOverlay();
        const a = document.createElement('a'); a.href = url; a.download = displayName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return true;
    } catch (e) { if (!silentOverlay) { hideLoadingOverlay(); showToast("Gagal mengunduh: " + e.message, true); } return false; }
}

// PATCH: dulu kalau yang dipilih banyak (file dan/atau folder), tiap folder
// diunduh sebagai ZIP-nya SENDIRI-SENDIRI (banyak file ZIP terpisah muncul
// sekaligus). Sekarang: 1 item saja (file atau folder) tetap seperti biasa
// lewat jalur langsung yang sudah ada; begitu terpilih LEBIH DARI 1 item,
// semuanya digabung jadi SATU ZIP saja, isi tiap folder mengikuti struktur
// path aslinya (di dalam sub-folder bernama folder itu sendiri), sama
// seperti versi drive sendiri.
async function downloadSharedSelectedBulk() {
    const fileIds = Array.from(sharedSelectedIds);
    const folderPaths = Array.from(sharedSelectedFolderPaths);
    const total = fileIds.length + folderPaths.length;
    if (total === 0) return;

    if (total === 1 && fileIds.length === 1) {
        const item = (sharedContentsCache.files || []).find(f => f.id === fileIds[0]);
        if (item) {
            const displayName = item.name + (item.format ? '.' + item.format : '');
            await downloadSharedFile(item.id, item.format, displayName, pendingShareCode, sharedViewerUid);
        }
        return;
    }
    if (total === 1 && folderPaths.length === 1) {
        await buildAndDownloadSharedZip(folderPaths[0], folderPaths[0].split('/').pop());
        return;
    }

    if (!window.JSZip) { showToast("Gagal memuat pustaka ZIP. Periksa koneksi internet Anda.", true); return; }
    sharedDownloadCancelled = false;
    globalAbortController = new AbortController();
    showLoadingOverlay(`Menyiapkan daftar isi (0/${total})...`, true, true);

    try {
        // Kumpulkan seluruh entri yang perlu masuk ZIP: file tunggal langsung
        // di root ZIP, isi tiap folder terpilih mengikuti path asli di dalam
        // sub-folder bernama folder itu sendiri.
        const zipEntries = [];
        for (const id of fileIds) {
            const item = (sharedContentsCache.files || []).find(f => f.id === id);
            if (!item) continue;
            zipEntries.push({ id: item.id, relPath: item.name + (item.format ? '.' + item.format : '') });
        }
        for (const path of folderPaths) {
            if (sharedDownloadCancelled || globalAbortController.signal.aborted) throw new Error("Dibatalkan oleh pengguna");
            const folderName = path.split('/').pop();
            const nested = await collectSharedFolderFilesRecursive(path, folderName);
            zipEntries.push(...nested);
        }

        if (zipEntries.length === 0) { hideLoadingOverlay(); showToast("Tidak ada berkas untuk diunduh (folder yang dipilih kosong).", true); return; }

        const zip = new JSZip();
        const ownerIdForChunks = pendingShareResolved && pendingShareResolved.ownerId;
        let n = 0, failed = 0;
        for (const entry of zipEntries) {
            if (sharedDownloadCancelled || globalAbortController.signal.aborted) throw new Error("Dibatalkan oleh pengguna");
            n++;
            updateLoadingOverlay(Math.round(n / zipEntries.length * 90), `Mengunduh (${n}/${zipEntries.length})...`);
            const chunkRes = await getSharedFileChunks(entry.id, ownerIdForChunks, pendingShareCode, sharedViewerUid);
            if (!chunkRes || !chunkRes.success) { failed++; continue; }
            let chunks = chunkRes.data; if (typeof chunks === 'string') { try { chunks = JSON.parse(chunks); } catch (e) {} }
            chunks.sort((a, b) => a.part - b.part);
            const parts = await reconstructFileParts(chunks, null, null);
            zip.file(entry.relPath, new Blob(parts));
        }
        updateLoadingOverlay(95, "Membungkus ZIP...");
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const url = URL.createObjectURL(zipBlob);
        hideLoadingOverlay();
        const a = document.createElement('a'); a.href = url; a.download = buildTimestampedZipName();
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 20000);
        if (failed > 0) showToast(`ZIP dibuat, tapi ${failed} berkas gagal diunduh.`, true);
        else showToast("ZIP berhasil diunduh.", false);
    } catch (e) {
        hideLoadingOverlay();
        if (e.message !== "Dibatalkan oleh pengguna") showToast("Gagal membuat ZIP: " + (e.message || 'kesalahan'), true);
        else showToast("Unduhan dibatalkan.", true);
    }
}

async function buildAndDownloadSharedZip(folderPath, folderName, silentOverlay) {
    if (!window.JSZip) { showToast("Gagal memuat pustaka ZIP. Periksa koneksi internet Anda.", true); return false; }
    try {
        if (!silentOverlay) { showLoadingOverlay(`Menyusun daftar isi folder "${folderName}"...`, true, true); globalAbortController = new AbortController(); }
        const fileList = await collectSharedFolderFilesRecursive(folderPath, '');
        if (fileList.length === 0) {
            if (!silentOverlay) { hideLoadingOverlay(); showToast(`Folder "${folderName}" kosong, tidak ada yang diunduh.`, true); }
            return false;
        }
        const zip = new JSZip();
        let n = 0;
        for (const f of fileList) {
            if (sharedDownloadCancelled || (globalAbortController && globalAbortController.signal.aborted)) throw new Error("Dibatalkan oleh pengguna");
            n++;
            updateLoadingOverlay(Math.round(n / fileList.length * 90), `Mengunduh isi "${folderName}" (${n}/${fileList.length}) ${f.name}...`);
            const ownerIdForChunks = pendingShareResolved && pendingShareResolved.ownerId;
            const chunkRes = await getSharedFileChunks(f.id, ownerIdForChunks, pendingShareCode, sharedViewerUid);
            if (!chunkRes || !chunkRes.success) continue;
            let chunks = chunkRes.data; if (typeof chunks === 'string') chunks = JSON.parse(chunks);
            chunks.sort((a, b) => a.part - b.part);
            const parts = await reconstructFileParts(chunks, null, null);
            zip.file(f.relPath, new Blob(parts));
        }
        updateLoadingOverlay(95, `Membungkus ZIP "${folderName}"...`);
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const url = URL.createObjectURL(zipBlob);
        if (!silentOverlay) hideLoadingOverlay();
        const a = document.createElement('a'); a.href = url; a.download = folderName + '.zip'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 20000);
        return true;
    } catch (e) {
        if (!silentOverlay) { hideLoadingOverlay(); if (e.message !== "Dibatalkan oleh pengguna") showToast("Gagal membuat ZIP: " + (e.message || 'kesalahan'), true); }
        return false;
    }
}

async function collectSharedFolderFilesRecursive(folderPath, relPrefix, rawData = null) {
    let results = [];
    let raw = rawData;
    if (!raw) raw = await fetchRawSheets();
    
    const ownerId = pendingShareResolved.ownerId;
    
    const checkOverrideAccess = (targetId, tType, oId, vUid) => {
         const overrideRow = raw.sharesRows.find(r => r[1] === targetId && r[2] === tType);
         if (!overrideRow) return true;
         const oPriv = overrideRow[5];
         let oAllow = []; try { oAllow = JSON.parse(overrideRow[6] || '[]'); } catch(e){}
         if (oPriv === 'private' && vUid !== oId) return false;
         if (oPriv === 'restricted' && vUid !== oId && !oAllow.some(u => u.uid === vUid)) return false;
         return true;
    };

    for (const r of raw.sheet1Rows) {
        if (String(r[8]) === ownerId && r[4] === folderPath) {
            if (checkOverrideAccess(r[0], 'file', ownerId, sharedViewerUid)) {
                const ext = r[3] ? '.' + r[3] : '';
                results.push({ id: r[0], name: r[1] + ext, relPath: (relPrefix ? relPrefix + '/' : '') + r[1] + ext });
            }
        }
    }
    
    const allFolders = raw.folderRows.filter(r => String(r[1]) === ownerId).map(r => r[0]);
    const subFoldersSet = new Set();
    allFolders.forEach(f => {
        if (f.startsWith(folderPath + '/')) {
            let rel = f.substring(folderPath.length + 1);
            let nextSeg = rel.split('/')[0];
            if (nextSeg) subFoldersSet.add(folderPath + '/' + nextSeg);
        }
    });
    
    for (let sf of subFoldersSet) {
        if (checkOverrideAccess(sf, 'folder', ownerId, sharedViewerUid)) {
            const segName = sf.split('/').pop();
            const nested = await collectSharedFolderFilesRecursive(sf, (relPrefix ? relPrefix + '/' : '') + segName, raw);
            results = results.concat(nested);
        }
    }
    return results;
}

async function renderSharedFolderBody(res, shareId, viewerUid, subPath) {
    // FIX: flag ini HANYA diset true oleh tick polling tepat sebelum
    // memanggil fungsi ini (lihat startSharedPolling) -- dibaca lalu
    // langsung direset di sini supaya panggilan LAIN ke fungsi ini (navigasi
    // manual pindah folder, dsb.) tetap dapat animasi masuk seperti biasa.
    const suppressEntranceAnim = sharedIsRealtimeRefresh;
    sharedIsRealtimeRefresh = false;
    sharedCurrentPath = subPath || '';
    sharedCurrentFolderName = res.item.name;
    sharedContentsCache = res.item.contents || { subfolders: [], files: [] };
    // Peta shareInfo per-item (subfolder/file yang punya link berbagi
    // sendiri) -- dipakai untuk fitur "Salin Link" per item di menu.
    sharedContentsCache.subfolderShares = res.item.subfolderShares || {};
    sharedContentsCache.fileShares = res.item.fileShares || {};
    sharedSelectedIds.clear(); sharedSelectedFolderPaths.clear(); sharedIsSelecting = false;
    updateSharedUploadFab(res.role, shareId, viewerUid);
    renderSharedBreadcrumb(Object.assign({ ownerId: pendingShareResolved ? pendingShareResolved.ownerId : res.ownerId, ownerName: pendingShareResolved ? pendingShareResolved.ownerName : res.ownerName }, res), subPath);

    const body = document.getElementById('shared-body');
    body.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
            <h2 style="font-size:20px; font-weight:800;">${res.item.name}</h2>
            <label id="shared-select-all-container" style="display:none; align-items:center; gap:6px; font-size:12.5px; font-weight:600; cursor:pointer; color:var(--primary);">
                <input type="checkbox" id="shared-select-all-cb" onchange="toggleSelectAllShared(this)" style="width:16px; height:16px; accent-color:var(--primary);">Pilih Semua
            </label>
        </div>
        <div class="selection-toolbar" id="shared-selection-toolbar">
            <div style="display:flex; align-items:center; gap: 8px;">
                <button class="icon-btn" onclick="clearSharedSelection()" title="Batalkan Pilihan"><span class="material-symbols-rounded">close</span></button>
                <span id="shared-selection-count" style="font-size: 13.5px; font-weight: 600;">0 dipilih</span>
            </div>
            <button class="icon-btn" onclick="downloadSharedSelectedBulk()" title="Download Terpilih"><span class="material-symbols-rounded">download</span></button>
        </div>
        <div class="folder-grid" id="shared-folder-grid" style="margin-bottom:24px;"></div>
        <div class="file-grid" id="shared-file-grid"></div>`;

    const folderGrid = document.getElementById('shared-folder-grid');
    const fileGrid = document.getElementById('shared-file-grid');
    if (suppressEntranceAnim) { folderGrid.classList.add('no-entrance-anim'); fileGrid.classList.add('no-entrance-anim'); }
    const subfolders = sharedContentsCache.subfolders || [];
    if (subfolders.length === 0) folderGrid.style.display = 'none'; else folderGrid.style.display = 'grid';
    subfolders.forEach(sf => {
        const safePath = sf.replace(/'/g, "\\'");
        const isSelected = sharedSelectedFolderPaths.has(sf);
        const card = document.createElement('div'); card.className = `folder-card ${isSelected ? 'selected' : ''} ${sharedIsSelecting ? 'selecting' : ''}`;
        card.innerHTML = `
            <input type="checkbox" class="folder-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSharedFolderSelect(event,'${safePath}', this)">
            <div class="folder-icon-box"><span class="material-symbols-rounded">folder</span></div>
            <div class="folder-info"><span class="folder-name" title="${escapeHtml(sf.split('/').pop())}">${escapeHtml(sf.split('/').pop())}</span></div>
            <button class="icon-btn folder-menu-btn" onclick="openSharedFolderMenu(event, '${safePath}')"><span class="material-symbols-rounded" style="font-size:20px;">more_vert</span></button>
        `;
        attachLongPressHandlers(card, () => {
            suppressNextClick = true; sharedIsSelecting = true;
            const chk = card.querySelector('.folder-checkbox'); chk.checked = !isSelected; toggleSharedFolderSelect(null, sf, chk);
        }, (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            if (sharedIsSelecting) { const chk = card.querySelector('.folder-checkbox'); chk.checked = !chk.checked; toggleSharedFolderSelect(e, sf, chk); }
            else enterSharedSubfolder(sf.split('/').pop());
        });
        folderGrid.appendChild(card);
    });

    const files = sharedContentsCache.files || [];
    if (files.length === 0 && subfolders.length === 0) { fileGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--text-muted); font-size:14px;">Tidak ada berkas di sini.</div>`; }
    files.forEach(f => {
        const ext = (f.format || '').toLowerCase();
        let displayFilename = f.name + (ext ? '.' + ext : '');
        const isSelected = sharedSelectedIds.has(f.id);
        const card = document.createElement('div'); card.className = `file-card ${isSelected ? 'selected' : ''} ${sharedIsSelecting ? 'selecting' : ''}`;
        card.innerHTML = `
            <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSharedSelect(event,'${f.id}', this)">
            <button class="icon-btn file-menu-btn" onclick="openSharedFileMenu(event, '${f.id}')"><span class="material-symbols-rounded" style="font-size:20px;">more_vert</span></button>
            <div class="file-thumbnail" id="shared-thumb-${f.id}"><span class="material-symbols-rounded" style="font-size:42px;">${getFileIcon(f.format)}</span></div>
            <div class="file-info-area"><span class="file-title-text" title="${displayFilename}">${displayFilename}</span><span class="file-sub">${formatBytes(f.size)}</span></div>
        `;
        attachLongPressHandlers(card, () => {
            suppressNextClick = true; sharedIsSelecting = true;
            const chk = card.querySelector('.file-checkbox'); chk.checked = !isSelected; toggleSharedSelect(null, f.id, chk);
        }, (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            if (sharedIsSelecting) { const chk = card.querySelector('.file-checkbox'); chk.checked = !chk.checked; toggleSharedSelect(e, f.id, chk); }
            else openSharedFilePreviewModal(f, shareId, viewerUid);
        });
        fileGrid.appendChild(card);
        if (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)) loadSharedCardThumbnail(f, ext, `shared-thumb-${f.id}`, shareId, viewerUid);
    });
    updateSharedSelectionToolbar();
}

function toggleSharedSelect(e, fileId, checkbox) {
    if (e) e.stopPropagation();
    if (checkbox.checked) sharedSelectedIds.add(fileId); else sharedSelectedIds.delete(fileId);
    sharedIsSelecting = (sharedSelectedIds.size + sharedSelectedFolderPaths.size) > 0;
    document.querySelectorAll('#shared-folder-grid .folder-card, #shared-file-grid .file-card').forEach(c => c.classList.toggle('selecting', sharedIsSelecting));
    const card = checkbox.closest ? checkbox.closest('.file-card') : null;
    if (card) card.classList.toggle('selected', checkbox.checked);
    updateSharedSelectionToolbar();
}
function toggleSharedFolderSelect(e, folderPath, checkbox) {
    if (e) e.stopPropagation();
    if (checkbox.checked) sharedSelectedFolderPaths.add(folderPath); else sharedSelectedFolderPaths.delete(folderPath);
    sharedIsSelecting = (sharedSelectedIds.size + sharedSelectedFolderPaths.size) > 0;
    document.querySelectorAll('#shared-folder-grid .folder-card, #shared-file-grid .file-card').forEach(c => c.classList.toggle('selecting', sharedIsSelecting));
    const card = checkbox.closest ? checkbox.closest('.folder-card') : null;
    if (card) card.classList.toggle('selected', checkbox.checked);
    updateSharedSelectionToolbar();
}
function toggleSelectAllShared(checkbox) {
    const folders = sharedContentsCache.subfolders || [];
    const files = sharedContentsCache.files || [];
    if (checkbox.checked) {
        sharedIsSelecting = true;
        folders.forEach(f => sharedSelectedFolderPaths.add(f));
        files.forEach(f => sharedSelectedIds.add(f.id));
    } else {
        folders.forEach(f => sharedSelectedFolderPaths.delete(f));
        files.forEach(f => sharedSelectedIds.delete(f.id));
        sharedIsSelecting = false;
    }
    document.querySelectorAll('#shared-folder-grid .folder-card, #shared-file-grid .file-card').forEach(c => {
        c.classList.toggle('selecting', sharedIsSelecting);
        c.classList.toggle('selected', checkbox.checked);
        const chk = c.querySelector('input[type=checkbox]'); if (chk) chk.checked = checkbox.checked;
    });
    updateSharedSelectionToolbar();
}
function clearSharedSelection() {
    sharedSelectedIds.clear(); sharedSelectedFolderPaths.clear(); sharedIsSelecting = false;
    document.querySelectorAll('#shared-folder-grid .folder-card, #shared-file-grid .file-card').forEach(c => {
        c.classList.remove('selecting', 'selected');
        const chk = c.querySelector('input[type=checkbox]'); if (chk) chk.checked = false;
    });
    updateSharedSelectionToolbar();
}
function updateSharedSelectionToolbar() {
    const toolbar = document.getElementById('shared-selection-toolbar'); if (!toolbar) return;
    const count = sharedSelectedIds.size + sharedSelectedFolderPaths.size;
    const totalItems = (sharedContentsCache.subfolders || []).length + (sharedContentsCache.files || []).length;
    const selectAllContainer = document.getElementById('shared-select-all-container');
    const selectAllCb = document.getElementById('shared-select-all-cb');
    if (selectAllContainer) selectAllContainer.style.display = (count > 0 && totalItems > 0) ? 'flex' : 'none';
    if (selectAllCb) selectAllCb.checked = totalItems > 0 && count === totalItems;
    if (count > 0) { toolbar.classList.add('show'); document.getElementById('shared-selection-count').innerText = `${count} dipilih`; }
    else toolbar.classList.remove('show');
}

let sharedMenuTargetFile = null;
let sharedMenuTargetFolderPath = '';
function openSharedFileMenu(e, fileId) {
    e.stopPropagation();
    const item = (sharedContentsCache.files || []).find(f => f.id === fileId);
    if (!item) return;
    sharedMenuTargetFile = item;
    let displayName = item.name + (item.format ? '.' + item.format : '');
    document.getElementById('opt-file-title').innerText = displayName;
    document.getElementById('opt-file-title').title = displayName;
    // FIX: item DI DALAM folder yang dibagikan dengan akses Edit -- viewer
    // boleh ganti nama & hapus (ke sampah pemilik), sama seperti pemilik.
    // Kalau perannya cuma Lihat, menu tetap terbatas ke info & download.
    let editItemsHTML = '';
    if (sharedUploadFabRole === 'edit') {
        editItemsHTML = `
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">
        <div class="action-menu-item" onclick="sharedRenameFileFromMenu()"><span class="material-symbols-rounded">edit</span> Ganti Nama</div>
        <div class="action-menu-item danger" onclick="sharedDeleteFileFromMenu()"><span class="material-symbols-rounded">delete</span> Buang ke Sampah</div>`;
    }
    // FITUR "SALIN LINK PER-ITEM": lihat catatan yang sama di openSharedFolderMenu().
    const shareInfo = (sharedContentsCache.fileShares || {})[fileId];
    let copyLinkHTML = '';
    if (shareInfo && shareInfo.privacy && shareInfo.privacy !== 'private') {
        copyLinkHTML = `<div class="action-menu-item" onclick="copySharedSubItemLink('${shareInfo.shareId}')"><span class="material-symbols-rounded">link</span> Salin Link</div>`;
    }
    document.getElementById('file-opt-container').innerHTML = `
        <div class="action-menu-item" onclick="openSharedFileInfoFromMenu()"><span class="material-symbols-rounded">info</span> Detail Berkas</div>
        <div class="action-menu-item" onclick="downloadSharedFileFromMenu()"><span class="material-symbols-rounded">download</span> Download Berkas</div>
        ${copyLinkHTML}
        ${editItemsHTML}
    `;
    document.getElementById('file-options-modal').style.display = 'flex';
}
function downloadSharedFileFromMenu() {
    closeFileOptions();
    if (!sharedMenuTargetFile) return;
    const item = sharedMenuTargetFile;
    let displayName = item.name + (item.format ? '.' + item.format : '');
    downloadSharedFile(item.id, item.format, displayName, pendingShareCode, sharedViewerUid);
}
// FIX: ganti nama file di dalam folder share dengan akses Edit. Validasi
// peran & cakupan folder tetap final di server (action 'shared_rename_file').
async function sharedRenameFileFromMenu() {
    closeFileOptions();
    if (!sharedMenuTargetFile) return;
    const item = sharedMenuTargetFile;
    const newName = prompt("Nama baru untuk berkas ini:", item.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return showToast("Nama tidak boleh kosong.", true);
    if (trimmed.length > 300) return showToast("Nama terlalu panjang (maksimal 300 karakter).", true);
    if (/[<>]/.test(trimmed)) return showToast("Nama tidak boleh mengandung karakter < atau >.", true);
    showLoadingOverlay("Menyimpan nama baru...", false, false);
    const res = await callGasAPI('shared_rename_file', { fileId: item.id, newName: trimmed, shareId: pendingShareCode, viewerUid: sharedViewerUid });
    hideLoadingOverlay();
    if (res && res.success) {
        item.name = trimmed;
        showToast("Nama berhasil diubah.", false);
        renderSharedFolderBody(pendingShareResolved, pendingShareCode, sharedViewerUid, sharedCurrentPath);
    } else { showToast((res && res.message) || "Gagal mengubah nama.", true); }
}
// FIX: hapus (pindahkan ke sampah pemilik) file di dalam folder share
// dengan akses Edit.
function sharedDeleteFileFromMenu() {
    closeFileOptions();
    if (!sharedMenuTargetFile) return;
    const item = sharedMenuTargetFile;
    showConfirm("Pindahkan berkas ini ke tempat sampah pemilik?", "Hapus Berkas", async () => {
        showLoadingOverlay("Menghapus berkas...", false, false);
        const res = await callGasAPI('shared_delete_file', { fileId: item.id, shareId: pendingShareCode, viewerUid: sharedViewerUid });
        hideLoadingOverlay();
        if (res && res.success) {
            sharedContentsCache.files = (sharedContentsCache.files || []).filter(f => f.id !== item.id);
            showToast("Berkas dipindahkan ke sampah.", false);
            renderSharedFolderBody(pendingShareResolved, pendingShareCode, sharedViewerUid, sharedCurrentPath);
        } else { showToast((res && res.message) || "Gagal menghapus berkas.", true); }
    });
}
function openSharedFileInfoFromMenu() {
    closeFileOptions();
    if (!sharedMenuTargetFile) return;
    const item = sharedMenuTargetFile;
    let displayName = item.name + (item.format ? '.' + item.format : '');
    const ext = (item.format || '').toLowerCase();
    document.getElementById('info-name').innerText = displayName;
    document.getElementById('info-name').title = displayName;
    document.getElementById('info-format').innerText = (item.format || 'Tidak diketahui');
    document.getElementById('info-size').innerText = formatBytes(item.size);
    document.getElementById('info-location').innerText = sharedCurrentPath || 'Beranda';
    document.getElementById('info-id').innerText = item.id;
    const exifContainer = document.getElementById('info-exif-container');
    exifContainer.innerHTML = '';
    // FIX: metadata kamera (EXIF) sekarang juga berlaku di halaman shared --
    // sebelumnya cuma tersedia di Drive milik sendiri. Diambil lewat rute
    // shared (get_chunks + shareId), yang tetap divalidasi izin akses di server.
    if (['jpg','jpeg','png','webp','tiff','cr2','nef','arw','dng','raw','rw2','orf','pef','srw'].includes(ext)) {
        loadExifForSharedFile(item, exifContainer);
    }
    document.getElementById('file-info-modal').style.display = 'flex';
}

// Versi shared dari loadExifForCurrentFile() -- ambil chunk lewat rute
// shared (get_chunks + shareId/viewerUid, tetap tervalidasi server), lalu
// pakai parseAndShowExif() yang sama (generik, tidak peduli sumber blobnya).
async function loadExifForSharedFile(item, exifContainer) {
    exifContainer.innerHTML = `<div style="font-size:12.5px; color:var(--primary); margin-top:12px; display:flex; align-items:center; gap:6px;"><span class="spinner" style="width:14px; height:14px; border-width:2px; border-top-color:var(--primary);"></span> Memuat metadata foto...</div>`;
    try {
        const ownerIdForChunks = (pendingShareResolved && pendingShareResolved.ownerId) || (sharedRootItem && sharedRootItem.ownerId);
        const res = await getSharedFileChunks(item.id, ownerIdForChunks, pendingShareCode, sharedViewerUid);
        if (!res || !res.success || !res.data) throw new Error("Metadata chunk tidak ditemukan");
        let chunks = res.data;
        if (typeof chunks === 'string') chunks = JSON.parse(chunks);
        if (!Array.isArray(chunks) || chunks.length === 0) throw new Error("Data chunk kosong");
        chunks.sort((a, b) => a.part - b.part);
        const pathBlob = await fetchBinaryWithFallback(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${chunks[0].telegramFileId}`);
        const pathText = await pathBlob.text();
        const pathData = JSON.parse(pathText);
        if (!pathData.ok || !pathData.result) throw new Error("Gagal resolusi path file Telegram");
        const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${pathData.result.file_path}`;
        const imageBlob = await fetchBinaryWithFallback(fileUrl);
        await parseAndShowExif(imageBlob, exifContainer);
    } catch (e) { exifContainer.innerHTML = `<div style="font-size:12px; color:var(--text-muted); margin-top:12px;">Tidak ada metadata ekstra atau gagal memuat.</div>`; }
}

function openSharedFolderMenu(e, folderPath) {
    e.stopPropagation();
    sharedMenuTargetFolderPath = folderPath;
    document.getElementById('opt-file-title').innerText = folderPath.split('/').pop();
    document.getElementById('opt-file-title').title = folderPath.split('/').pop();
    // FIX: subfolder di dalam share dengan akses Edit juga boleh diganti
    // nama & dihapus (dipindahkan ke sampah pemilik beserta isinya), sama
    // seperti file.
    let editItemsHTML = '';
    if (sharedUploadFabRole === 'edit') {
        editItemsHTML = `
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">
        <div class="action-menu-item" onclick="sharedRenameFolderFromMenu()"><span class="material-symbols-rounded">edit</span> Ganti Nama</div>
        <div class="action-menu-item danger" onclick="sharedDeleteFolderFromMenu()"><span class="material-symbols-rounded">delete</span> Buang ke Sampah</div>`;
    }
    // FITUR "SALIN LINK PER-ITEM": cuma muncul kalau folder ini SUDAH punya
    // link berbagi sendiri (bukan cuma warisan dari folder induk yang sedang
    // dibuka) dan privasinya bukan 'private' -- kalau privasinya private,
    // linknya cuma bisa dibuka pemiliknya sendiri, jadi tidak ada gunanya
    // untuk disalin.
    const shareInfo = (sharedContentsCache.subfolderShares || {})[folderPath];
    let copyLinkHTML = '';
    if (shareInfo && shareInfo.privacy && shareInfo.privacy !== 'private') {
        copyLinkHTML = `<div class="action-menu-item" onclick="copySharedSubItemLink('${shareInfo.shareId}')"><span class="material-symbols-rounded">link</span> Salin Link</div>`;
    }
    document.getElementById('file-opt-container').innerHTML = `
        <div class="action-menu-item" onclick="downloadSharedFolderFromMenu()"><span class="material-symbols-rounded">folder_zip</span> Download sebagai ZIP</div>
        ${copyLinkHTML}
        ${editItemsHTML}
    `;
    document.getElementById('file-options-modal').style.display = 'flex';
}
// Salin link berbagi milik SENDIRI dari sebuah item (file/folder) di dalam
// folder yang sedang dibagikan -- dipakai baik dalam mode Lihat maupun Edit.
function copySharedSubItemLink(shareId) {
    closeFileOptions();
    const link = buildShareLink(shareId);
    navigator.clipboard && navigator.clipboard.writeText(link).then(() => showToast("Link disalin!", false)).catch(() => {
        const tmp = document.createElement('textarea'); tmp.value = link; document.body.appendChild(tmp); tmp.select();
        document.execCommand('copy'); document.body.removeChild(tmp); showToast("Link disalin!", false);
    });
}
// FIX: subfolder di dalam share dengan akses Edit sekarang juga bisa
// diganti nama (dulu cuma file yang bisa) -- memanggil action backend
// 'shared_rename_folder' yang mem-validasi cakupan & mengkaskade path ke
// semua sub-folder/file/share di dalamnya.
async function sharedRenameFolderFromMenu() {
    closeFileOptions();
    if (!sharedMenuTargetFolderPath) return;
    const path = sharedMenuTargetFolderPath;
    const oldName = path.split('/').pop();
    const newName = prompt("Nama baru untuk folder ini:", oldName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return showToast("Nama tidak boleh kosong.", true);
    if (trimmed.length > 300) return showToast("Nama terlalu panjang (maksimal 300 karakter).", true);
    if (/[<>\/]/.test(trimmed)) return showToast("Nama tidak boleh mengandung karakter < > /.", true);
    if (trimmed === oldName) return;
    showLoadingOverlay("Menyimpan nama baru...", false, false);
    const res = await callGasAPI('shared_rename_folder', { folderPath: path, newName: trimmed, shareId: pendingShareCode, viewerUid: sharedViewerUid });
    hideLoadingOverlay();
    if (res && res.success) {
        showToast("Nama folder berhasil diubah.", false);
        navigateSharedTo();
    } else { showToast((res && res.message) || "Gagal mengubah nama folder.", true); }
}
// FIX: hapus (pindahkan ke sampah pemilik) subfolder beserta isinya, di
// dalam folder share dengan akses Edit.
function sharedDeleteFolderFromMenu() {
    closeFileOptions();
    if (!sharedMenuTargetFolderPath) return;
    const path = sharedMenuTargetFolderPath;
    showConfirm("Pindahkan folder ini beserta isinya ke tempat sampah pemilik?", "Hapus Folder", async () => {
        showLoadingOverlay("Menghapus folder...", false, false);
        const res = await callGasAPI('shared_delete_folder', { folderPath: path, shareId: pendingShareCode, viewerUid: sharedViewerUid });
        hideLoadingOverlay();
        if (res && res.success) {
            showToast("Folder dipindahkan ke sampah.", false);
            navigateSharedTo();
        } else { showToast((res && res.message) || "Gagal menghapus folder.", true); }
    });
}
function downloadSharedFolderFromMenu() {
    closeFileOptions();
    if (!sharedMenuTargetFolderPath) return;
    buildAndDownloadSharedZip(sharedMenuTargetFolderPath, sharedMenuTargetFolderPath.split('/').pop(), false);
}


// ==========================================
// UNIVERSAL FILE PREVIEW
// ==========================================
const CODE_EXTENSIONS = new Set(['js','ts','jsx','tsx','py','java','c','cpp','h','hpp','cs','go','rs','php','rb','swift','kt','kts','dart','lua','sh','bash','bat','ps1','html','htm','css','scss','sass','json','xml','yaml','yml','sql','vue','svelte','md','txt','log','ini','conf','env']);
const IMAGE_EXTENSIONS = new Set(['jpg','jpeg','png','webp','gif','bmp','svg','tif','tiff','avif','ico','heic','heif','cr2','nef','arw','dng','raw','rw2','orf','pef','srw']);
const VIDEO_EXTENSIONS = new Set(['mp4','webm','mov','mkv','m4v','avi','ogv']);
const AUDIO_EXTENSIONS = new Set(['mp3','wav','ogg','m4a','aac','flac','opus','weba']);

function trackPreviewUrl(url) { if (url && url.startsWith('blob:')) previewObjectUrls.add(url); return url; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function previewLoading(container, text='Memuat pratinjau...', percent=null) {
    container.innerHTML = `<div style="width:min(520px,90%);text-align:center;color:#fff;"><div class="spinner" style="margin:auto;border-color:rgba(255,255,255,.2);border-top-color:var(--accent);"></div><p style="margin-top:12px;">${escapeHtml(text)}</p>${percent!==null?`<div class="progress-track preview-progress" style="margin:14px auto 0;background:rgba(255,255,255,.15)"><div class="progress-fill" id="preview-progress-bar" style="width:${percent}%"></div></div><div id="preview-progress-text" style="margin-top:7px;font-size:12px;opacity:.8">${percent}%</div>`:''}</div>`;
}
// Jalur decode native KEDUA -- dipakai kalau createImageBitmap gagal.
// Sebagian browser/versi punya dukungan codec yang beda antara API
// createImageBitmap vs elemen <img> biasa (mis. sebagian kasus HEIC/AVIF),
// jadi ini kesempatan kedua sebelum benar-benar dianggap "tidak bisa
// didekode sama sekali".
function tryDecodeViaImgTag(blob, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        let done = false;
        const finish = (val) => { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch(e){} resolve(val); };
        const timer = setTimeout(() => finish(null), timeoutMs);
        const img = new Image();
        img.onload = () => {
            clearTimeout(timer);
            try {
                const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                if (!w || !h) { finish(null); return; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0);
                finish(canvas);
            } catch (e) { finish(null); }
        };
        img.onerror = () => { clearTimeout(timer); finish(null); };
        img.src = url;
    });
}

async function convertImageToWebP(blob, maxBytes=5*1024*1024) {
    if (!blob || !String(blob.type).startsWith('image/')) return null;
    if (blob.type === 'image/webp' && blob.size <= maxBytes) return blob;

    // PATCH: dulu cuma coba 1 cara decode (createImageBitmap) -- kalau itu
    // gagal langsung nyerah. Sekarang dicoba 2 cara sebelum benar2 nyerah,
    // supaya lebih banyak kasus format "aneh" tetap berhasil didekode.
    let source = await createImageBitmap(blob).catch(()=>null);
    let isBitmap = !!source;
    if (!source) source = await tryDecodeViaImgTag(blob);
    if (!source) return null; // benar-benar tidak ada satupun cara browser ini bisa mendekodenya

    let w = source.width, h = source.height;
    let scale = Math.min(1, Math.sqrt(maxBytes / Math.max(blob.size,1)) * 1.25);
    w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
    for (let attempt=0; attempt<6; attempt++) {
        const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d'); ctx.drawImage(source,0,0,w,h);
        let quality=0.86;
        for (let q=0;q<7;q++) {
            const out=await new Promise(r=>canvas.toBlob(r,'image/webp',quality));
            if (out && out.size<=maxBytes) { if (isBitmap) source.close?.(); return out; }
            quality-=0.08;
        }
        w=Math.max(320,Math.round(w*.72)); h=Math.max(320,Math.round(h*.72));
    }
    if (isBitmap) source.close?.();
    return null;
}

async function drawAudioWave(container, audioUrl) {
    container.innerHTML = `
        <div class="custom-audio-player" style="background-color: transparent; width: 100%; display: flex; flex-direction: column; gap: 24px;">
            
            <!-- Perhatikan cursor diubah jadi not-allowed saat awal loading -->
            <div id="waveform-container" style="position: relative; width: 100%; height: 130px; background-color: #232332; border-radius: 12px; overflow: hidden; cursor: not-allowed; border: 1px solid rgba(255,255,255,0.05); touch-action: none;">
                
                <div id="wave-loading" style="position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; color: #888; font-size: 13px; z-index: 20;">
                    <span class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: #34d399; margin-right: 8px;"></span> Menyiapkan grafik audio...
                </div>

                <div id="wave-gradient" style="position: absolute; top: 0; left: 0; height: 100%; width: 0%; background: linear-gradient(90deg, rgba(52, 211, 153, 0.4) 0%, rgba(52, 211, 153, 0.05) 100%); z-index: 1;"></div>
                <canvas id="waveform-bg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></canvas>
                <canvas id="waveform-progress" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; clip-path: inset(0 100% 0 0); z-index: 3;"></canvas>
                <div id="playhead-line" style="position: absolute; top: 0; left: 0; width: 2px; height: 100%; background-color: #34d399; z-index: 4; transform: translateX(-50%); box-shadow: 0 0 6px rgba(52, 211, 153, 0.8); pointer-events: none;"></div>

                <div style="position: absolute; bottom: 8px; left: 12px; color: #6b7280; font-size: 12px; font-family: monospace; z-index: 5;" id="time-current">00:00.0</div>
                <div style="position: absolute; bottom: 8px; right: 12px; color: #6b7280; font-size: 12px; font-family: monospace; z-index: 5;" id="time-total">00:00.0</div>
            </div>

            <div style="display: flex; justify-content: center; align-items: center; gap: 40px; margin-bottom: 10px;">
                <button id="btn-rw" disabled class="icon-btn" style="color: #fff; transition: 0.2s; opacity: 0.3; cursor: not-allowed;" title="Mundur 10 detik">
                    <span class="material-symbols-rounded" style="font-size: 32px;">replay_10</span>
                </button>
                <button id="btn-play" disabled class="icon-btn" style="color: #1a1a24; background-color: #fff; border-radius: 50%; width: 60px; height: 60px; display: flex; justify-content: center; align-items: center; transition: 0.2s; opacity: 0.3; cursor: not-allowed;" title="Play/Pause">
                    <span class="material-symbols-rounded" style="font-size: 38px;">play_arrow</span>
                </button>
                <button id="btn-ff" disabled class="icon-btn" style="color: #fff; transition: 0.2s; opacity: 0.3; cursor: not-allowed;" title="Maju 10 detik">
                    <span class="material-symbols-rounded" style="font-size: 32px;">forward_10</span>
                </button>
            </div>
            
            <audio id="preview-audio" src="${audioUrl}" style="display: none;"></audio>
        </div>
    `;

    const audio = document.getElementById('preview-audio');
    const canvasBg = document.getElementById('waveform-bg');
    const canvasProg = document.getElementById('waveform-progress');
    const waveContainer = document.getElementById('waveform-container');
    const waveGradient = document.getElementById('wave-gradient');
    const playheadLine = document.getElementById('playhead-line');
    const loadingText = document.getElementById('wave-loading');
    
    const btnPlay = document.getElementById('btn-play');
    const btnRw = document.getElementById('btn-rw');
    const btnFf = document.getElementById('btn-ff');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');

    if (!audio || !canvasBg || !canvasProg) return;

    const formatTime = (time) => {
        if (isNaN(time) || !isFinite(time)) return "00:00.0";
        const m = Math.floor(time / 60).toString().padStart(2, '0');
        const s = Math.floor(time % 60).toString().padStart(2, '0');
        const ms = Math.floor((time % 1) * 10).toString();
        return `${m}:${s}.${ms}`;
    };

    btnPlay.onclick = () => {
        if (audio.paused) {
            audio.play();
            btnPlay.innerHTML = '<span class="material-symbols-rounded" style="font-size: 38px;">pause</span>';
        } else {
            audio.pause();
            btnPlay.innerHTML = '<span class="material-symbols-rounded" style="font-size: 38px;">play_arrow</span>';
        }
    };

    btnRw.onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 10); };
    btnFf.onclick = () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); };

    let isDragging = false; 
    let isWaveformReady = false; // KUNCI UTAMA: Menahan swipe sebelum grafik siap

    audio.ontimeupdate = () => {
        if (isDragging) return; 
        const percent = (audio.currentTime / audio.duration) * 100 || 0;
        timeCurrent.innerText = formatTime(audio.currentTime);
        
        canvasProg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
        playheadLine.style.left = `${percent}%`;
        waveGradient.style.width = `${percent}%`;
    };

    audio.onended = () => {
        btnPlay.innerHTML = '<span class="material-symbols-rounded" style="font-size: 38px;">play_arrow</span>';
    };

    audio.onloadedmetadata = () => {
        timeTotal.innerText = formatTime(audio.duration);
        // FIX: dulu Play/RW/FF dikunci sampai SELURUH file audio selesai
        // di-fetch penuh + didekode (cuma buat gambar waveform) -- padahal
        // <audio> ini sendiri sudah streaming lewat worker (Range request),
        // jadi bisa mulai main jauh lebih cepat. Sekarang begitu metadata
        // siap (butuh sedikit data awal doang), playback langsung dibuka;
        // waveform-nya nyusul digambar di background tanpa ngunci apa pun.
        if (!isWaveformReady) {
            isWaveformReady = true;
            waveContainer.style.cursor = 'pointer';
            btnPlay.disabled = false; btnPlay.style.opacity = '1'; btnPlay.style.cursor = 'pointer';
            btnRw.disabled = false; btnRw.style.opacity = '1'; btnRw.style.cursor = 'pointer';
            btnFf.disabled = false; btnFf.style.opacity = '1'; btnFf.style.cursor = 'pointer';
        }
    };

    const updatePositionFromEvent = (clientX) => {
        const rect = waveContainer.getBoundingClientRect();
        let percent = (clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent)); 
        
        canvasProg.style.clipPath = `inset(0 ${100 - (percent * 100)}% 0 0)`;
        playheadLine.style.left = `${percent * 100}%`;
        waveGradient.style.width = `${percent * 100}%`;
        
        if (audio.duration) {
            timeCurrent.innerText = formatTime(percent * audio.duration);
        }
        return percent;
    };

    // --- EVENT LISTENER DENGAN PROTEKSI ---
    waveContainer.addEventListener('pointerdown', (e) => {
        if (!isWaveformReady) return; // BLOKIR JIKA BELUM SIAP
        isDragging = true;
        waveContainer.setPointerCapture(e.pointerId);
        updatePositionFromEvent(e.clientX);
    });

    waveContainer.addEventListener('pointermove', (e) => {
        if (!isWaveformReady || !isDragging) return; // BLOKIR JIKA BELUM SIAP
        updatePositionFromEvent(e.clientX);
    });

    waveContainer.addEventListener('pointerup', (e) => {
        if (!isWaveformReady || !isDragging) return; // BLOKIR JIKA BELUM SIAP
        isDragging = false;
        waveContainer.releasePointerCapture(e.pointerId);
        
        const percent = updatePositionFromEvent(e.clientX);
        if (audio.duration) {
            audio.currentTime = percent * audio.duration;
            if (audio.paused) {
                audio.play();
                btnPlay.innerHTML = '<span class="material-symbols-rounded" style="font-size: 38px;">pause</span>';
            }
        }
    });

    try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        // FIX PERFORMA: dulu decodeAudioData() didekode di sample rate ASLI
        // file (biasanya 44.1kHz/48kHz) padahal cuma dipakai untuk menggambar
        // 110 batang -- untuk file panjang (misal audio 1 jam), itu berarti
        // mendekode puluhan JUTA sample cuma buat dibuang lewat rata-rata.
        // Sekarang AudioContext dipaksa pakai sample rate RENDAH (8kHz, batas
        // bawah yang didukung semua browser) -- decodeAudioData otomatis
        // resample ke situ, jadi jumlah sample yang perlu diproses turun
        // drastis (~5-6x lebih sedikit dari 44.1kHz) tanpa mengubah bentuk
        // visual waveform-nya sama sekali (toh cuma jadi 110 batang).
        let audioCtx;
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 }); }
        catch (e) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } // fallback kalau browser menolak sampleRate custom
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close?.(); // konteksnya cuma dipakai buat decode, tidak perlu tetap hidup

        const rawData = audioBuffer.getChannelData(0);
        const samples = 110; 
        const blockSize = Math.floor(rawData.length / samples) || 1;
        // FIX PERFORMA #2: dulu loop dalam menjumlah SEMUA sample di tiap blok
        // (bisa ribuan iterasi/blok). Sekarang cukup "mengintip" lewat stride
        // maksimal ~250 titik per blok -- cukup representatif untuk digambar
        // sebagai 1 batang, tapi jauh lebih sedikit iterasi untuk blok besar.
        const maxPeeksPerBlock = 250;
        const stride = Math.max(1, Math.floor(blockSize / maxPeeksPerBlock));
        const filteredData = [];
        
        for (let i = 0; i < samples; i++) {
            let blockStart = blockSize * i;
            let blockEnd = Math.min(blockStart + blockSize, rawData.length);
            let sum = 0, count = 0;
            for (let j = blockStart; j < blockEnd; j += stride) {
                sum += Math.abs(rawData[j]);
                count++;
            }
            filteredData.push(count > 0 ? sum / count : 0);
        }

        const multiplier = Math.max(...filteredData) || 1;
        const normalizedData = filteredData.map(n => n / multiplier);

        const drawCanvas = (canvas, color) => {
            canvas.width = waveContainer.clientWidth || 500;
            canvas.height = waveContainer.clientHeight || 130;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            
            const barWidth = canvas.width / samples;
            const barSpacing = 2; 
            
            for (let i = 0; i < samples; i++) {
                const height = Math.max(3, normalizedData[i] * (canvas.height - 40)); 
                const x = i * barWidth;
                const y = (canvas.height - height) / 2;
                
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(x, y, barWidth - barSpacing, height, 4);
                } else {
                    ctx.fillRect(x, y, barWidth - barSpacing, height);
                }
                ctx.fill();
            }
        };

        drawCanvas(canvasBg, '#4b5563'); 
        drawCanvas(canvasProg, '#34d399'); 

        // === SEMUA SUDAH SIAP ===
        loadingText.style.display = 'none';
        
        // Buka gembok swipe dan ubah kursor
        isWaveformReady = true; 
        waveContainer.style.cursor = 'pointer'; 

        // Nyalakan tombol
        btnPlay.disabled = false; btnPlay.style.opacity = '1'; btnPlay.style.cursor = 'pointer';
        btnRw.disabled = false; btnRw.style.opacity = '1'; btnRw.style.cursor = 'pointer';
        btnFf.disabled = false; btnFf.style.opacity = '1'; btnFf.style.cursor = 'pointer';

    } catch (err) {
        console.error("Gagal merender waveform:", err);
        loadingText.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px; margin-right:5px;">error</span> Gagal memuat grafik';
        
        // Tetap nyalakan tombol dan izinkan swipe (fallback) jika error rendering tapi audio bisa jalan
        isWaveformReady = true;
        waveContainer.style.cursor = 'pointer';

        btnPlay.disabled = false; btnPlay.style.opacity = '1'; btnPlay.style.cursor = 'pointer';
        btnRw.disabled = false; btnRw.style.opacity = '1'; btnRw.style.cursor = 'pointer';
        btnFf.disabled = false; btnFf.style.opacity = '1'; btnFf.style.cursor = 'pointer';
    }
}


async function renderPreviewContent(url, ext, container, blob) {
    ext = (ext||'').toLowerCase();
    // Transisi morph/fade dari spinner loading ke konten pratinjau final.
    // Class ditempel di container (bukan konten di dalamnya) supaya tetap
    // jalan apa pun jenis kontennya (gambar/video/pdf/dst) yang diisi di
    // bawah oleh masing-masing cabang; reflow paksa dulu biar animasi selalu
    // restart walau container ini sebelumnya sudah pernah dipakai.
    if (container) {
        container.classList.remove('fade-in-content');
        void container.offsetWidth;
        container.classList.add('fade-in-content');
    }
    try {
        if (IMAGE_EXTENSIONS.has(ext)) {
            let displayUrl = url;
            let isRawExtractedPreview = false;
            // Browser TIDAK bisa render file RAW kamera (cr2/nef/arw/dst) secara
            // native sebagai <img>. Solusinya: ambil preview JPEG yang sudah
            // ter-embed di dalam file RAW-nya pakai exifr, lalu itu yang ditampilkan.
            // Catatan: kalau file RAW ini sudah punya cover hasil konversi (blob.type
            // sudah 'image/webp'), JANGAN ekstrak ulang — itu cover-nya sendiri sudah
            // valid untuk ditampilkan langsung. Ekstraksi exifr cuma perlu dilakukan
            // kalau blob yang dikirim memang masih file RAW mentah aslinya.
            if (['cr2','nef','arw','dng','raw','rw2','orf','pef','srw','heic','heif'].includes(ext) && blob && blob.type !== 'image/webp') {
                try {
                    const thumbData = await extractRawEmbeddedPreview(blob);
                    if (thumbData) {
                        const rawThumbBlob = new Blob([thumbData], { type: 'image/jpeg' });
                        displayUrl = trackPreviewUrl(URL.createObjectURL(rawThumbBlob));
                        isRawExtractedPreview = true;
                    }
                } catch (e) { /* kalau gagal ekstrak, tetap coba tampilkan url asli di bawah */ }
            }
            // PATCH: preview yang diekstrak dari RAW sebelumnya cuma dikasih
            // max-width/max-height, jadi kalau resolusi hasil ekstraksinya
            // rendah (mis. yang ketemu cuma thumbnail kecil, bukan preview
            // besar), gambar tampil kecil ngambang di tengah. Sekarang
            // khusus untuk preview hasil ekstraksi RAW, dipaksa mengisi
            // lebar penuh (width:100%) dengan tinggi menyesuaikan proporsi,
            // supaya tetap terlihat "full" walau resolusi aslinya rendah.
            const imgStyle = isRawExtractedPreview
                ? 'width:100%; max-height:85vh; object-fit:contain; border-radius:10px;'
                : 'max-width:100%; max-height:85vh; object-fit:contain; border-radius:10px;';
            // FIX #3: pesan fallback digeneralisasi (dulu selalu bilang "File RAW"
            // walau yang gagal tampil bisa juga HEIC/format lain) + selalu tawarkan
            // tombol download supaya user tetap bisa akses filenya.
            container.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;"><img class="preview-media" src="${displayUrl}" alt="Preview" style="${imgStyle}" onerror="this.closest('div').innerHTML='<div style=&quot;color:#fff;text-align:center;max-width:420px;&quot;><span class=&quot;material-symbols-rounded&quot; style=&quot;font-size:48px;&quot;>broken_image</span><p style=&quot;margin-top:10px;font-size:13px;&quot;>Browser Anda tidak bisa menampilkan pratinjau format ini secara langsung.</p><button class=&quot;btn-primary&quot; style=&quot;margin-top:14px;padding:8px 18px;&quot; onclick=&quot;downloadSelectedFile()&quot;>Download Berkas</button></div>'"></div>`; 
            return;
        }
        if (VIDEO_EXTENSIONS.has(ext)) {
            const u=trackPreviewUrl(url); 
            // PATCH: player video sebelumnya pakai library Plyr (kontrolnya
            // bawaan library, ikut style default Plyr). Sekarang diganti
            // dengan UI player buatan sendiri: tombol play/pause, volume,
            // timeline yang bisa digeser, dan penunjuk durasi -- lihat
            // initCustomVideoPlayer() di bawah.
            container.innerHTML = buildCustomVideoPlayerHTML(u);
            const v = document.getElementById('preview-video');
            // FIX #3: pasang listener 'error' -- beberapa codec di dalam mkv/mov/avi
            // tidak didukung native oleh browser, video tag akan diam saja tanpa ini.
            v.addEventListener('error', () => {
                // FIX: kode error 4 (MEDIA_ERR_SRC_NOT_SUPPORTED) di Safari BUKAN
                // cuma dipicu codec yang tidak didukung -- Safari juga melempar
                // kode yang SAMA persis kalau server streaming (Cloudflare Worker
                // /stream) tidak mengirim header "Accept-Ranges: bytes" + respons
                // "206 Partial Content" yang benar untuk permintaan Range. Chrome/
                // Android lebih toleran dan sering tetap main walau header itu
                // hilang, makanya gejalanya "cuma di iPhone Safari doang". Pesan
                // di bawah dibedakan supaya gak nyasar user ngira videonya rusak
                // padahal soal dukungan Range di sisi Worker.
                const code = v.error && v.error.code;
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                let msg = 'Video ini memakai codec yang tidak didukung browser Anda dan tidak bisa diputar langsung.';
                if (code === 4 && isSafari) {
                    msg = 'Video gagal diputar di Safari. Ini sering terjadi karena server streaming belum mendukung "Range request" (dibutuhkan Safari, tapi tidak selalu oleh browser lain) -- bukan berarti codec videonya pasti tidak didukung.';
                }
                container.innerHTML = `<div style="color:#fff;text-align:center;max-width:420px;"><span class="material-symbols-rounded" style="font-size:48px;">movie_off</span><p style="margin-top:10px;font-size:13px;">${msg}</p><button class="btn-primary" style="margin-top:14px;padding:8px 18px;" onclick="downloadSelectedFile()">Download Berkas</button></div>`;
            });
            initCustomVideoPlayer(v);
            return;
        }
        if (AUDIO_EXTENSIONS.has(ext)) { drawAudioWave(container,url); return; }
        if (ext==='pdf') {
            if(!window.pdfjsLib) throw new Error('PDF.js belum tersedia');
            const data=new Uint8Array(await blob.arrayBuffer()); const pdf=await pdfjsLib.getDocument({data}).promise;
            container.innerHTML='<div id="pdf-pages" style="width:100%; height:auto; max-height:85vh; overflow:auto; text-align:center; padding:10px;"></div>';
            const host=document.getElementById('pdf-pages');
            for(let i=1;i<=pdf.numPages;i++){
                const page=await pdf.getPage(i);
                const vp=page.getViewport({scale:2.0}); // Skala 2x dipertahankan untuk zoom HD
                const c=document.createElement('canvas'); 
                c.width=vp.width; c.height=vp.height; 
                c.style.maxWidth='100%'; c.style.height='auto'; c.style.margin='0 auto 16px';
                host.appendChild(c);
                await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
            }
            return;
        }
        if (['xlsx','xls','xlsm','csv','ods'].includes(ext)) {
            if(!window.XLSX) throw new Error('SheetJS belum tersedia'); const wb=XLSX.read(await blob.arrayBuffer(),{type:'array'});
            // Tabel tetap memiliki background putih lokal agar tidak tembus warna hitamnya
            container.innerHTML='<div class="preview-table" id="preview-sheet" style="width:100%; height:auto; max-height:85vh; overflow:auto; padding:16px;"></div>'; const host=document.getElementById('preview-sheet');
            wb.SheetNames.forEach((name,idx)=>{const title=document.createElement('h4');title.textContent=name;title.style.margin='0 0 8px';host.appendChild(title);const table=XLSX.utils.sheet_to_html(wb.Sheets[name],{editable:false});host.insertAdjacentHTML('beforeend',table);if(idx<wb.SheetNames.length-1)host.insertAdjacentHTML('beforeend','<hr style="margin:16px 0;border:0;border-top:1px solid #cbd5e1">');}); return;
        }
        if (ext==='docx' && window.docx) { 
            // File Word dibiarkan background putih agar mirip kertas
            container.innerHTML='<div id="docx-host" style="width:100%; height:auto; max-height:85vh; overflow:auto; background:#fff; color:#111; padding:20px; border-radius:10px;"></div>'; 
            await docx.renderAsync(blob,document.getElementById('docx-host')); return; 
        }
        if (CODE_EXTENSIONS.has(ext) || String(blob.type).startsWith('text/')) {
            const text=await blob.text(); 
            // Preview kode kembali ke background gelap bawaan (diambil dari style CSS)
            container.innerHTML=`<pre class="preview-code" style="width:100%; height:auto; max-height:85vh; overflow:auto; padding:16px; font-size:15px; border-radius:8px;"><code class="language-${escapeHtml(ext||'plaintext')}">${escapeHtml(text)}</code></pre>`; 
            if(window.hljs) hljs.highlightElement(container.querySelector('code')); return;
        }
        if (['pptx','ppt','odp'].includes(ext)) { container.innerHTML='<div style="color:#fff;text-align:center;max-width:520px;padding:20px;">Format presentasi ini belum dapat dirender penuh di browser. Silakan download untuk membuka dengan aplikasi presentasi.</div>'; return; }
        
        container.innerHTML=`<div style="color:#fff;text-align:center;max-width:520px;padding:20px;"><span class="material-symbols-rounded" style="font-size:54px;">draft</span><p style="margin-top:12px">Preview untuk <b>.${escapeHtml(ext||'file')}</b> belum didukung browser.</p></div>`;
    } catch(e) { container.innerHTML=`<div style="color:#ef4444;text-align:center;padding:24px;">Gagal memuat preview: ${escapeHtml(e.message)}</div>`; }
}

// ==========================================
// CUSTOM VIDEO PLAYER (ganti Plyr)
// Player video sendiri: play/pause, volume, timeline geser + durasi.
// Video-nya sendiri tetap di-stream lewat Cloudflare Worker seperti
// sebelumnya -- yang diganti cuma UI kontrolnya.
// ==========================================
function buildCustomVideoPlayerHTML(src) {
    return `
    <div class="custom-video-player" id="custom-video-wrap">
        <video id="preview-video" class="preview-media" playsinline preload="metadata" src="${src}"></video>
        <div class="video-center-btn" id="video-center-btn"><span class="material-symbols-rounded">play_arrow</span></div>
        <div class="video-spinner" id="video-spinner" style="display:none;"><span class="spinner"></span></div>
        <div class="video-controls-bar" id="video-controls-bar">
            <div class="video-seek-wrap" id="video-seek-wrap">
                <div class="video-seek-buffered" id="video-seek-buffered"></div>
                <div class="video-seek-played" id="video-seek-played"></div>
                <div class="video-seek-handle" id="video-seek-handle"></div>
            </div>
            <div class="video-controls-row">
                <button type="button" class="video-ctrl-btn" id="video-btn-play" title="Play/Pause"><span class="material-symbols-rounded">play_arrow</span></button>
                <span class="video-time" id="video-time-current">00:00</span>
                <span class="video-time-sep">/</span>
                <span class="video-time" id="video-time-duration">00:00</span>
                <div class="video-ctrl-spacer"></div>
                <button type="button" class="video-ctrl-btn" id="video-btn-mute" title="Bisukan"><span class="material-symbols-rounded">volume_up</span></button>
                <input type="range" id="video-volume" class="video-volume-slider" min="0" max="1" step="0.01" value="1" title="Volume">
                <button type="button" class="video-ctrl-btn" id="video-btn-fullscreen" title="Layar Penuh"><span class="material-symbols-rounded">fullscreen</span></button>
            </div>
        </div>
    </div>`;
}

function formatVideoTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function initCustomVideoPlayer(video) {
    const wrap = document.getElementById('custom-video-wrap');
    if (!wrap || !video) return;
    const seekWrap = document.getElementById('video-seek-wrap');
    const seekPlayed = document.getElementById('video-seek-played');
    const seekBuffered = document.getElementById('video-seek-buffered');
    const seekHandle = document.getElementById('video-seek-handle');
    const btnPlay = document.getElementById('video-btn-play');
    const btnMute = document.getElementById('video-btn-mute');
    const btnFullscreen = document.getElementById('video-btn-fullscreen');
    const volumeSlider = document.getElementById('video-volume');
    const timeCurrent = document.getElementById('video-time-current');
    const timeDuration = document.getElementById('video-time-duration');
    const centerBtn = document.getElementById('video-center-btn');
    const spinner = document.getElementById('video-spinner');
    const controlsBar = document.getElementById('video-controls-bar');

    const setPlayIcon = (isPlaying) => {
        btnPlay.innerHTML = `<span class="material-symbols-rounded">${isPlaying ? 'pause' : 'play_arrow'}</span>`;
        centerBtn.innerHTML = `<span class="material-symbols-rounded">${isPlaying ? 'pause' : 'play_arrow'}</span>`;
    };
    const togglePlay = () => { if (video.paused || video.ended) video.play().catch(()=>{}); else video.pause(); };

    btnPlay.addEventListener('click', togglePlay);
    centerBtn.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);

    video.addEventListener('play', () => { setPlayIcon(true); wrap.classList.add('is-playing'); });
    video.addEventListener('pause', () => { setPlayIcon(false); wrap.classList.remove('is-playing'); });
    video.addEventListener('waiting', () => { spinner.style.display = 'flex'; });
    video.addEventListener('playing', () => { spinner.style.display = 'none'; });
    video.addEventListener('canplay', () => { spinner.style.display = 'none'; });

    video.addEventListener('loadedmetadata', () => { timeDuration.innerText = formatVideoTime(video.duration); });
    video.addEventListener('timeupdate', () => {
        if (!video.duration) return;
        const pct = (video.currentTime / video.duration) * 100;
        seekPlayed.style.width = pct + '%';
        seekHandle.style.left = pct + '%';
        timeCurrent.innerText = formatVideoTime(video.currentTime);
    });
    video.addEventListener('progress', () => {
        if (!video.duration || video.buffered.length === 0) return;
        try {
            const end = video.buffered.end(video.buffered.length - 1);
            seekBuffered.style.width = Math.min(100, (end / video.duration) * 100) + '%';
        } catch (e) {}
    });
    video.addEventListener('ended', () => { setPlayIcon(false); wrap.classList.remove('is-playing'); });

    // --- Timeline: klik & geser (mouse + touch) untuk seek ---
    let isScrubbing = false;
    const seekToClientX = (clientX) => {
        if (!video.duration) return;
        const rect = seekWrap.getBoundingClientRect();
        let ratio = (clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        video.currentTime = ratio * video.duration;
        seekPlayed.style.width = (ratio * 100) + '%';
        seekHandle.style.left = (ratio * 100) + '%';
        timeCurrent.innerText = formatVideoTime(ratio * video.duration);
    };
    seekWrap.addEventListener('mousedown', (e) => { isScrubbing = true; seekToClientX(e.clientX); e.preventDefault(); });
    seekWrap.addEventListener('touchstart', (e) => { isScrubbing = true; seekToClientX(e.touches[0].clientX); }, { passive: true });
    window.addEventListener('mousemove', (e) => { if (isScrubbing) seekToClientX(e.clientX); });
    window.addEventListener('touchmove', (e) => { if (isScrubbing) seekToClientX(e.touches[0].clientX); }, { passive: true });
    window.addEventListener('mouseup', () => { isScrubbing = false; });
    window.addEventListener('touchend', () => { isScrubbing = false; });

    // --- Volume ---
    btnMute.addEventListener('click', () => {
        video.muted = !video.muted;
        btnMute.innerHTML = `<span class="material-symbols-rounded">${video.muted || video.volume === 0 ? 'volume_off' : 'volume_up'}</span>`;
        if (!video.muted && video.volume === 0) { video.volume = 1; volumeSlider.value = 1; }
    });
    volumeSlider.addEventListener('input', () => {
        video.volume = parseFloat(volumeSlider.value);
        video.muted = video.volume === 0;
        btnMute.innerHTML = `<span class="material-symbols-rounded">${video.muted ? 'volume_off' : 'volume_up'}</span>`;
    });

    // --- Fullscreen ---
    btnFullscreen.addEventListener('click', () => {
        if (document.fullscreenElement) { document.exitFullscreen().catch(()=>{}); }
        else if (wrap.requestFullscreen) { wrap.requestFullscreen().catch(()=>{}); }
        else if (video.webkitEnterFullscreen) { video.webkitEnterFullscreen(); } // fallback iOS Safari
    });

    // --- Auto-hide control bar saat video sedang diputar & idle ---
    let hideTimer = null;
    const showControls = () => {
        wrap.classList.add('show-controls');
        clearTimeout(hideTimer);
        if (!video.paused) hideTimer = setTimeout(() => wrap.classList.remove('show-controls'), 2800);
    };
    wrap.addEventListener('mousemove', showControls);
    wrap.addEventListener('touchstart', showControls, { passive: true });
    video.addEventListener('play', showControls);
    showControls();
}

async function getOwnerFileBlob(fileId, onProgress, signal) {
    const res=await callGasAPI('get_chunks',{fileId,ownerId:currentOwnerId}); if(!res||!res.success) throw new Error((res&&res.message)||'Metadata file tidak ditemukan.');
    let chunks=res.data; if(typeof chunks==='string') chunks=JSON.parse(chunks); chunks.sort((a,b)=>a.part-b.part);
    const parts=await reconstructFileParts(chunks,onProgress,signal); return new Blob(parts);
}
function previewFile(fileId, format, displayName) {
    // 1. Tentukan antrean berdasarkan lokasi saat ini (Folder, Beranda, atau Sampah)
    let currentViewData = [];
    if (currentTab === 'trash') {
        const trashedFolderPaths = new Set((stateArray.trash || []).filter(f => f.format === 'sys_folder').map(f => f.id));
        currentViewData = (stateArray.trash || []).filter(f => !isInsideTrashedFolder(f.folder, trashedFolderPaths));
    } else if (currentTab === 'files') {
        currentViewData = stateArray.active || [];
    } else {
        // Untuk 'home' atau 'folders', ambil file yang foldernya sama dengan path saat ini
        currentViewData = (stateArray.active || []).filter(f => (f.folder && f.folder !== "#*null*#" ? f.folder : '') === currentPath);
    }
    
    // 2. Singkirkan tipe folder dari antrean geser layar
    previewQueue = currentViewData.filter(f => f.format !== 'sys_folder');
    currentPreviewIndex = previewQueue.findIndex(f => f.id === fileId);

    if (currentPreviewIndex === -1) return; // Fallback jika tidak ditemukan

    document.getElementById('preview-modal').style.display = 'flex';
    enableNativeZoom(); 
    loadPreviewItem(currentPreviewIndex);
}


async function loadPreviewItem(index) {
    // Batalkan proses loading file sebelumnya secara instan jika ada
    if(globalAbortController) {
        globalAbortController.abort();
    }
    const controller = new AbortController(); 
    globalAbortController = controller;

    currentPreviewIndex = index;
    const item = previewQueue[index];
    const format = item.format;
    const ext = (format || '').toLowerCase();
    
    let displayName = item.name;
    if (ext && !displayName.toLowerCase().endsWith('.' + ext)) displayName += '.' + ext;

    // Update Teks Judul (1 baris) & Nama Folder
    const titleEl = document.getElementById('preview-filename');
    titleEl.innerText = displayName;
    titleEl.title = displayName;
    titleEl.style.whiteSpace = 'nowrap';
    titleEl.style.overflow = 'hidden';
    titleEl.style.textOverflow = 'ellipsis';
    titleEl.style.display = 'block';

    let fText = item.folder && item.folder !== "#*null*#" ? `Folder: ${item.folder.split('/').pop()}` : 'Beranda';
    if(currentTab === 'trash') fText = 'Di Dalam Sampah';
    document.getElementById('preview-folder-info').innerHTML = `<span class="material-symbols-rounded" style="font-size: 14px;">${currentTab === 'trash' ? 'delete' : 'folder'}</span> ${escapeHtml(fText)}`;

    // Update Tombol Aksi
    const actionContainer = document.getElementById('preview-action-btns');
    if (currentTab === 'trash') {
        actionContainer.innerHTML = `
            <button class="icon-btn" onclick="previewActionRestore('${item.id}')" title="Pulihkan Berkas"><span class="material-symbols-rounded" style="color:#34d399;">restore</span></button>
            <button class="icon-btn" onclick="previewActionPermDelete('${item.id}')" title="Hapus Permanen"><span class="material-symbols-rounded" style="color:var(--danger);">delete_forever</span></button>
        `;
    } else {
        actionContainer.innerHTML = `
            <button class="icon-btn" onclick="previewActionDownload('${item.id}')" title="Download"><span class="material-symbols-rounded" style="color:#fff;">download</span></button>
            <button class="icon-btn" onclick="previewActionTrash('${item.id}')" title="Pindah ke Sampah"><span class="material-symbols-rounded" style="color:var(--danger);">delete</span></button>
        `;
    }

    updatePreviewNavButtons(index, previewQueue.length);
    clearPreviewCache();
    const c = document.getElementById('preview-container');

    const isSupported = IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext) || ['pdf','xlsx','xls','xlsm','csv','ods','docx'].includes(ext);

    if (!isSupported) {
        c.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#fff; text-align:center; padding:20px; min-height: 250px;">
            <span class="material-symbols-rounded" style="font-size:64px; color:var(--text-muted);">draft</span>
            <h3 style="margin-top:16px; font-size:18px;">Format tidak disupport</h3>
            <p style="margin-top:8px; font-size:14px; color:var(--text-muted); max-width:400px;">File <b>.${escapeHtml(ext||'file')}</b> tidak dapat dipreview. Gunakan tombol navigasi untuk melihat file selanjutnya.</p>
        </div>`;
        return; 
    }

    previewLoading(c, 'Menyiapkan preview...', 0);
    
    try { 
        // 1. JIKA FILE ADALAH VIDEO / AUDIO (Pakai Metode Streaming Cloudflare)
        if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) {
            const res = await callGasAPI('get_chunks', { fileId: item.id, ownerId: currentOwnerId });
            if (!res || !res.success) throw new Error(res.message || 'Metadata file tidak ditemukan.');
            let chunks = res.data; if (typeof chunks === 'string') chunks = JSON.parse(chunks); 
            chunks.sort((a, b) => a.part - b.part);

            previewLoading(c, 'Menghubungkan ke server streaming...', 100);
            
            // Dapatkan URL Telegram lalu lempar ke Worker Proxy
            const directUrls = await getDirectTelegramUrls(chunks, controller.signal);
            
            // Perbaikan krusial: encodeURIComponent membungkus Base64 agar karakter '+' aman!
            const encodedUrls = encodeURIComponent(btoa(JSON.stringify(directUrls)));
            const mime = mimeFromExt(ext);
            const activeWorker = getRandomWorker();
            
            const streamUrl = `${activeWorker}/stream?token=${WORKER_PASSWORD}&size=${item.size}&mime=${encodeURIComponent(mime)}&urls=${encodedUrls}`;

            await renderPreviewContent(streamUrl, format, c, null);
        } 
        // 2. JIKA FILE SELAIN VIDEO/AUDIO (Unduh dan Tampilkan Biasa)
        else {
            let blob;
            if (IMAGE_EXTENSIONS.has(ext) && item.thumbId) {
                const pathBlob = await fetchBinaryWithFallback(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${item.thumbId}`);
                const pathText = await pathBlob.text();
                const pathData = JSON.parse(pathText);
                if (pathData.result) {
                    const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${pathData.result.file_path}`;
                    const rawBlob = await fetchBinaryWithFallback(url, (p)=>{
                        if (controller.signal.aborted) return;
                        const b = document.getElementById('preview-progress-bar'), t = document.getElementById('preview-progress-text');
                        if(b) b.style.width = p + '%';
                        if(t) t.innerText = p + '%';
                    }, controller.signal);
                    blob = new Blob([rawBlob], { type: 'image/webp' });
                }
            }
            
            if (!blob) {
                blob = await getOwnerFileBlob(item.id, (p)=>{
                    if (controller.signal.aborted) return;
                    const b = document.getElementById('preview-progress-bar'), t = document.getElementById('preview-progress-text');
                    if(b) b.style.width = p + '%';
                    if(t) t.innerText = p + '%';
                }, controller.signal); 
            }
            
            const u = trackPreviewUrl(URL.createObjectURL(blob)); 
            await renderPreviewContent(u, format, c, blob); 
        }
    }
    catch(e){
        // Sembunyikan pesan gagal jika disebabkan oleh navigasi/skip (Dibatalkan)
        if(e.name !== 'AbortError' && !e.message.includes('Dibatalkan')) {
            c.innerHTML = `<div style="color:#ef4444;text-align:center;padding:24px;">Gagal memuat preview: ${escapeHtml(e.message)}</div>`;
        }
    }
    finally {
        if(globalAbortController === controller) globalAbortController = null;
    }
}
async function loadSharedCardThumbnail(file, ext, containerId, shareId, viewerUid) {
    try {
        let fetchId = file.thumbId || null;
        if (!fetchId && !['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            const ownerIdForChunks = (pendingShareResolved && pendingShareResolved.ownerId) || (sharedRootItem && sharedRootItem.ownerId);
            const res = await getSharedFileChunks(file.id, ownerIdForChunks, shareId, viewerUid).catch(() => null);
            if (res && res.success && res.data && res.data.length > 0) fetchId = res.data[0].telegramFileId;
        }
        if (!fetchId) return;
        const pathBlob = await fetchBinaryWithFallback(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fetchId}`);
        const pathText = await pathBlob.text();
        const pathData = JSON.parse(pathText);
        if (!pathData.result) return;
        const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${pathData.result.file_path}`;
        applyThumbToContainer(url, ext, containerId);
    } catch (e) {}
}

function openSharedFilePreviewModal(item, shareId, viewerUid) {
    // Hanya masukkan ke antrean file-file yang berada di dalam folder share ini saja
    sharedPreviewQueue = sharedContentsCache.files || [];
    if(sharedPreviewQueue.length === 0) sharedPreviewQueue = [item];
    
    currentSharedPreviewIndex = sharedPreviewQueue.findIndex(f => f.id === item.id);
    
    if (currentSharedPreviewIndex === -1) return;

    document.getElementById('preview-modal').style.display = 'flex';
    enableNativeZoom(); 
    loadSharedPreviewItem(currentSharedPreviewIndex, shareId, viewerUid);
}


async function loadSharedPreviewItem(index, shareId, viewerUid) {
    if(globalAbortController) {
        globalAbortController.abort();
    }
    const controller = new AbortController(); 
    globalAbortController = controller;

    currentSharedPreviewIndex = index;
    const item = sharedPreviewQueue[index];
    const format = item.format;
    const ext = (format || '').toLowerCase();

    let displayName = item.name;
    if (ext && !displayName.toLowerCase().endsWith('.' + ext)) displayName += '.' + ext;

    const titleEl = document.getElementById('preview-filename');
    titleEl.innerText = displayName;
    titleEl.title = displayName;
    titleEl.style.whiteSpace = 'nowrap';
    titleEl.style.overflow = 'hidden';
    titleEl.style.textOverflow = 'ellipsis';
    titleEl.style.display = 'block';

    document.getElementById('preview-folder-info').innerHTML = `<span class="material-symbols-rounded" style="font-size: 14px;">cloud</span> Tautan Berbagi Bersama`;

    document.getElementById('preview-action-btns').innerHTML = `
        <button class="icon-btn" onclick="previewActionSharedDownload('${item.id}')" title="Download"><span class="material-symbols-rounded" style="color:#fff;">download</span></button>
    `;

    updatePreviewNavButtons(index, sharedPreviewQueue.length);
    clearPreviewCache();
    const c = document.getElementById('preview-container');

    const isSupported = IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext) || ['pdf','xlsx','xls','xlsm','csv','ods','docx'].includes(ext);

    if (!isSupported) {
        c.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#fff; text-align:center; padding:20px; min-height: 250px;">
            <span class="material-symbols-rounded" style="font-size:64px; color:var(--text-muted);">draft</span>
            <h3 style="margin-top:16px; font-size:18px;">Format tidak disupport</h3>
            <p style="margin-top:8px; font-size:14px; color:var(--text-muted); max-width:400px;">File <b>.${escapeHtml(ext||'file')}</b> tidak dapat dipreview. Gunakan tombol navigasi untuk file selanjutnya.</p>
        </div>`;
        return; 
    }

    previewLoading(c, 'Menyiapkan preview...', 0);
    
    try {
        const ownerIdForChunks = (pendingShareResolved && pendingShareResolved.ownerId) || (sharedRootItem && sharedRootItem.ownerId);
        const chunkRes = await getSharedFileChunks(item.id, ownerIdForChunks, shareId, viewerUid);
        if (!chunkRes.success) throw new Error(chunkRes.message || 'Gagal memuat.');
        let chunks = chunkRes.data; if (typeof chunks === 'string') chunks = JSON.parse(chunks);
        chunks.sort((a, b) => a.part - b.part);

        // 1. JIKA FILE ADALAH VIDEO / AUDIO (Pakai Metode Streaming Cloudflare)
        if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) {
            previewLoading(c, 'Menghubungkan ke server streaming...', 100);
            
            const directUrls = await getDirectTelegramUrls(chunks, controller.signal);
            
            // Perbaikan krusial: encodeURIComponent membungkus Base64 agar karakter '+' aman!
            const encodedUrls = encodeURIComponent(btoa(JSON.stringify(directUrls)));
            const mime = mimeFromExt(ext);
            const activeWorker = getRandomWorker();
            
            const streamUrl = `${activeWorker}/stream?token=${WORKER_PASSWORD}&size=${item.size}&mime=${encodeURIComponent(mime)}&urls=${encodedUrls}`;

            await renderPreviewContent(streamUrl, format, c, null);
        }
        // 2. JIKA FILE SELAIN VIDEO/AUDIO
        else {
            const parts = await reconstructFileParts(chunks, (p) => {
                if (controller.signal.aborted) return;
                const b = document.getElementById('preview-progress-bar'), t = document.getElementById('preview-progress-text');
                if(b) b.style.width = p + '%';
                if(t) t.innerText = p + '%';
            }, controller.signal);
            
            const blob = new Blob(parts, { type: mimeFromExt(item.format) });
            const url = URL.createObjectURL(blob);
            await renderPreviewContent(url, item.format, c, blob);
        }
    } catch (e) { 
        if(e.name !== 'AbortError' && !e.message.includes('Dibatalkan')) {
            c.innerHTML = `<div style="color:#ef4444; text-align:center; padding:24px;">Gagal memuat: ${escapeHtml(e.message)}</div>`; 
        }
    } finally {
        if(globalAbortController === controller) globalAbortController = null;
    }
}
// Bug lama: tombol close di preview-modal & alur shared-polling memanggil
// closePreviewModal() tapi fungsinya tidak pernah didefinisikan (ReferenceError).
function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.style.display = 'none';
    if (globalAbortController) { try { globalAbortController.abort(); } catch(e) {} globalAbortController = null; }
    clearPreviewCache();
    disableNativeZoom(); // KEMBALIKAN KUNCI ZOOM SAAT DITUTUP
}

function clearPreviewCache() {
    previewObjectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch(e) {} });
    previewObjectUrls.clear();
    const c = document.getElementById('preview-container'); if (c) c.innerHTML = '';
}

function exitSharedView() {
    stopSharedPolling();
    closePreviewModal();
    hideSharedUploadFab();
    document.getElementById('shared-view').style.display = 'none';
    document.getElementById('share-login-prompt').style.display = 'none';
    sharedLoginPromptDismissed = false;
    const ownerIdToRestore = preShareOwnerId;
    pendingShareCode = null; pendingShareResolved = null; sharedRootItem = null; sharedCurrentPath = '';
    sharedViewerUid = ''; preShareOwnerId = ''; preShareUser = '';
    window.history.replaceState({}, document.title, location.origin + location.pathname);

    const acc = accountsList.find(a => a.ownerId === ownerIdToRestore) || getActiveStoredAccount();
    if (acc) {
        setActiveAccount(acc);
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('app-layout').style.display = 'flex';
        renderUI();
        syncData(); startSharedWithMePolling();
    } else {
        document.getElementById('app-layout').style.display = 'none';
        showLoginView(false);
        switchAuthView('sec-login');
    }
}

function togglePassword(icon, inputId) {
    const input = document.getElementById(inputId);
    if (!input || !icon) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    icon.innerText = visible ? 'visibility' : 'visibility_off';
    icon.style.color = visible ? 'var(--primary)' : 'var(--text-muted)';
    icon.setAttribute('aria-label', visible ? 'Sembunyikan password' : 'Tampilkan password');
}

function openRenameFolderModal() {
    closeFolderOptions();
    document.getElementById('rename-folder-input').value = selectedFolderForAction.split('/').pop();
    document.getElementById('rename-folder-modal').style.display = 'flex';
}
function closeRenameFolderModal() { document.getElementById('rename-folder-modal').style.display = 'none'; }

async function executeRenameFolder() {
    let newName = document.getElementById('rename-folder-input').value.trim();
    if (!newName) return showToast("Nama tidak boleh kosong.", true);
    
    const oldPath = selectedFolderForAction;
    const oldName = oldPath.split('/').pop();
    if (newName === oldName) return closeRenameFolderModal();

    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    closeRenameFolderModal();
    showLoadingOverlay("Mengganti nama folder...", false, false);
    const res = await callGasAPI('rename_folder_dir', { oldPath: oldPath, newPath: newPath, ownerId: currentOwnerId });
    hideLoadingOverlay();
    
    if (res && res.success !== false) {
        if (stateArray.folders) stateArray.folders.forEach(f => {
            if (f.path === oldPath) f.path = newPath;
            else if (f.path.startsWith(oldPath + '/')) f.path = f.path.replace(oldPath, newPath);
        });
        if (stateArray.active) stateArray.active.forEach(f => {
            if (f.folder === oldPath) f.folder = newPath;
            else if (f.folder && f.folder.startsWith(oldPath + '/')) f.folder = f.folder.replace(oldPath, newPath);
        });
        markRecentWrite(currentOwnerId); // FIX: cegah polling gviz basi menimpa balik hasil rename
        lastDataSignature = JSON.stringify(stateArray); // biar polling gak anggap ini "beda" pas cooldown selesai
        renderUI();
        showToast("Nama folder berhasil diganti!", false);
    } else { showToast((res && res.message) || "Gagal mengganti nama folder.", true); }
}

async function downloadFolderAsZipOwner() {
    closeFolderOptions();
    const folderPath = selectedFolderForAction;
    const folderName = folderPath.split('/').pop();
    if (!window.JSZip) return showToast("Gagal memuat pustaka ZIP.", true);

    const fileList = [];
    stateArray.active.forEach(f => {
        if (f.folder === folderPath || (f.folder && f.folder.startsWith(folderPath + '/'))) {
            let relPath = f.folder === folderPath ? '' : f.folder.substring(folderPath.length + 1) + '/';
            const ext = f.format ? '.' + f.format : '';
            fileList.push({ id: f.id, name: f.name + ext, relPath: relPath + f.name + ext });
        }
    });

    if (fileList.length === 0) return showToast("Folder kosong.", true);

    showLoadingOverlay(`Menyiapkan ZIP "${folderName}"...`, true, true);
    globalAbortController = new AbortController();
    const zip = new JSZip();
    let n = 0;

    try {
        for (const f of fileList) {
            if (globalAbortController.signal.aborted) throw new Error("Dibatalkan");
            n++;
            updateLoadingOverlay(Math.round(n / fileList.length * 90), `Mengunduh file (${n}/${fileList.length})...`);
            
            const chunkRes = await callGasAPI('get_chunks', { fileId: f.id, ownerId: currentOwnerId });
            if (!chunkRes.success) continue;
            let chunks = chunkRes.data; if (typeof chunks === 'string') chunks = JSON.parse(chunks);
            chunks.sort((a, b) => a.part - b.part);
            const parts = await reconstructFileParts(chunks, null, globalAbortController.signal);
            zip.file(f.relPath, new Blob(parts));
        }
        updateLoadingOverlay(95, "Membungkus ZIP...");
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const url = URL.createObjectURL(zipBlob);
        hideLoadingOverlay();
        const a = document.createElement('a'); a.href = url; a.download = folderName + '.zip';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 20000);
    } catch (e) {
        hideLoadingOverlay();
        if (e.message !== "Dibatalkan") showToast("Gagal membuat ZIP.", true);
    }
}

async function getSharedDataFromSheets(shareCode, viewerUid, subPath = null, forceLive = false) {
    try {
        // forceLive: lewati gviz SAMA SEKALI, langsung ke GAS (baca Spreadsheet
        // live, bukan snapshot cache Google). Dipakai oleh startSharedPolling
        // untuk memastikan data benar2 ter-refresh secara berkala, bukan cuma
        // menunggu cache gviz kedaluwarsa sendiri (yang bisa sampai puluhan
        // detik dan kadang PERNAH kelihatan "sukses" walau isinya masih basi --
        // itu yang bikin rename kelihatan gak pernah ke-update walau ditunggu).
        if (forceLive) {
            return await callGasAPIFetch('resolve_share', { shareId: shareCode, viewerUid: viewerUid, subPath: subPath });
        }

        // FIX: kalau share ini baru saja diubah (privasi/dll) dalam masa tenang,
        // gviz kemungkinan besar masih basi -- langsung ke GAS yang selalu fresh,
        // biar halaman /?share=xxx gak nampilin privasi/isi yang sudah usang.
        if (isInGvizCooldown(shareCode)) {
            return await callGasAPIFetch('resolve_share', { shareId: shareCode, viewerUid: viewerUid, subPath: subPath });
        }

        const raw = await fetchRawSheets().catch(() => null);

        if (raw && raw.sharesRows && raw.sharesRows.length > 0) {
            const shareRow = raw.sharesRows.find(r => String(r[0] || '').trim() === String(shareCode || '').trim());
            if (!shareRow) {
                // FIX BUG "404 PALSU SAAT RENAME": dulu begitu gviz gak nemu baris
                // share-nya, LANGSUNG divonis "link tidak valid/dihapus" dan
                // ditampilkan ke viewer manapun yang lagi buka -- padahal ini
                // sering cuma race gviz yang belum sinkron pas pemilik baru saja
                // rename folder/ubah privasi (linknya sendiri sebenarnya masih
                // ada). Sekarang sebelum divonis hilang, dikonfirmasi dulu lewat
                // GAS (selalu baca live, gak ada cache) -- baru kalau GAS JUGA
                // bilang gak ada, baru itu beneran dianggap hilang.
                return await callGasAPIFetch('resolve_share', { shareId: shareCode, viewerUid: viewerUid, subPath: subPath });
            }

            const itemId = String(shareRow[1] || '').trim();
            const itemType = String(shareRow[2] || '').trim().toLowerCase();
            const ownerId = String(shareRow[3] || '').trim();
            const ownerName = String(shareRow[4] || '').trim();
            const privacy = String(shareRow[5] || 'private').trim();
            let allowedUsers = [];
            try { allowedUsers = JSON.parse(shareRow[6] || '[]'); } catch(e){}
            const linkRole = String(shareRow[9] || 'view').trim();

            // =========================================================
            // VALIDASI EKSISTENSI (Biar langsung 404 kalau masuk sampah)
            // =========================================================
            let activeItemRow = null;
            if (itemType === 'file') {
                activeItemRow = raw.sheet1Rows.find(r => String(r[0] || '').trim() === itemId && String(r[8] || '').trim() === ownerId);
            } else if (itemType === 'folder') {
                activeItemRow = raw.folderRows.find(r => String(r[0] || '').trim() === itemId && String(r[1] || '').trim() === ownerId);
            }

            if (!activeItemRow) {
                // FIX BUG "404 PALSU SAAT RENAME" (lanjutan): sama seperti di atas --
                // ini titik yang PERSIS memicu gambar "404 -- Tidak Ditemukan" yang
                // kamu lihat pas rename folder. itemId di baris share masih pakai
                // path LAMA sesaat, sementara folderRows dari gviz mungkin baru
                // separuh ter-update (race), jadi kelihatan "gak ketemu" padahal
                // linknya utuh. Konfirmasi dulu ke GAS sebelum vonis dihapus.
                const liveConfirm = await callGasAPIFetch('resolve_share', { shareId: shareCode, viewerUid: viewerUid, subPath: subPath });
                if (liveConfirm && liveConfirm.success) return liveConfirm; // ternyata masih ada -- gviz-nya doang yang basi

                // GAS juga bilang gak ada -- baru di sini beneran dianggap hilang.
                // Item tidak ada lagi di data aktif -- cek dulu apakah masih ada
                // di Sampah (baru ditrash) atau sudah benar-benar hilang (dihapus
                // permanen), supaya pemiliknya bisa diarahkan dengan tepat.
                let trashItemRow = null;
                if (itemType === 'file') {
                    trashItemRow = raw.trashRows.find(r => String(r[0] || '').trim() === itemId && String(r[9] || '').trim() === ownerId);
                } else if (itemType === 'folder') {
                    trashItemRow = raw.trashRows.find(r => String(r[0] || '').trim() === itemId && String(r[3] || '').trim() === 'sys_folder' && String(r[9] || '').trim() === ownerId);
                }
                return {
                    success: false, deleted: true, ownerId, ownerName, itemType,
                    inTrash: !!trashItemRow,
                    item: trashItemRow ? { id: trashItemRow[0], name: trashItemRow[1], format: trashItemRow[3], folder: trashItemRow[4] } : null
                };
            }

            let authorized = true;
            if (privacy === 'private' && String(viewerUid || '').trim() !== ownerId) authorized = false;
            if (privacy === 'restricted' && String(viewerUid || '').trim() !== ownerId && !allowedUsers.some(u => String(u.uid).trim() === String(viewerUid || '').trim())) authorized = false;

            if (!authorized) return { success: true, authorized: false, privacy, ownerId, ownerName };

            const trimmedViewerUid = String(viewerUid || '').trim();
            let role = 'view';
            if (privacy === 'link') role = linkRole === 'edit' ? 'edit' : 'view';
            else if (privacy === 'restricted') {
                const match = allowedUsers.find(u => String(u.uid).trim() === trimmedViewerUid);
                role = (match && match.role === 'edit') ? 'edit' : 'view';
            }

            // Jika item adalah File
            if (itemType === 'file') {
                return {
                    success: true, authorized: true, itemType: 'file', ownerId, ownerName, privacy, role,
                    item: { id: activeItemRow[0], name: activeItemRow[1], originalName: activeItemRow[2], format: activeItemRow[3], folder: activeItemRow[4], size: activeItemRow[5], thumbId: activeItemRow[6] }
                };
            }

            // Jika item adalah Folder
            const rootPath = itemId;
            const currentBrowsePath = (subPath !== null && subPath !== undefined && String(subPath).trim() !== '') ? String(subPath).trim() : rootPath;

            const contents = { subfolders: [], files: [] };
            const allFolders = new Set();

            raw.folderRows.forEach(r => {
                if (String(r[1] || '').trim() === ownerId && r[0]) allFolders.add(String(r[0]).trim());
            });

            raw.sheet1Rows.forEach(r => {
                const fPath = String(r[4] || '').trim();
                if (String(r[8] || '').trim() === ownerId && fPath && fPath !== '#*null*#') {
                    allFolders.add(fPath);
                }
            });

            allFolders.forEach(f => {
                if (f.toLowerCase().startsWith(currentBrowsePath.toLowerCase() + '/') && f.toLowerCase() !== currentBrowsePath.toLowerCase()) {
                    let rel = f.substring(currentBrowsePath.length + 1);
                    let nextSeg = rel.split('/')[0];
                    if (nextSeg) {
                        let fullSub = currentBrowsePath + '/' + nextSeg;
                        if (!contents.subfolders.includes(fullSub)) contents.subfolders.push(fullSub);
                    }
                }
            });

            for (const r of raw.sheet1Rows) {
                let fileFolder = String(r[4] || '').trim();
                if (fileFolder === '#*null*#') fileFolder = '';

                let targetFolder = currentBrowsePath;
                if (targetFolder === '#*null*#') targetFolder = '';

                if (String(r[8] || '').trim() === ownerId && fileFolder.toLowerCase() === targetFolder.toLowerCase()) {
                    contents.files.push({
                        id: String(r[0]),
                        name: String(r[1]),
                        originalName: String(r[2]),
                        format: String(r[3]),
                        folder: r[4],
                        size: r[5],
                        thumbId: r[6]
                    });
                }
            }

            // FIX BUG "ISI FOLDER HILANG SAAT RENAME": root foldernya sendiri
            // sudah dipastikan ADA di pengecekan activeItemRow di atas, tapi
            // daftar ISI-nya (subfolder & file) di sini dibangun dari sheet
            // DB_01 yang dibaca gviz SECARA TERPISAH dari DB_03/DB_05 (yang
            // dipakai memastikan root-nya tadi). Kalau snapshot gviz DB_01
            // kebetulan lebih basi/telat ter-update dibanding DB_03/DB_05
            // (race antar-sheet, sering kejadian tepat setelah rename folder),
            // kolom folder di baris-baris file itu masih path LAMA sesaat --
            // jadi tidak ada satu pun yang cocok dengan currentBrowsePath yang
            // sudah baru, dan folder kelihatan KOSONG padahal isinya utuh di
            // server. Sama seperti pengecekan root di atas: kalau isinya
            // kelihatan kosong, konfirmasi SEKALI ke GAS (live, tanpa cache)
            // dulu sebelum ditampilkan sebagai folder kosong ke viewer.
            if (contents.subfolders.length === 0 && contents.files.length === 0) {
                const liveConfirmEmpty = await callGasAPIFetch('resolve_share', { shareId: shareCode, viewerUid: viewerUid, subPath: subPath });
                if (liveConfirmEmpty && liveConfirmEmpty.success) return liveConfirmEmpty;
                // GAS juga bilang kosong/gagal -- berarti memang beneran kosong, pakai hasil gviz apa adanya.
            }

            // FITUR "SALIN LINK PER-ITEM" (lihat catatan yang sama di
            // backend.gs resolve_share): sertakan share milik sendiri tiap
            // subfolder/file di sini juga, supaya jalur gviz (yang lebih
            // sering dipakai daripada GAS) konsisten dengan jalur GAS.
            const subfolderShares = {}, fileShares = {};
            (raw.sharesRows || []).forEach(r => {
                if (String(r[3] || '').trim() !== ownerId) return;
                const sInfo = { shareId: r[0], privacy: String(r[5] || 'private').trim() };
                const sType = String(r[2] || '').trim().toLowerCase();
                if (sType === 'folder') subfolderShares[String(r[1] || '').trim()] = sInfo;
                else if (sType === 'file') fileShares[String(r[1] || '').trim()] = sInfo;
            });

            return {
                success: true,
                authorized: true,
                itemType: 'folder',
                ownerId: ownerId,
                ownerName: ownerName,
                privacy: privacy,
                role: role,
                item: {
                    path: currentBrowsePath,
                    name: currentBrowsePath.split('/').pop() || 'Beranda',
                    contents: contents,
                    subfolderShares: subfolderShares,
                    fileShares: fileShares
                }
            };
        }

        // Fallback langsung ke GAS jika gviz belum terupdate
        const res = await callGasAPIFetch('resolve_share', { shareId: shareCode, viewerUid: viewerUid, subPath: subPath });
        return res;
    } catch (e) {
        return await callGasAPIFetch('resolve_share', { shareId: shareCode, viewerUid: viewerUid, subPath: subPath });
    }
}


//Next Preview dan Mundur Preview
// PENDETEKSI GESER (SWIPE) UNTUK PREVIEW
let swipeStartX = 0; let swipeStartY = 0; let isPreviewSwiping = false;
// (Boot listener duplikat yang ada di sini sebelumnya sudah dihapus — app di-boot
// sekali saja lewat listener DOMContentLoaded di bagian atas file. Sebelumnya app
// booting 2x setiap kali halaman dibuka: polling dobel, render dobel, request ke
// server dobel — ini penyebab utama "error acak" & perilaku tidak konsisten.)



function updatePreviewNavButtons(index, total) {
    const btnPrev = document.getElementById('btn-prev-preview');
    const btnNext = document.getElementById('btn-next-preview');
    if (btnPrev && btnNext) {
        btnPrev.style.opacity = index > 0 ? '1' : '0.2';
        btnPrev.style.pointerEvents = index > 0 ? 'auto' : 'none';
        btnNext.style.opacity = index < total - 1 ? '1' : '0.2';
        btnNext.style.pointerEvents = index < total - 1 ? 'auto' : 'none';
        
        btnPrev.style.display = total <= 1 ? 'none' : 'flex';
        btnNext.style.display = total <= 1 ? 'none' : 'flex';
    }
}

function navigatePreview(direction) {
    if (pendingShareCode) {
        // Mode Halaman Share
        if (!sharedPreviewQueue || sharedPreviewQueue.length === 0) return;
        let nextIndex = currentSharedPreviewIndex + direction;
        if (nextIndex >= 0 && nextIndex < sharedPreviewQueue.length) {
            loadSharedPreviewItem(nextIndex, pendingShareCode, sharedViewerUid);
        }
    } else {
        // Mode Halaman Akun Pemilik
        if (!previewQueue || previewQueue.length === 0) return;
        let nextIndex = currentPreviewIndex + direction;
        if (nextIndex >= 0 && nextIndex < previewQueue.length) {
            loadPreviewItem(nextIndex);
        }
    }
}

// Aksi Langsung dari Kotak Preview
function previewActionDownload(id) {
    selectedFileForAction = stateArray.active.find(f => f.id === id);
    if(selectedFileForAction) downloadSelectedFile();
}
function previewActionTrash(id) {
    selectedFileForAction = stateArray.active.find(f => f.id === id);
    if(selectedFileForAction) { closePreviewModal(); confirmDeleteIndividualFile(); }
}
function previewActionRestore(id) {
    selectedFileForAction = stateArray.trash.find(f => f.id === id);
    if(selectedFileForAction) { closePreviewModal(); processRestoreIndividualFile(); }
}
function previewActionPermDelete(id) {
    selectedFileForAction = stateArray.trash.find(f => f.id === id);
    if(selectedFileForAction) { closePreviewModal(); confirmPermanentDelete(); }
}
function previewActionSharedDownload(id) {
    const item = sharedPreviewQueue.find(f => f.id === id);
    if(item) {
        let displayName = item.name + (item.format ? '.' + item.format : '');
        downloadSharedFile(item.id, item.format, displayName, pendingShareCode, sharedViewerUid);
    }
}



if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js'); });
}

// ==========================================
// PATCH: SECURITY LAYER (anti klik-kanan, anti-inspect, anti-drag gambar)
// Catatan penting: ini semua bersifat "deterrent" (mempersulit orang awam),
// BUKAN proteksi mutlak. Siapapun yang cukup paham teknis tetap bisa
// mem-bypass ini (matikan JS, lihat Network tab, dsb). Tidak ada satupun
// blok ini yang mengubah logic/fungsi aplikasi yang sudah ada di atas.
// ==========================================
(function () {
    // 1) Blokir klik kanan (kecuali di input/textarea supaya user tetap
    //    bisa klik kanan untuk paste password/username)
    document.addEventListener('contextmenu', function (e) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
    });

    // 2) Cegah gambar/preview di-drag keluar (salah satu cara orang
    //    "seret" gambar ke folder untuk download tanpa klik kanan)
    document.addEventListener('dragstart', function (e) {
        if (e.target.tagName === 'IMG') e.preventDefault();
    });

    // 3) Blokir shortcut keyboard umum untuk buka DevTools / view-source
    document.addEventListener('keydown', function (e) {
        const key = (e.key || '').toUpperCase();
        const blockCombo =
            key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'J' || key === 'C')) ||
            (e.metaKey && e.altKey && (key === 'I' || key === 'J' || key === 'C')) || // Mac
            (e.ctrlKey && key === 'U') ||
            (e.metaKey && key === 'U');
        if (blockCombo) e.preventDefault();
    });

    // 4) Deteksi heuristik saat DevTools kemungkinan terbuka (berdasarkan
    //    selisih ukuran window luar/dalam). Ini TIDAK 100% akurat, jadi
    //    hanya dipakai untuk menampilkan peringatan, bukan menutup app.
    const warningEl = document.getElementById('devtools-warning');
    let devtoolsWasOpen = false;
    function checkDevtools() {
        if (!warningEl) return;
        const threshold = 160;
        const widthDiff = window.outerWidth - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;
        const isOpen = widthDiff > threshold || heightDiff > threshold;
        if (isOpen !== devtoolsWasOpen) {
            devtoolsWasOpen = isOpen;
            warningEl.classList.toggle('show', isOpen);
        }
    }
    setInterval(checkDevtools, 1000);
})();

