// server.js — 本地后端（Express + Multer + SQLite）
// 路线C：前端托管到 GitHub Pages/Vercel 等，后端在本机运行，通过隧道公网访问
// 运行：
//   npm i
//   node server.js --init-db   # 初始化数据库（读取 schema.sql）
//   node server.js              # 启动服务（默认端口 3000）

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

// ====== 环境变量（Windows PowerShell 临时设置示例）======
// $env:PORT = "3000"
// $env:DB_FILE = "video-law.db"
// $env:UPLOAD_DIR = "D:/video-uploads"   # 可改，默认 ./uploads
// $env:ALLOWED_ORIGINS = "https://yourname.github.io,https://xxxx.trycloudflare.com,https://xxxxx.ngrok-free.app"
// $env:MAX_FILE_MB = "800"

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = path.resolve(__dirname, process.env.DB_FILE || 'video-law.db');
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 800);

// 允许的跨域来源（前端域名）。留空则放行所有来源（开发期方便）
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();

// ====== CORS（按白名单放行）======
const corsOptions = {
  origin: function(origin, callback) {
    // 无 Origin（如 Postman/同源静态托管）直接放行
    if (!origin) return callback(null, true);
    if (ALLOWED.length === 0 || ALLOWED.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS: ' + origin));
  }
};
app.use(cors(corsOptions));

// ====== 静态托管（本地开发用）======
// 你如果想同源访问（方案A/开发），可以把 index.html 放到与 server.js 同目录
app.use(express.static(__dirname));

// 确保上传目录存在
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ====== Multer：保存到磁盘，限制大小 ======
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.mp4';
    const base = path.basename(file.originalname || 'upload', ext)
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40);
    const unique = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    cb(null, `${base}_${unique}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('video/')) return cb(null, true);
    cb(new Error('只允许上传视频文件'));
  }
});

// ====== SQLite 连接 ======
const db = new sqlite3.Database(DB_FILE);

function runExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this); // this.lastID, this.changes
    });
  });
}

// ====== 初始化数据库：读取 schema.sql 并执行 ======
async function initDb() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) throw new Error('未找到 schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await runExec(sql);
  console.log('[OK] 数据库初始化完成');
}

// ====== API ======
app.get('/api/health', (req, res) => {
  res.json({ ok: true, msg: 'healthy', uploadDir: UPLOAD_DIR, db: DB_FILE });
});

// 获取所有类型（从 statutes.category 去重）
app.get('/api/types', async (req, res) => {
  try {
    const rows = await all('SELECT DISTINCT category FROM statutes ORDER BY category');
    res.json({ ok: true, types: rows.map(r => r.category) });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// 最近上传视频
app.get('/api/videos', async (req, res) => {
  try {
    const rows = await all(
      'SELECT id, filename, original_name, mime_type, size_bytes, types, uploaded_at FROM videos ORDER BY uploaded_at DESC, id DESC LIMIT 50'
    );
    res.json({ ok: true, items: rows });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// 上传视频并匹配法条
app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) throw new Error('未接收到文件');

    // types 兼容：逗号分隔字符串或数组
    let types = req.body.types;
    if (Array.isArray(types)) {
      types = types.join(',');
    } else if (typeof types === 'string') {
      // 可能是 "校园暴力,公共安全"
    } else {
      types = '';
    }

    const typesArray = types
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // 写入 videos 表
    const info = await run(
      'INSERT INTO videos (filename, original_name, mime_type, size_bytes, types) VALUES (?, ?, ?, ?, ?)',
      [
        req.file.filename,
        req.file.originalname || req.file.filename,
        req.file.mimetype || 'video/unknown',
        req.file.size || 0,
        typesArray.join(',')
      ]
    );

    // 匹配 statutes
    let matched = [];
    if (typesArray.length) {
      const placeholders = typesArray.map(() => '?').join(',');
      matched = await all(
        `SELECT id, category, law_name, article, content
         FROM statutes WHERE category IN (${placeholders})
         ORDER BY category, id`,
        typesArray
      );
    }

    res.json({
      ok: true,
      video: {
        id: info.lastID,
        filename: req.file.filename,
        original_name: req.file.originalname || req.file.filename,
        mime_type: req.file.mimetype || 'video/unknown',
        size_bytes: req.file.size || 0,
        types: typesArray
      },
      matched_statutes: matched
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ ok: false, msg: e.message });
  }
});

// 托管上传文件：/uploads/<filename>
app.use('/uploads', express.static(UPLOAD_DIR));

// ====== 启动 / 初始化入口 ======
(async () => {
  if (process.argv.includes('--init-db')) {
    try {
      await initDb();
      process.exit(0);
    } catch (e) {
      console.error('[ERR] 初始化失败：', e);
      process.exit(1);
    }
  } else {
    app.listen(PORT, () => {
      console.log(`[OK] 服务已启动 http://localhost:${PORT}`);
      console.log(`[i] DB = ${DB_FILE}`);
      console.log(`[i] UPLOAD_DIR = ${UPLOAD_DIR}`);
      console.log(`[i] 允许的跨域来源 = ${ALLOWED.length ? ALLOWED.join(', ') : '(未设置，全部放行)'}`);
    });
  }
})();
