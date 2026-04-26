import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { FileParserService } from '../services/fileParserService';

const router = Router();
const fileParserService = new FileParserService();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/octet-stream',   // some browsers send this for xlsx/ods
      'application/vnd.ms-excel',   // older xlsx
    ];
    const allowedExts = ['.csv', '.xlsx', '.ods'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype} / ${ext}`));
    }
  },
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
});

router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const data = await fileParserService.parseFile(req.file.path, req.file.mimetype);

    res.json({
      success: true,
      data: {
        filename: req.file.originalname,
        size: req.file.size,
        rows: data,           // full array — frontend reads data.rows
        totalRows: data.length,
        preview: data.slice(0, 5),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export { router as fileUploadRouter };
