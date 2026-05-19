require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const util = require('util');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const { extractTextFromFile, normalizeText } = require('./services/fileProcessor');

const app = express();
const PORT = process.env.PORT || 3000;
const fetch = global.fetch || require('node-fetch');
const HF_AI_ENDPOINT = 'https://ziad9022-fci-ai-assistant.hf.space/api/chat';

let dbGet;
let dbAll;
let dbRun;

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'academyai.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    dbGet = util.promisify(db.get.bind(db));
    dbAll = util.promisify(db.all.bind(db));
    dbRun = util.promisify(db.run.bind(db));
    console.log('Connected to SQLite database.');
    initDatabase();
  }
});

// Initialize database tables and schema
function initDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Files table with subject and processing metadata
    db.run(`CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      subject_code TEXT,
      file_type TEXT,
      original_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      extracted_text TEXT,
      processed INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Ensure old databases get the missing columns if needed
    migrateFilesTable();

    // Course subjects table
    db.run(`CREATE TABLE IF NOT EXISTS courses (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      credits INTEGER NOT NULL,
      prerequisites TEXT,
      description TEXT
    )`);

    // Insert sample courses
    initCourses();
  });
}

// Initialize courses data
function initCourses() {
  const courses = [
    { code: 'CS101', name: 'مقدمة في علوم الحاسب', credits: 3, prerequisites: null, description: 'أساسيات علوم الحاسب والبرمجة' },
    { code: 'CS102', name: 'برمجة هيكلية', credits: 3, prerequisites: 'CS101', description: 'تعلم البرمجة الهيكلية والمتقدمة' },
    { code: 'CS201', name: 'هياكل البيانات', credits: 3, prerequisites: 'CS102', description: 'دراسة هياكل البيانات الأساسية والمتقدمة' },
    { code: 'CS202', name: 'خوارزميات', credits: 3, prerequisites: 'CS201', description: 'تصميم وتحليل الخوارزميات' },
    { code: 'CS301', name: 'قواعد البيانات', credits: 3, prerequisites: 'CS102', description: 'تصميم وإدارة قواعد البيانات' },
    { code: 'CS302', name: 'شبكات الحاسب', credits: 3, prerequisites: 'CS102', description: 'أساسيات شبكات الحاسب والاتصالات' },
    { code: 'CS401', name: 'ذكاء اصطناعي', credits: 3, prerequisites: 'CS202', description: 'مبادئ الذكاء الاصطناعي والتعلم الآلي' },
    { code: 'CS403', name: 'تخزين واسترجاع المعلومات', credits: 3, prerequisites: 'CS102', description: 'مفاهيم البحث عن المعلومات، الفهرسة، الزحف، وتحليل الروابط' },
    { code: 'CS402', name: 'أمن المعلومات', credits: 3, prerequisites: 'CS302', description: 'أساسيات أمن المعلومات والتشفير' },
    { code: 'MATH101', name: 'رياضيات متقطعة', credits: 3, prerequisites: null, description: 'مفاهيم رياضية أساسية لعلوم الحاسب' },
    { code: 'MATH201', name: 'إحصاء وحسابات احتمالية', credits: 3, prerequisites: 'MATH101', description: 'إحصاء ونظرية الاحتمالات' }
  ];

  courses.forEach(course => {
    db.run(`INSERT OR IGNORE INTO courses (code, name, credits, prerequisites, description)
             VALUES (?, ?, ?, ?, ?)`,
             [course.code, course.name, course.credits, course.prerequisites, course.description]);
  });
}

function migrateFilesTable() {
  dbAll('PRAGMA table_info(files)').then(columns => {
    const columnNames = columns.map(col => col.name);

    const migrationSteps = [];
    if (!columnNames.includes('subject_code')) {
      migrationSteps.push(dbRun('ALTER TABLE files ADD COLUMN subject_code TEXT'));
    }
    if (!columnNames.includes('file_type')) {
      migrationSteps.push(dbRun('ALTER TABLE files ADD COLUMN file_type TEXT'));
    }
    if (!columnNames.includes('upload_date')) {
      migrationSteps.push(dbRun('ALTER TABLE files ADD COLUMN upload_date DATETIME DEFAULT CURRENT_TIMESTAMP'));
    }

    return Promise.all(migrationSteps);
  }).catch(err => {
    console.error('Migration error for files table:', err);
  });
}

async function processUploadedFile(fileId) {
  try {
    const fileRow = await dbGet('SELECT * FROM files WHERE id = ?', [fileId]);
    if (!fileRow) {
      throw new Error('ملف غير موجود');
    }

    const filePath = path.join(uploadsDir, fileRow.filename);
    const content = await extractTextFromFile(filePath);
    const normalized = normalizeText(content);
    await dbRun('UPDATE files SET extracted_text = ?, processed = 1 WHERE id = ?', [normalized, fileId]);
  } catch (error) {
    console.error('File processing error:', error);
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع ملفات PDF أو TXT فقط.'));
    }
  }
});

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'رمز الوصول مطلوب' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'رمز الوصول غير صالح' });
    }
    req.user = user;
    next();
  });
}

// Routes

// Authentication routes
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    // Check if user exists
    db.get('SELECT email FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
      }

      if (row) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user
      db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
             [name, email, hashedPassword], function(err) {
        if (err) {
          return res.status(500).json({ error: 'فشل في إنشاء الحساب' });
        }

        const token = jwt.sign(
          { id: this.lastID, email },
          process.env.JWT_SECRET || 'your-secret-key',
          { expiresIn: '24h' }
        );

        res.status(201).json({
          message: 'تم إنشاء الحساب بنجاح',
          token,
          user: { id: this.lastID, name, email }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
      }

      if (!user) {
        return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      res.json({
        message: 'تم تسجيل الدخول بنجاح',
        token,
        user: { id: user.id, name: user.name, email: user.email }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Helper to resolve uploaded file path by id or filename
function resolveUploadedFilePath(userId, fileIdentifier, callback) {
  if (!fileIdentifier) {
    return callback(new Error('معرف الملف مطلوب'));
  }

  db.get('SELECT filename FROM files WHERE user_id = ? AND (id = ? OR filename = ?)',
         [userId, fileIdentifier, fileIdentifier], (err, row) => {
    if (err) {
      return callback(err);
    }
    if (!row) {
      return callback(new Error('الملف غير موجود أو غير مخول'));
    }
    callback(null, path.join(uploadsDir, row.filename));
  });
}

// File upload
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
    }

    const { originalname, filename } = req.file;
    const subjectCode = req.body.subjectCode;
    const fileType = req.body.fileType || 'material';

    if (!subjectCode) {
      return res.status(400).json({ error: 'يرجى اختيار المادة' });
    }

    const fileId = uuidv4();
    await dbRun('INSERT INTO files (id, user_id, subject_code, file_type, original_name, filename) VALUES (?, ?, ?, ?, ?, ?)',
                [fileId, req.user.id, subjectCode, fileType, originalname, filename]);

    await processUploadedFile(fileId);

    res.json({
      message: 'تم رفع الملف ومعالجته بنجاح',
      fileId,
      originalName: originalname,
      filename,
      subjectCode,
      fileType
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'خطأ في رفع الملف' });
  }
});

// Get files
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const subjectCode = req.query.subjectCode;
    let rows;

    if (subjectCode) {
      rows = await dbAll('SELECT id, original_name as name, filename, subject_code as subjectCode, file_type as fileType, upload_date as uploadDate FROM files WHERE user_id = ? AND subject_code = ? ORDER BY upload_date DESC',
                        [req.user.id, subjectCode]);
    } else {
      rows = await dbAll('SELECT id, original_name as name, filename, subject_code as subjectCode, file_type as fileType, upload_date as uploadDate FROM files WHERE user_id = ? ORDER BY upload_date DESC',
                        [req.user.id]);
    }

    res.json(rows);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'فشل في استرجاع الملفات' });
  }
});

// Get courses
app.get('/api/courses', (req, res) => {
  db.all('SELECT * FROM courses ORDER BY code', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'فشل في استرجاع الدورات' });
    }
    res.json(rows);
  });
});

// Proxy HF endpoint for chat
app.post('/api/chat', async (req, res) => {
  const { inputs, parameters } = req.body;

  if (!inputs) {
    return res.status(400).json({ error: 'حقل inputs مطلوب لإرسال الطلب' });
  }

  try {
    const hfResponse = await fetch(HF_AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs, parameters: parameters || {} })
    });

    const data = await hfResponse.json().catch(() => null);

    if (!hfResponse.ok) {
      return res.status(502).json({
        error: 'فشل في الاتصال بخدمة HF الخارجية',
        details: data || await hfResponse.text()
      });
    }

    res.json(data);
  } catch (error) {
    console.error('HF proxy error:', error);
    res.status(500).json({ error: 'حدث خطأ في خادم الوكيل' });
  }
});

// Serve uploaded files
app.get('/api/files/:filename', authenticateToken, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'الملف غير موجود' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الملف كبير جداً. الحد الأقصى 50MB.' });
    }
  }
  res.status(500).json({ error: 'خطأ في الخادم' });
});

// Start server
app.listen(PORT, () => {
  console.log(`خادم Academy يعمل على المنفذ ${PORT}`);
});