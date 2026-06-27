import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { FileParserService } from '../services/fileParserService';
import { verifyFileContent, isSafeFilename } from '../utils/fileSecurity';

const router = Router();
const fileParserService = new FileParserService();

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    // Never trust the client extension for the on-disk name. Derive a safe,
    // allow-listed extension and a random base — prevents path traversal and
    // overwrites. Original name is only kept (validated) for type detection.
    const rawExt = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.csv', '.xlsx', '.ods'].includes(rawExt) ? rawExt : '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 11)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.ms-excel',
      'application/octet-stream', // some browsers send this for .xlsx/.ods
    ];
    const allowedExts = ['.csv', '.xlsx', '.ods'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!isSafeFilename(file.originalname)) {
      cb(new Error('Unsafe filename'));
      return;
    }
    // Require BOTH a known extension and an acceptable declared mime.
    if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype} / ${ext}`));
    }
  },
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    files: 1,
    parts: 10,
  },
});

router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const cleanup = (p?: string) => { if (p) { try { fs.unlinkSync(p); } catch { /* ignore */ } } };

  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    // Defense-in-depth: ensure the stored path really sits inside the upload dir.
    const resolved = path.resolve(req.file.path);
    if (!resolved.startsWith(UPLOAD_DIR + path.sep)) {
      cleanup(resolved);
      res.status(400).json({ success: false, error: 'Invalid upload path' });
      return;
    }

    // ── Content verification — reject disguised / malformed files ──────────────
    const verdict = verifyFileContent(resolved, req.file.originalname);
    if (!verdict.ok) {
      cleanup(resolved);
      res.status(400).json({ success: false, error: `Rejected: ${verdict.reason}` });
      return;
    }

    let data;
    try {
      data = await fileParserService.parseFile(resolved, req.file.mimetype);
    } finally {
      // Always remove the temp file — even if parsing throws.
      cleanup(resolved);
    }

    // Cap row count to avoid memory abuse via crafted spreadsheets.
    const MAX_ROWS = 10000;
    if (data.length > MAX_ROWS) {
      res.status(400).json({ success: false, error: `Too many rows: ${data.length} (max ${MAX_ROWS})` });
      return;
    }

    res.json({
      success: true,
      data: {
        filename: req.file.originalname,
        size: req.file.size,
        rows: data,
        totalRows: data.length,
        preview: data.slice(0, 5),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    cleanup(req.file?.path);
    next(error);
  }
});

export { router as fileUploadRouter };
