var API_KEY = "GwadevingProduction";

// ==========================================
// ENKRIPSI DATA SENSITIF (1 PASSWORD/KEY)
// ==========================================
var CRYPTO_KEY = "TeleCloud$3cur3P@ss2026"; // Kunci disamakan dengan frontend

function encField(str) {
  if (!str) return '';
  try {
    // Mengamankan karakter spesial, emoji, dan spasi sebelum dienkripsi
    var encodedURI = encodeURIComponent(String(str));
    var out = [];
    for (var i = 0; i < encodedURI.length; i++) {
      var xorChar = encodedURI.charCodeAt(i) ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length);
      out.push(xorChar > 127 ? xorChar - 256 : xorChar);
    }
    return Utilities.base64Encode(out);
  } catch (e) { return String(str); }
}

function decField(str) {
  if (!str) return '';
  try {
    var bytes = Utilities.base64Decode(String(str));
    var decodedURI = '';
    for (var i = 0; i < bytes.length; i++) {
      var u = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
      decodedURI += String.fromCharCode(u ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length));
    }
    try {
        return decodeURIComponent(decodedURI);
    } catch(e) {
        // Fallback untuk membaca data lama dari database yang belum ter-encode URI
        var out = [];
        var kb = [];
        for (var k = 0; k < CRYPTO_KEY.length; k++) kb.push(CRYPTO_KEY.charCodeAt(k) & 0xFF);
        for (var i = 0; i < bytes.length; i++) {
            var u = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
            var keyChar = kb[i % kb.length];
            var xu = u ^ keyChar;
            out.push(xu > 127 ? xu - 256 : xu);
        }
        return Utilities.newBlob(out).getDataAsString('UTF-8');
    }
  } catch (e) { return String(str); }
}

// ==========================================
// PATCH: MULTI-SPREADSHEET UNTUK DATA FILE (DB_01 & DB_02)
// Supaya kalau spreadsheet utama kena limit Google (ukuran sel ATAU limit
// baca gviz), file baru otomatis disimpan di spreadsheet cadangan
// berikutnya, dan pencarian file (rename/pindah/hapus/restore/dst) otomatis
// mencari di SEMUA spreadsheet yang terdaftar -- bukan cuma yang utama.
// DB_03 (Folder) / DB_04 (User) / DB_05 (Share) / DB_06 (Viewer) SENGAJA
// tetap di spreadsheet utama saja -- volumenya kecil, gak akan kena limit,
// dan biar bagian login/share yang sensitif gak ikut dirombak.
//
// CARA NAMBAH SPREADSHEET CADANGAN:
//  1. Buat 1 spreadsheet Google Sheets baru (kosong)
//  2. Di editor Apps Script ini, jalankan SEKALI fungsi:
//       setupAdditionalSpreadsheet('ID_SPREADSHEET_BARU')
//     (ID diambil dari URL spreadsheet barunya, bagian setelah /d/)
//  3. Tambahkan ID yang sama ke array DATA_SPREADSHEET_IDS di bawah ini
//  4. Tambahkan ID yang sama juga ke SPREADSHEET_IDS di Script.js (front-end)
// ==========================================
var DATA_SPREADSHEET_IDS = [
  // Kosongkan array ini kalau cuma mau pakai 1 spreadsheet (spreadsheet
  // tempat script ini nempel/bound). Tambahkan ID spreadsheet lain di sini
  // (dipisah koma) kalau mau nambah kapasitas penyimpanan data file.
  // "ID_SPREADSHEET_CADANGAN_1",
  // "ID_SPREADSHEET_CADANGAN_2",
];
var MAX_ROWS_PER_FILE_SHEET = 180000; // ambang aman jauh di bawah batas baris Google Sheets
var CELL_CHAR_LIMIT = 45000;          // aman di bawah batas asli Google Sheets (~50.000 karakter/cell)
var OVERFLOW_MARKER = '\u00A7OVERFLOW\u00A7'; // '§OVERFLOW§', ditulis via kode unicode biar aman di semua encoding

// PATCH: dulu pakai SpreadsheetApp.getActiveSpreadsheet() -- itu cuma jalan
// kalau script ini "menempel" langsung ke spreadsheet-nya. Sekarang dikunci
// ke 1 ID TETAP, supaya SALINAN index.gs ini yang di-deploy sebagai project
// terpisah di akun Google LAIN pun tetap nyambung ke spreadsheet IDENTITAS
// yang SAMA (Users/Folder/Share/Viewer) -- bukan bikin database sendiri yang
// kosong. SYARAT: spreadsheet ini WAJIB di-share sebagai "Editor" (bukan
// cuma "Pelihat") ke akun Google yang menjalankan tiap deployment cadangan,
// kalau tidak semua aksi tulis (login, folder, share, dst) akan gagal
// "permission denied" di deployment cadangan itu.
var PRIMARY_SPREADSHEET_ID = "1Gm7kCNLpI5nvbLVtea-Z7m8XSSgHeEXGgnGETmFH9EA";
function getPrimarySpreadsheet_() { return SpreadsheetApp.openById(PRIMARY_SPREADSHEET_ID); }

// Semua spreadsheet yang menyimpan data file (DB_01/DB_02), urut prioritas:
// yang utama dulu, baru cadangan sesuai urutan DATA_SPREADSHEET_IDS. Kalau
// salah satu ID cadangan gagal dibuka (ID salah/akses dicabut), dilewati
// saja -- tidak bikin semuanya ikut gagal.
function getAllFileSpreadsheets_() {
  var list = [getPrimarySpreadsheet_()];
  for (var i = 0; i < DATA_SPREADSHEET_IDS.length; i++) {
    try { list.push(SpreadsheetApp.openById(DATA_SPREADSHEET_IDS[i])); }
    catch (e) { /* dilewati */ }
  }
  return list;
}

