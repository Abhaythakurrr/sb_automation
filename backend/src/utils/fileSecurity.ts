/**
 * File upload security — content-based verification (not just extension).
 *
 * Threat model: an attacker renames a malicious payload (PHP, ELF binary,
 * Windows PE, shell script, HTML/JS) to .csv/.xlsx/.ods to get it onto disk
 * or to be mis-handled. We never execute uploads, but defense-in-depth means
 * we reject anything whose real content does not match an allowed spreadsheet
 * or CSV before it is parsed, and we always delete the temp file afterwards.
 *
 * Rules:
 *  - .xlsx / .ods  → MUST be a real ZIP container (Office Open XML / ODF are
 *                    ZIP based) AND contain the expected internal markers.
 *  - .csv          → MUST be plain text: no NUL bytes, and the leading bytes
 *                    must NOT match a known binary/executable/archive signature.
 *                    (We do NOT scan CSV *body* for script-like strings, because
 *                    a legitimate "Job Script" column can contain shell/PHP text.)
 */
import fs from 'fs';
import path from 'path';

export interface FileVerdict {
  ok: boolean;
  detectedType: string;
  reason?: string;
}

const ALLOWED_EXTS = new Set(['.csv', '.xlsx', '.ods']);

// Binary/executable/archive magic signatures that must never appear at the
// start of a CSV (and identify disguised payloads).
const DANGEROUS_LEADING: { sig: number[]; label: string }[] = [
  { sig: [0x7f, 0x45, 0x4c, 0x46], label: 'ELF binary' },        // \x7FELF
  { sig: [0x4d, 0x5a], label: 'Windows PE/EXE' },                 // MZ
  { sig: [0x25, 0x50, 0x44, 0x46], label: 'PDF' },                // %PDF
  { sig: [0xca, 0xfe, 0xba, 0xbe], label: 'Mach-O/Java class' },
  { sig: [0xfe, 0xed, 0xfa], label: 'Mach-O' },
  { sig: [0x1f, 0x8b], label: 'gzip archive' },
  { sig: [0x42, 0x5a, 0x68], label: 'bzip2 archive' },
  { sig: [0x52, 0x61, 0x72, 0x21], label: 'RAR archive' },        // Rar!
  { sig: [0x23, 0x21], label: 'script shebang (#!)' },            // #!
];

function startsWith(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

// ZIP local-file-header / empty / spanned signatures.
function isZip(buf: Buffer): boolean {
  return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) ||
         startsWith(buf, [0x50, 0x4b, 0x05, 0x06]) ||
         startsWith(buf, [0x50, 0x4b, 0x07, 0x08]);
}

// Validate filename to defeat path traversal / null-byte / control chars.
export function isSafeFilename(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.includes('\0')) return false;
  if (/[\\/]/.test(name)) return false;                 // no path separators
  if (name.includes('..')) return false;                // no traversal
  if (/[\x00-\x1f]/.test(name)) return false;           // no control chars
  return true;
}

/**
 * Verify a saved upload's real content matches its claimed spreadsheet/CSV type.
 * @param filePath  path to the temp file on disk
 * @param originalName  the client-supplied filename (already stored, used for ext)
 */
export function verifyFileContent(filePath: string, originalName: string): FileVerdict {
  const ext = path.extname(originalName || '').toLowerCase();

  if (!ALLOWED_EXTS.has(ext)) {
    return { ok: false, detectedType: 'unknown', reason: `Extension not allowed: ${ext || '(none)'}` };
  }

  let fd: number;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return { ok: false, detectedType: 'unknown', reason: 'Cannot read uploaded file' };
  }

  try {
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) {
      return { ok: false, detectedType: 'empty', reason: 'Empty file' };
    }

    // Read a header chunk for signature checks.
    const headLen = Math.min(stat.size, 8192);
    const head = Buffer.alloc(headLen);
    fs.readSync(fd, head, 0, headLen, 0);

    // ── ZIP-based formats: .xlsx / .ods ──────────────────────────────────────
    if (ext === '.xlsx' || ext === '.ods') {
      if (!isZip(head)) {
        return { ok: false, detectedType: 'non-zip', reason: `${ext} is not a valid Office/ODF (ZIP) file` };
      }
      // Confirm internal structure by scanning the full file for expected markers.
      // Files are size-capped (<=10MB) so a full read is safe and cheap.
      const full = fs.readFileSync(filePath);
      const asText = full.toString('latin1');
      const looksXlsx = asText.includes('[Content_Types].xml') ||
                        asText.includes('xl/workbook.xml') ||
                        asText.includes('xl/_rels');
      const looksOds  = asText.includes('opendocument.spreadsheet') ||
                        asText.includes('content.xml');
      if (ext === '.xlsx' && !looksXlsx && !looksOds) {
        return { ok: false, detectedType: 'zip', reason: 'ZIP does not contain a valid spreadsheet structure' };
      }
      if (ext === '.ods' && !looksOds && !looksXlsx) {
        return { ok: false, detectedType: 'zip', reason: 'ZIP does not contain a valid ODF spreadsheet structure' };
      }
      return { ok: true, detectedType: ext === '.xlsx' ? 'xlsx' : 'ods' };
    }

    // ── CSV / plain text ──────────────────────────────────────────────────────
    // Reject disguised binaries by leading signature.
    for (const { sig, label } of DANGEROUS_LEADING) {
      if (startsWith(head, sig)) {
        return { ok: false, detectedType: 'binary', reason: `CSV content looks like ${label}` };
      }
    }
    // A renamed Office file (ZIP) presented as .csv is also rejected.
    if (isZip(head)) {
      return { ok: false, detectedType: 'zip', reason: 'CSV content is actually a ZIP archive' };
    }
    // Plain-text requirement: no NUL bytes in the header chunk.
    if (head.includes(0x00)) {
      return { ok: false, detectedType: 'binary', reason: 'CSV contains NUL bytes (binary content)' };
    }
    // Script/markup payloads (PHP, JSP/ASP, HTML, XML) renamed to .csv start
    // with one of these markers at the very beginning of the file. A genuine
    // CSV starts with a header row of column names, never with these — so this
    // blocks the "rename evil.php → evil.csv" trick without flagging legitimate
    // shell/script text that lives *inside* a data column.
    let textStart = head.toString('utf8', 0, Math.min(head.length, 512));
    textStart = textStart.replace(/^\uFEFF/, '').replace(/^\s+/, '').toLowerCase();
    const SCRIPT_MARKERS = ['<?php', '<?=', '<?', '<%', '<script', '<!doctype', '<html', '#!/'];
    for (const marker of SCRIPT_MARKERS) {
      if (textStart.startsWith(marker)) {
        return { ok: false, detectedType: 'script', reason: `CSV begins with a script/markup marker ("${marker}")` };
      }
    }
    // Reject excessive non-text control bytes (allow tab/newline/CR).
    let suspicious = 0;
    for (let i = 0; i < head.length; i++) {
      const b = head[i];
      if (b < 0x09 || (b > 0x0d && b < 0x20)) suspicious++;
    }
    if (suspicious > head.length * 0.02) {
      return { ok: false, detectedType: 'binary', reason: 'CSV contains too many non-text control bytes' };
    }
    return { ok: true, detectedType: 'csv' };
  } catch (e: any) {
    return { ok: false, detectedType: 'unknown', reason: `Verification failed: ${e?.message || 'error'}` };
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}
