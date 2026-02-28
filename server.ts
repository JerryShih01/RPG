import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'game.db');
const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gender TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'pre' or 'post'
    score INTEGER NOT NULL,
    answers TEXT NOT NULL, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    levels_completed INTEGER DEFAULT 0,
    badges TEXT DEFAULT '[]', -- JSON string array of badge IDs
    finished_game BOOLEAN DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post('/api/users', (req, res) => {
    try {
      const { name, gender } = req.body;
      const stmt = db.prepare('INSERT INTO users (name, gender) VALUES (?, ?)');
      const info = stmt.run(name, gender);
      
      // Initialize progress
      const progressStmt = db.prepare('INSERT INTO progress (user_id) VALUES (?)');
      progressStmt.run(info.lastInsertRowid);

      res.json({ id: info.lastInsertRowid, name, gender });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.post('/api/quiz', (req, res) => {
    try {
      const { user_id, type, score, answers } = req.body;
      const stmt = db.prepare('INSERT INTO quiz_results (user_id, type, score, answers) VALUES (?, ?, ?, ?)');
      stmt.run(user_id, type, score, JSON.stringify(answers));
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to save quiz result' });
    }
  });

  app.post('/api/progress', (req, res) => {
    try {
      const { user_id, levels_completed, badges, finished_game } = req.body;
      const stmt = db.prepare(`
        UPDATE progress 
        SET levels_completed = ?, badges = ?, finished_game = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      stmt.run(levels_completed, JSON.stringify(badges), finished_game ? 1 : 0, user_id);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });

  app.get('/api/admin/export', (req, res) => {
    try {
      const users = db.prepare('SELECT * FROM users').all();
      const quizzes = db.prepare('SELECT * FROM quiz_results').all();
      const progress = db.prepare('SELECT * FROM progress').all();
      
      res.json({ users, quizzes, progress });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production (if we were building for prod)
    app.use(express.static(path.join(__dirname, 'dist')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