// Siapkan tab DB_01 & DB_02 di spreadsheet CADANGAN baru (dipanggil manual
// sekali lewat editor Apps Script, BUKAN dipanggil otomatis oleh app).
function setupAdditionalSpreadsheet(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  if (!ss.getSheetByName('DB_01')) ss.insertSheet('DB_01').appendRow(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']);
  if (!ss.getSheetByName('DB_02')) ss.insertSheet('DB_02').appendRow(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
  return 'OK: DB_01 & DB_02 siap di spreadsheet ' + spreadsheetId;
}

// Pilih spreadsheet mana yang dipakai buat nyimpan FILE BARU. Coba yang
// utama dulu; kalau baris DB_01-nya sudah mendekati batas, pindah ke
// spreadsheet cadangan berikutnya yang masih ada slot.
function pickWriteTargetSs_() {
  var all = getAllFileSpreadsheets_();
  for (var i = 0; i < all.length; i++) {
    var sh = all[i].getSheetByName('DB_01');
    if (!sh) continue;
    if (sh.getLastRow() < MAX_ROWS_PER_FILE_SHEET) return all[i];
  }
  // Semua penuh -> tetap pakai yang terakhir (lebih baik jelas kepenuhan
  // daripada diam-diam gagal nyimpan). Kalau ini kejadian, tambah 1
  // spreadsheet baru lagi ke DATA_SPREADSHEET_IDS.
  return all[all.length - 1];
}

// Cari 1 baris file (di sheet DB_01 ATAU DB_02, tergantung sheetName yang
// dikasih) berdasarkan fileId+ownerId, mencari di SEMUA spreadsheet yang
// terdaftar. Mengembalikan info lengkap termasuk objek sheet-nya supaya
// caller bisa langsung baca/update/hapus barisnya di tempat yang tepat.
function findFileRow_(fileId, ownerId, sheetName, ownerColIndex) {
  var all = getAllFileSpreadsheets_();
  for (var s = 0; s < all.length; s++) {
    var sheet = all[s].getSheetByName(sheetName);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(fileId) && String(data[i][ownerColIndex]) === String(ownerId)) {
        return { ss: all[s], sheet: sheet, rowIndex: i + 1, row: data[i] };
      }
    }
  }
  return null;
}

// Kumpulkan semua ID file (DB_01 + DB_02) yang sudah dipakai di SEMUA
// spreadsheet, dipakai buat mastiin ID baru (hasil copy/duplikat) gak
// pernah bentrok walau datanya terpencar di banyak spreadsheet.
function getAllUsedFileIds_() {
  var used = {};
  var all = getAllFileSpreadsheets_();
  for (var s = 0; s < all.length; s++) {
    ['DB_01', 'DB_02'].forEach(function (name) {
      var sheet = all[s].getSheetByName(name);
      if (!sheet) return;
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) used[String(data[i][0])] = true;
    });
  }
  return used;
}

// Kumpulkan SEMUA baris file AKTIF (DB_01) dari semua spreadsheet jadi 1
// array gabungan (TANPA baris header -- beda dari getDataRange().getValues()
// biasa yang masih menyertakan header di index 0). Dipakai di tempat yang
// perlu "pandangan gabungan" semua file milik user, misal resolve_share.
function getAllActiveFileRows_() {
  var rows = [];
  var all = getAllFileSpreadsheets_();
  for (var s = 0; s < all.length; s++) {
    var sh = all[s].getSheetByName('DB_01');
    if (!sh) continue;
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) rows.push(data[i]);
  }
  return rows;
}

// Pecah value (string) jadi beberapa potongan kalau melebihi batas 1 cell,
// supaya cocok dibaca ulang oleh reassembleLongField_ di Script.js
// (front-end) maupun di reassembleLongField_ versi server di bawah ini.
// Potongan selain yang terakhir diakhiri OVERFLOW_MARKER sebagai penanda
// "masih nyambung ke kolom berikutnya".
function splitLongField_(value) {
  value = String(value || '');
  if (value.length <= CELL_CHAR_LIMIT) return [value];
  var parts = [];
  var i = 0;
  while (i < value.length) {
    var chunk = value.substring(i, i + CELL_CHAR_LIMIT);
    var isLast = (i + CELL_CHAR_LIMIT) >= value.length;
    parts.push(isLast ? chunk : chunk + OVERFLOW_MARKER);
    i += CELL_CHAR_LIMIT;
  }
  return parts;
}

// Kebalikan dari splitLongField_ -- gabungkan lagi 1 field yang terpecah ke
// beberapa kolom overflow jadi 1 string utuh (dipakai server saat butuh
// nilai chunksJSON LENGKAP, misal buat action get_chunks).
function reassembleLongField_(row, baseIndex, overflowStartIndex) {
  var value = (row[baseIndex] !== undefined && row[baseIndex] !== null) ? String(row[baseIndex]) : '';
  if (value.slice(-OVERFLOW_MARKER.length) !== OVERFLOW_MARKER) return value;
  value = value.slice(0, -OVERFLOW_MARKER.length);
  var i = overflowStartIndex;
  while (row[i] !== undefined && row[i] !== null && row[i] !== '') {
    var part = String(row[i]);
    if (part.slice(-OVERFLOW_MARKER.length) === OVERFLOW_MARKER) { value += part.slice(0, -OVERFLOW_MARKER.length); i++; }
    else { value += part; break; }
  }
  return value;
}

// Bangun array baris DB_01/DB_02 siap-appendRow dari kolom-kolom dasar,
// otomatis mecah kolom chunksJSON (index 7) ke kolom overflow (nambah di
// belakang array) kalau ternyata kepanjangan buat 1 cell. Kolom overflow
// otomatis "nempel" di posisi yang benar karena tinggal di-push ke akhir
// array (index 9 buat DB_01 yang 9 kolom dasar, index 10 buat DB_02 yang
// 10 kolom dasar karena ada tambahan kolom "expire").
function buildRowWithOverflow_(baseValues) {
  var parts = splitLongField_(baseValues[7]);
  var row = baseValues.slice();
  row[7] = parts[0];
  for (var p = 1; p < parts.length; p++) row.push(parts[p]);
  return row;
}

// Konversi baris DB_01 (aktif) -> format DB_02 (Trash) saat file dihapus.
// DB_01: [id,name,orig,format,folder,size,thumbId,chunksJSON,ownerId, ...overflow]
// DB_02: [id,name,orig,format,folder,size,thumbId,chunksJSON,expire,ownerId, ...overflow]
// Kolom overflow (kalau ada) TETAP dibawa, bukan ikut kepotong.
function toTrashRow_(activeRow, expireValue) {
  var base = activeRow.slice(0, 8);
  var ownerId = activeRow[8];
  var overflow = activeRow.slice(9);
  return base.concat([expireValue, ownerId]).concat(overflow);
}

// Kebalikannya: DB_02 (Trash) -> format DB_01 (aktif) saat file di-restore.
function fromTrashRow_(trashRow) {
  var base = trashRow.slice(0, 8);
  var ownerId = trashRow[9];
  var overflow = trashRow.slice(10);
  return base.concat([ownerId]).concat(overflow);
}

// SETUP DATABASE DENGAN NAMA SHEET DAN HEADER TERSAMARKAN
function setupDatabase() {
  var ss = getPrimarySpreadsheet_();
  if (!ss.getSheetByName('DB_01')) ss.insertSheet('DB_01').appendRow(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']);
  if (!ss.getSheetByName('DB_02')) ss.insertSheet('DB_02').appendRow(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
  if (!ss.getSheetByName('DB_03')) ss.insertSheet('DB_03').appendRow(['F1', 'F2', 'F3']);
  if (!ss.getSheetByName('DB_04')) ss.insertSheet('DB_04').appendRow(['U1', 'U2', 'U3', 'U4']);
  if (!ss.getSheetByName('DB_05')) ss.insertSheet('DB_05').appendRow(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);
  if (!ss.getSheetByName('DB_06')) ss.insertSheet('DB_06').appendRow(['V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
}

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) { return buildResponse({ success: false, message: "Sistem sibuk (antrean penuh). Coba lagi sesaat lagi.", networkError: true }, e.parameter.callback); }

  try {
    var dataStr = e.parameter.data || e.parameter.payload;
    var callback = e.parameter.callback;
    if (!dataStr) return buildResponse({ success: false, message: "Tidak ada data yang dikirim." }, callback);

    var payload = JSON.parse(decodeURIComponent(dataStr));
    if (payload.apiKey !== API_KEY) return buildResponse({ success: false, message: "Unauthorized: Kunci API salah." }, callback);

    var ss = getPrimarySpreadsheet_();
    var sheet1 = ss.getSheetByName('DB_01');
    var trashSheet = ss.getSheetByName('DB_02');
    var folderSheet = ss.getSheetByName('DB_03');
    var userSheet = ss.getSheetByName('DB_04');
    var shareSheet = ss.getSheetByName('DB_05');
    var viewersSheet = ss.getSheetByName('DB_06');

    if (!sheet1 || !trashSheet || !folderSheet || !userSheet || !shareSheet || !viewersSheet) return buildResponse({ success: false, message: "Database belum lengkap. Jalankan setupDatabase() ulang." }, callback);

    if (payload.action === 'verify_account') {
      var uData = userSheet.getDataRange().getValues();
      for (var i = 1; i < uData.length; i++) {
        if (uData[i][2] === payload.ownerId) return buildResponse({ success: true, username: decField(uData[i][0]) }, callback);
      }
      return buildResponse({ success: false, message: "Akun tidak ditemukan di server." }, callback);
    }

    if (payload.action === 'signup') {
      var uData = userSheet.getDataRange().getValues();
      var encUsername = encField(payload.username);
      for (var i = 1; i < uData.length; i++) {
        if (uData[i][0] === encUsername) return buildResponse({ success: false, message: "Username sudah terdaftar!" }, callback);
      }
      var existingUids = {};
      for (var i = 1; i < uData.length; i++) existingUids[String(uData[i][2])] = true;
      var newUid = generateUniqueCode(10, existingUids);
      userSheet.appendRow([encUsername, encField(payload.password), newUid, encField(new Date().toISOString())]);
      return buildResponse({ success: true, message: "Pendaftaran berhasil.", ownerId: newUid }, callback);
    }

    if (payload.action === 'login') {
      var uData = userSheet.getDataRange().getValues();
      var encUsername = encField(payload.username);
      var encPassword = encField(payload.password);
      for (var i = 1; i < uData.length; i++) {
        if (uData[i][0] === encUsername && uData[i][1] === encPassword) {
          return buildResponse({ success: true, message: "Login sukses", ownerId: uData[i][2] }, callback);
        }
      }
      return buildResponse({ success: false, message: "Username atau password salah!" }, callback);
    }

    if (payload.action === 'forgot_password') return buildResponse({ success: true, message: "Instruksi reset berhasil diproses." }, callback);

    if (payload.action === 'update_credentials') {
      var uData = userSheet.getDataRange().getValues();
      var userRow = -1;
      for (var i = 1; i < uData.length; i++) {
        if (uData[i][2] === payload.oldOwnerId) { userRow = i + 1; break; }
      }
      if (userRow === -1) return buildResponse({ success: false, message: "Sesi tidak valid / akun tidak ditemukan!" }, callback);
      var newUsername = encField(payload.newUsername);
      var newPassword = encField(payload.newPassword);
      for (var i = 1; i < uData.length; i++) {
        if (uData[i][0] === newUsername && (i + 1) !== userRow) return buildResponse({ success: false, message: "Username sudah dipakai!" }, callback);
      }
      userSheet.getRange(userRow, 1).setValue(newUsername);
      userSheet.getRange(userRow, 2).setValue(newPassword);
      return buildResponse({ success: true, message: "Kredensial diupdate", newOwnerId: payload.oldOwnerId }, callback);
    }

    if (payload.action === 'delete_account_complete') {
      var targetOwner = payload.ownerId;
      var sheetsToClean = [userSheet, folderSheet, shareSheet];
      var colsToMatch = [2, 1, 3];
      
      for (var s = 0; s < sheetsToClean.length; s++) {
        var sheet = sheetsToClean[s];
        var col = colsToMatch[s];
        var data = sheet.getDataRange().getValues();
        for (var i = data.length - 1; i >= 1; i--) {
          if (data[i][col] === targetOwner) sheet.deleteRow(i + 1);
        }
      }

      // Data file (DB_01/DB_02) bisa tersebar di beberapa spreadsheet -- bersihkan semua.
      var allFileSs = getAllFileSpreadsheets_();
      for (var fs = 0; fs < allFileSs.length; fs++) {
        var sh1 = allFileSs[fs].getSheetByName('DB_01');
        if (sh1) {
          var d1 = sh1.getDataRange().getValues();
          for (var i = d1.length - 1; i >= 1; i--) { if (d1[i][8] === targetOwner) sh1.deleteRow(i + 1); }
        }
        var sh2 = allFileSs[fs].getSheetByName('DB_02');
        if (sh2) {
          var d2 = sh2.getDataRange().getValues();
          for (var i = d2.length - 1; i >= 1; i--) { if (d2[i][9] === targetOwner) sh2.deleteRow(i + 1); }
        }
      }
      return buildResponse({ success: true, message: "Akun dan semua datanya telah dihapus." }, callback);
    }

    var PUBLIC_ACTIONS = { login: 1, signup: 1, verify_account: 1, forgot_password: 1, resolve_share: 1, browse_shared_folder: 1, search_users: 1, log_share_visit: 1, shared_save_metadata: 1 };
    var currentOwnerId = payload.ownerId || payload.excludeUid;
    if ((!currentOwnerId || currentOwnerId === "") && !PUBLIC_ACTIONS[payload.action]) {
      if (payload.action === 'get_all_data') return buildResponse({ success: true, data: { active: [], trash: [], folders: [] } }, callback);
      if (payload.action !== 'get_chunks') return buildResponse({ success: false, message: "Akses Ditolak: Sesi tidak valid." }, callback);
    }

    if (payload.action === 'get_all_data') {
      var allFileSs = getAllFileSpreadsheets_();
      var activeFiles = [], trashFiles = [];
      for (var s = 0; s < allFileSs.length; s++) {
        var sh1 = allFileSs[s].getSheetByName('DB_01');
        if (sh1) {
          var activeData = sh1.getDataRange().getValues();
          for (var i = 1; i < activeData.length; i++) { if (activeData[i][8] === currentOwnerId) activeFiles.push({ id: activeData[i][0], name: decField(activeData[i][1]), originalName: decField(activeData[i][2]), format: activeData[i][3], folder: activeData[i][4], size: activeData[i][5], thumbId: decField(activeData[i][6]) }); }
        }
        var sh2 = allFileSs[s].getSheetByName('DB_02');
        if (sh2) {
          var trashData = sh2.getDataRange().getValues();
          for (var i = 1; i < trashData.length; i++) { if (trashData[i][9] === currentOwnerId) trashFiles.push({ id: trashData[i][0], name: decField(trashData[i][1]), originalName: decField(trashData[i][2]), format: trashData[i][3], folder: trashData[i][4], size: trashData[i][5], thumbId: decField(trashData[i][6]) }); }
        }
      }
      var folderData = folderSheet.getDataRange().getValues();
      var folders = [];
      for (var i = 1; i < folderData.length; i++) { if (folderData[i][1] === currentOwnerId) folders.push({ path: folderData[i][0], owner: folderData[i][1] }); }
      return buildResponse({ success: true, data: { active: activeFiles, trash: trashFiles, folders: folders } }, callback);
    }

    if (payload.action === 'get_chunks') {
      if (payload.shareId) {
        var shareAuth = authorizeShareAccess(shareSheet, payload.shareId, payload.viewerUid || '');
        if (shareAuth.ok) {
          var allFileSs = getAllFileSpreadsheets_();
          for (var s = 0; s < allFileSs.length; s++) {
            var sh1 = allFileSs[s].getSheetByName('DB_01');
            if (!sh1) continue;
            var sharedData = sh1.getDataRange().getValues();
            for (var si = 1; si < sharedData.length; si++) {
              if (sharedData[si][0] === payload.fileId && sharedData[si][8] === shareAuth.share.ownerId) {
                if (shareAuth.share.itemType === 'file' && shareAuth.share.itemId !== payload.fileId) continue;
                if (shareAuth.share.itemType === 'folder') {
                  var sharedFolder = sharedData[si][4] || '';
                  if (!(sharedFolder === shareAuth.share.itemId || sharedFolder.indexOf(shareAuth.share.itemId + '/') === 0)) continue;
                }
                return buildResponse({ success: true, data: JSON.parse(decField(reassembleLongField_(sharedData[si], 7, 9))) }, callback);
              }
            }
          }
        }
        return buildResponse({ success: false, message: "Akses ditolak atau berkas tidak ditemukan." }, callback);
      }
      if (currentOwnerId) {
        var found = findFileRow_(payload.fileId, currentOwnerId, 'DB_01', 8);
        if (found) return buildResponse({ success: true, data: JSON.parse(decField(reassembleLongField_(found.row, 7, 9))) }, callback);
        var foundTrash = findFileRow_(payload.fileId, currentOwnerId, 'DB_02', 9);
        if (foundTrash) return buildResponse({ success: true, data: JSON.parse(decField(reassembleLongField_(foundTrash.row, 7, 10))) }, callback);
      }
      return buildResponse({ success: false, message: "File tidak ditemukan." }, callback);
    }

    if (payload.action === 'save_metadata') {
      var writeSs = pickWriteTargetSs_();
      var writeSheet = writeSs.getSheetByName('DB_01');
      var baseRow = [payload.fileId, encField(payload.customName), encField(payload.originalName), payload.format, payload.folder, payload.fileSize, encField(payload.thumbId || ''), encField(JSON.stringify(payload.chunks)), currentOwnerId];
      writeSheet.appendRow(buildRowWithOverflow_(baseRow));
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'create_folder') {
      folderSheet.appendRow([payload.folderPath, currentOwnerId, encField(new Date().toISOString())]);
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'delete_folder') {
      var data = folderSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) { if (data[i][0] === payload.folderPath && data[i][1] === currentOwnerId) { folderSheet.deleteRow(i + 1); break; } }
      removeSharesForItem(shareSheet, payload.folderPath, 'folder', currentOwnerId);
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'move_folder_dir' || payload.action === 'rename_folder_dir') {
      var oldPath = payload.oldPath, newPath = payload.newPath;
      var fData = folderSheet.getDataRange().getValues();
      for (var i = 1; i < fData.length; i++) {
        if (fData[i][1] !== currentOwnerId) continue;
        var p = fData[i][0];
        if (p === oldPath) folderSheet.getRange(i + 1, 1).setValue(newPath);
        else if (p.indexOf(oldPath + '/') === 0) folderSheet.getRange(i + 1, 1).setValue(p.replace(oldPath, newPath));
      }
      var allFileSs = getAllFileSpreadsheets_();
      for (var s = 0; s < allFileSs.length; s++) {
        var sh1 = allFileSs[s].getSheetByName('DB_01');
        if (!sh1) continue;
        var fileData = sh1.getDataRange().getValues();
        for (var i = 1; i < fileData.length; i++) {
          if (fileData[i][8] !== currentOwnerId) continue;
          var fFolder = fileData[i][4];
          if (fFolder === oldPath) sh1.getRange(i + 1, 5).setValue(newPath);
          else if (fFolder && fFolder.indexOf(oldPath + '/') === 0) sh1.getRange(i + 1, 5).setValue(fFolder.replace(oldPath, newPath));
        }
      }
      var sData = shareSheet.getDataRange().getValues();
      for (var i = 1; i < sData.length; i++) {
        if (sData[i][3] !== currentOwnerId || sData[i][2] !== 'folder') continue;
        var ip = sData[i][1];
        if (ip === oldPath) shareSheet.getRange(i + 1, 2).setValue(newPath);
        else if (ip.indexOf(oldPath + '/') === 0) shareSheet.getRange(i + 1, 2).setValue(ip.replace(oldPath, newPath));
      }
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'rename_file') {
      var found = findFileRow_(payload.fileId, currentOwnerId, 'DB_01', 8);
      if (found) { found.sheet.getRange(found.rowIndex, 2).setValue(encField(payload.newName)); return buildResponse({ success: true }, callback); }
    }

    if (payload.action === 'move_folder') {
      var found = findFileRow_(payload.fileId, currentOwnerId, 'DB_01', 8);
      if (found) { found.sheet.getRange(found.rowIndex, 5).setValue(payload.folder); return buildResponse({ success: true }, callback); }
    }

    if (payload.action === 'copy_file') {
      var found = findFileRow_(payload.fileId, currentOwnerId, 'DB_01', 8);
      if (found) {
        var usedIds = getAllUsedFileIds_();
        var newId = 'COPY_' + generateUniqueCode(14, usedIds);
        var targetFolder = (payload.targetFolder !== undefined && payload.targetFolder !== null) ? payload.targetFolder : found.row[4];
        // .slice() ambil SELURUH kolom baris sumber (termasuk kolom overflow
        // kalau chunksJSON-nya sempat kepecah) -- bukan cuma 9 kolom dasar,
        // supaya data yang panjang gak kepotong pas disalin.
        var newRow = found.row.slice();
        newRow[0] = newId; newRow[4] = targetFolder; newRow[8] = currentOwnerId;
        var writeSs = pickWriteTargetSs_();
        writeSs.getSheetByName('DB_01').appendRow(newRow);
        return buildResponse({
          success: true,
          newFile: { id: newId, name: decField(found.row[1]), originalName: decField(found.row[2]), format: found.row[3], folder: targetFolder, size: found.row[5], thumbId: decField(found.row[6]) }
        }, callback);
      }
      return buildResponse({ success: false, message: "Berkas sumber tidak ditemukan." }, callback);
    }

    if (payload.action === 'copy_folder') {
      var srcPath = payload.folderPath;
      var targetParent = (payload.targetParent !== undefined && payload.targetParent !== null) ? payload.targetParent : '';
      var srcName = srcPath.split('/').pop();
      var srcParent = srcPath.indexOf('/') !== -1 ? srcPath.substring(0, srcPath.lastIndexOf('/')) : '';
      var newBaseName = (targetParent === srcParent) ? (srcName + ' (Salinan)') : srcName;
      var newRootPath = targetParent ? (targetParent + '/' + newBaseName) : newBaseName;
      var fData = folderSheet.getDataRange().getValues();
      var existingIds = getAllUsedFileIds_();

      var now = encField(new Date().toISOString());
      var newFolders = [];
      var newFiles = [];

      folderSheet.appendRow([newRootPath, currentOwnerId, now]);
      newFolders.push({ path: newRootPath, owner: currentOwnerId });

      for (var i = 1; i < fData.length; i++) {
        if (fData[i][1] !== currentOwnerId) continue;
        var p = String(fData[i][0]);
        if (p.indexOf(srcPath + '/') === 0) {
          var newSubPath = newRootPath + p.substring(srcPath.length);
          folderSheet.appendRow([newSubPath, currentOwnerId, now]);
          newFolders.push({ path: newSubPath, owner: currentOwnerId });
        }
      }

      var allFileSs = getAllFileSpreadsheets_();
      var writeSs = pickWriteTargetSs_();
      var writeSheet = writeSs.getSheetByName('DB_01');
      for (var s = 0; s < allFileSs.length; s++) {
        var sh1 = allFileSs[s].getSheetByName('DB_01');
        if (!sh1) continue;
        var aData = sh1.getDataRange().getValues();
        for (var i = 1; i < aData.length; i++) {
          if (aData[i][8] !== currentOwnerId) continue;
          var fFolder = aData[i][4];
          var newFileFolder = null;
          if (fFolder === srcPath) newFileFolder = newRootPath;
          else if (fFolder && String(fFolder).indexOf(srcPath + '/') === 0) newFileFolder = newRootPath + String(fFolder).substring(srcPath.length);
          if (newFileFolder === null) continue;
          var newId = 'COPY_' + generateUniqueCode(14, existingIds);
          existingIds[newId] = true;
          // .slice() ambil SELURUH kolom baris sumber (termasuk overflow kalau ada)
          var newRow = aData[i].slice();
          newRow[0] = newId; newRow[4] = newFileFolder; newRow[8] = currentOwnerId;
          writeSheet.appendRow(newRow);
          newFiles.push({ id: newId, name: decField(aData[i][1]), originalName: decField(aData[i][2]), format: aData[i][3], folder: newFileFolder, size: aData[i][5], thumbId: decField(aData[i][6]) });
        }
      }

      return buildResponse({ success: true, newRootPath: newRootPath, newFolders: newFolders, newFiles: newFiles }, callback);
    }

    if (payload.action === 'delete_file') {
      var found = findFileRow_(payload.fileId, currentOwnerId, 'DB_01', 8);
      if (found) {
        var expire = encField(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
        found.ss.getSheetByName('DB_02').appendRow(toTrashRow_(found.row, expire));
        found.sheet.deleteRow(found.rowIndex);
        removeSharesForItem(shareSheet, payload.fileId, 'file', currentOwnerId);
        return buildResponse({ success: true }, callback);
      }
    }

    if (payload.action === 'trash_folder') {
      var targetPath = payload.folderPath;
      var expire = encField(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
      
      var fData = folderSheet.getDataRange().getValues();
      for (var i = fData.length - 1; i >= 1; i--) {
        if (fData[i][1] === currentOwnerId) {
          var p = String(fData[i][0]);
          if (p === targetPath || p.indexOf(targetPath + '/') === 0) {
            var fName = p.split('/').pop();
            var parentP = p.indexOf('/') !== -1 ? p.substring(0, p.lastIndexOf('/')) : '';
            trashSheet.appendRow([p, encField(fName), encField(fName), 'sys_folder', parentP, 0, '', '', expire, currentOwnerId]);
            folderSheet.deleteRow(i + 1);
            removeSharesForItem(shareSheet, p, 'folder', currentOwnerId);
          }
        }
      }

      // File-nya bisa tersebar di beberapa spreadsheet -- di-trash ke DB_02
      // milik spreadsheet yang SAMA dengan tempat file itu berasal (co-located).
      var allFileSs = getAllFileSpreadsheets_();
      for (var s = 0; s < allFileSs.length; s++) {
        var sh1 = allFileSs[s].getSheetByName('DB_01');
        var sh2 = allFileSs[s].getSheetByName('DB_02');
        if (!sh1 || !sh2) continue;
        var aData = sh1.getDataRange().getValues();
        for (var i = aData.length - 1; i >= 1; i--) {
          if (aData[i][8] === currentOwnerId) {
            var fileFolder = String(aData[i][4] || '').trim();
            if (fileFolder === targetPath || fileFolder.indexOf(targetPath + '/') === 0) {
              sh2.appendRow(toTrashRow_(aData[i], expire));
              sh1.deleteRow(i + 1);
              removeSharesForItem(shareSheet, aData[i][0], 'file', currentOwnerId);
            }
          }
        }
      }
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'restore_folder') {
      var targetPath = payload.folderPath;
      var now = encField(new Date().toISOString());

      // Penanda folder ("sys_folder") selalu ditulis ke trashSheet spreadsheet
      // utama (folder memang cuma disimpan di spreadsheet utama).
      var tDataPrimary = trashSheet.getDataRange().getValues();
      for (var i = tDataPrimary.length - 1; i >= 1; i--) {
        if (tDataPrimary[i][9] === currentOwnerId && tDataPrimary[i][3] === 'sys_folder') {
          var p = String(tDataPrimary[i][0]);
          if (p === targetPath || p.indexOf(targetPath + '/') === 0) {
            folderSheet.appendRow([p, currentOwnerId, now]);
            trashSheet.deleteRow(i + 1);
          }
        }
      }

      var allFileSs = getAllFileSpreadsheets_();
      for (var s = 0; s < allFileSs.length; s++) {
        var sh1 = allFileSs[s].getSheetByName('DB_01');
        var sh2 = allFileSs[s].getSheetByName('DB_02');
        if (!sh1 || !sh2) continue;
        var tData = sh2.getDataRange().getValues();
        for (var i = tData.length - 1; i >= 1; i--) {
          if (tData[i][9] === currentOwnerId && tData[i][3] !== 'sys_folder') {
            var fileFolder = String(tData[i][4] || '').trim();
            if (fileFolder === targetPath || fileFolder.indexOf(targetPath + '/') === 0) {
              sh1.appendRow(fromTrashRow_(tData[i]));
              sh2.deleteRow(i + 1);
            }
          }
        }
      }
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'delete_permanent_folder') {
      var targetPath = payload.folderPath;
      var allFileSs = getAllFileSpreadsheets_();
      for (var s = 0; s < allFileSs.length; s++) {
        var sh2 = allFileSs[s].getSheetByName('DB_02');
        if (!sh2) continue;
        var tData = sh2.getDataRange().getValues();
        for (var i = tData.length - 1; i >= 1; i--) {
          if (tData[i][9] === currentOwnerId) {
            var format = tData[i][3];
            var p = (format === 'sys_folder') ? String(tData[i][0]) : String(tData[i][4] || '');
            if (p === targetPath || p.indexOf(targetPath + '/') === 0) {
              sh2.deleteRow(i + 1);
            }
          }
        }
      }
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'restore_file') {
      var found = findFileRow_(payload.fileId, currentOwnerId, 'DB_02', 9);
      if (found) {
        found.ss.getSheetByName('DB_01').appendRow(fromTrashRow_(found.row));
        found.sheet.deleteRow(found.rowIndex);
        return buildResponse({ success: true }, callback);
      }
    }

    if (payload.action === 'delete_permanent') {
      var found = findFileRow_(payload.fileId, currentOwnerId, 'DB_02', 9);
      if (found) { found.sheet.deleteRow(found.rowIndex); return buildResponse({ success: true }, callback); }
      return buildResponse({ success: false, message: "File tidak ditemukan di Sampah." }, callback);
    }

    if (payload.action === 'search_users') {
      var q = (payload.query || '').toLowerCase().trim();
      var uData = userSheet.getDataRange().getValues();
      var results = [];
      if (q.length > 0) {
        for (var i = 1; i < uData.length; i++) {
          if (uData[i][2] === payload.excludeUid) continue;
          var plainUsername = decField(uData[i][0]);
          if (String(plainUsername).toLowerCase().trim().indexOf(q) !== -1) {
            results.push({ uid: uData[i][2], username: plainUsername });
            if (results.length >= 8) break;
          }
        }
      }
      return buildResponse({ success: true, results: results }, callback);
    }

    if (payload.action === 'get_share') {
      var sData = shareSheet.getDataRange().getValues();
      for (var i = 1; i < sData.length; i++) {
        if (sData[i][1] === payload.itemId && sData[i][2] === payload.itemType && sData[i][3] === currentOwnerId) {
          return buildResponse({ success: true, share: { shareId: sData[i][0], privacy: sData[i][5], allowedUsers: JSON.parse(sData[i][6] || '[]'), linkRole: sData[i][9] || 'view' } }, callback);
        }
      }
      return buildResponse({ success: true, share: { shareId: null, privacy: 'private', allowedUsers: [], linkRole: 'view' } }, callback);
    }

    if (payload.action === 'save_share') {
      var allowedUsers = payload.allowedUsers || [];
      if (allowedUsers.length > 10) return buildResponse({ success: false, message: "Maksimal 10 orang yang bisa diberi akses pribadi." }, callback);
      allowedUsers = allowedUsers.map(function (u) { return { uid: u.uid, username: u.username, role: (u.role === 'edit') ? 'edit' : 'view' }; });
      var linkRole = (payload.linkRole === 'edit') ? 'edit' : 'view';
      var sData = shareSheet.getDataRange().getValues();
      
      if (payload.itemType === 'folder' && payload.cascade) {
         for (var i = sData.length - 1; i >= 1; i--) {
            if (sData[i][3] === currentOwnerId) {
               var childPath = sData[i][1];
               if (childPath.indexOf(payload.itemId + '/') === 0) { shareSheet.deleteRow(i + 1); }
            }
         }
         sData = shareSheet.getDataRange().getValues();
      }

      var rowIdx = -1;
      for (var i = 1; i < sData.length; i++) {
        if (sData[i][1] === payload.itemId && sData[i][2] === payload.itemType && sData[i][3] === currentOwnerId) { rowIdx = i + 1; break; }
      }
      var now = encField(new Date().toISOString());
      if (rowIdx === -1) {
        var existingCodes = {};
        for (var i = 1; i < sData.length; i++) existingCodes[String(sData[i][0])] = true;
        var newShareId = generateUniqueCode(8, existingCodes);
        shareSheet.appendRow([newShareId, payload.itemId, payload.itemType, currentOwnerId, payload.ownerName || '', payload.privacy, JSON.stringify(allowedUsers), now, now, linkRole]);
        return buildResponse({ success: true, shareId: newShareId }, callback);
      } else {
        shareSheet.getRange(rowIdx, 6).setValue(payload.privacy);
        shareSheet.getRange(rowIdx, 7).setValue(JSON.stringify(allowedUsers));
        shareSheet.getRange(rowIdx, 9).setValue(now);
        shareSheet.getRange(rowIdx, 10).setValue(linkRole);
        return buildResponse({ success: true, shareId: sData[rowIdx - 1][0] }, callback);
      }
    }

    if (payload.action === 'log_share_visit') {
      var ts = encField(Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMM yyyy, HH:mm"));
      viewersSheet.appendRow([payload.itemId, payload.itemType, payload.ownerId, payload.viewerUid || 'guest', payload.viewerName || 'Tamu', ts]);
      return buildResponse({ success: true }, callback);
    }

    if (payload.action === 'get_share_viewers') {
      var data = viewersSheet.getDataRange().getValues();
      var viewersMap = {};
      var results = [];
      for (var i = data.length - 1; i >= 1; i--) {
        if (data[i][0] === payload.itemId && data[i][1] === payload.itemType && data[i][2] === currentOwnerId) {
          var uid = data[i][3];
          var name = data[i][4];
          var timestamp = decField(data[i][5]);
          var uniqueKey = uid + "_" + name;
          if (!viewersMap[uniqueKey]) {
            viewersMap[uniqueKey] = true;
            results.push({ uid: uid, username: name, timestamp: timestamp });
          }
        }
      }
      return buildResponse({ success: true, viewers: results }, callback);
    }

    if (payload.action === 'resolve_share') {
      var auth = authorizeShareAccess(shareSheet, payload.shareId, payload.viewerUid || '');
      if (!auth.ok) return buildResponse({ success: true, authorized: false, privacy: auth.share ? auth.share.privacy : 'private', ownerName: auth.share ? auth.share.ownerName : '' }, callback);
      var sh = auth.share;
      if (sh.itemType === 'file') {
        var aData = getAllActiveFileRows_();
        for (var i = 0; i < aData.length; i++) {
          if (String(aData[i][0]) === String(sh.itemId) && String(aData[i][8]) === String(sh.ownerId)) {
            return buildResponse({
              success: true, authorized: true, itemType: 'file', ownerId: sh.ownerId, ownerName: sh.ownerName, privacy: sh.privacy, role: auth.role,
              item: { id: aData[i][0], name: decField(aData[i][1]), originalName: decField(aData[i][2]), format: aData[i][3], folder: aData[i][4], size: aData[i][5], thumbId: decField(aData[i][6]) }
            }, callback);
          }
        }
        return buildResponse({ success: false, deleted: true }, callback);
      }

      var rootPath = sh.itemId;
      var curPath = (payload.subPath !== null && payload.subPath !== undefined && payload.subPath !== '') ? payload.subPath : rootPath;
      var aData = getAllActiveFileRows_();
      var fData = folderSheet.getDataRange().getValues();
      var subfolders = [], files = [];
      for (var i = 1; i < fData.length; i++) {
        if (String(fData[i][1]) === String(sh.ownerId)) {
          var p = String(fData[i][0]);
          if (p.indexOf(curPath + '/') === 0) {
            var rel = p.substring(curPath.length + 1);
            var nextSeg = rel.split('/')[0];
            var fullSub = curPath + '/' + nextSeg;
            if (subfolders.indexOf(fullSub) === -1) subfolders.push(fullSub);
          }
        }
      }

      for (var i = 0; i < aData.length; i++) {
        if (String(aData[i][8]) === String(sh.ownerId)) {
          var fld = (aData[i][4] && aData[i][4] !== '#*null*#') ? String(aData[i][4]).trim() : '';
          var trg = (curPath && curPath !== '#*null*#') ? String(curPath).trim() : '';
          if (fld.toLowerCase() === trg.toLowerCase()) {
            files.push({ id: aData[i][0], name: decField(aData[i][1]), originalName: decField(aData[i][2]), format: aData[i][3], folder: aData[i][4], size: aData[i][5], thumbId: decField(aData[i][6]) });
          }
        }
      }

      return buildResponse({
        success: true, authorized: true, itemType: 'folder', ownerId: sh.ownerId, ownerName: sh.ownerName, privacy: sh.privacy, role: auth.role,
        item: { path: curPath, name: curPath.split('/').pop() || 'Beranda', contents: { subfolders: subfolders, files: files } }
      }, callback);
    }

    if (payload.action === 'shared_save_metadata') {
      var auth = authorizeShareAccess(shareSheet, payload.shareId, payload.viewerUid || '');
      if (!auth.ok || auth.role !== 'edit') return buildResponse({ success: false, message: "Akses edit ditolak untuk tautan ini." }, callback);
      var sh = auth.share;
      if (sh.itemType !== 'folder') return buildResponse({ success: false, message: "Hanya folder yang bisa menerima upload dari tautan berbagi." }, callback);
      var targetFolder = payload.folder || '';
      var inScope = (targetFolder === sh.itemId) || (String(targetFolder).indexOf(sh.itemId + '/') === 0);
      if (!inScope) return buildResponse({ success: false, message: "Folder tujuan di luar cakupan berbagi." }, callback);
      var writeSs = pickWriteTargetSs_();
      var writeSheet = writeSs.getSheetByName('DB_01');
      var sharedBaseRow = [payload.fileId, encField(payload.customName), encField(payload.originalName), payload.format, targetFolder, payload.fileSize, encField(payload.thumbId || ''), encField(JSON.stringify(payload.chunks)), sh.ownerId];
      writeSheet.appendRow(buildRowWithOverflow_(sharedBaseRow));
      return buildResponse({ success: true }, callback);
    }

    return buildResponse({ success: false, message: "Action not found" }, callback);
  } catch (e) { return buildResponse({ success: false, message: "Error Server: " + e.message }, e.parameter.callback); }
  finally { lock.releaseLock(); }
}

function generateUniqueCode(len, existingMap) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  for (var attempt = 0; attempt < 20; attempt++) {
    var s = '';
    for (var i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    if (!existingMap[s]) return s;
  }
  return Utilities.getUuid().replace(/-/g, '').substring(0, len);
}

function authorizeShareAccess(shareSheet, shareId, viewerUid) {
  var sData = shareSheet.getDataRange().getValues();
  for (var i = 1; i < sData.length; i++) {
    if (String(sData[i][0]) === String(shareId)) {
      var share = { shareId: sData[i][0], itemId: sData[i][1], itemType: sData[i][2], ownerId: sData[i][3], ownerName: sData[i][4], privacy: sData[i][5], allowedUsers: JSON.parse(sData[i][6] || '[]'), linkRole: sData[i][9] || 'view' };
      if (share.privacy === 'private') return { ok: false, share: share, role: 'view' };
      if (share.privacy === 'link') return { ok: true, share: share, role: share.linkRole === 'edit' ? 'edit' : 'view' };
      if (share.privacy === 'restricted') {
        var match = null;
        for (var k = 0; k < share.allowedUsers.length; k++) { if (share.allowedUsers[k].uid === viewerUid) { match = share.allowedUsers[k]; break; } }
        return { ok: !!match, share: share, role: (match && match.role === 'edit') ? 'edit' : 'view' };
      }
      return { ok: false, share: share, role: 'view' };
    }
  }
  return { ok: false };
}

function removeSharesForItem(shareSheet, itemId, itemType, ownerId) {
  var sData = shareSheet.getDataRange().getValues();
  for (var i = sData.length - 1; i >= 1; i--) {
    if (sData[i][1] === itemId && sData[i][2] === itemType && sData[i][3] === ownerId) shareSheet.deleteRow(i + 1);
  }
}

function buildResponse(obj, callbackName) {
  var jsonString = JSON.stringify(obj);
  if (callbackName) { return ContentService.createTextOutput(callbackName + "(" + jsonString + ");").setMimeType(ContentService.MimeType.JAVASCRIPT); }
  else { return ContentService.createTextOutput(jsonString).setMimeType(ContentService.MimeType.JSON); }
}
