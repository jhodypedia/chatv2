const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// MySQL koneksi
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'nongchat'
});
db.connect(err => {
  if (err) throw err;
  console.log('🟢 DB connected');
});

// Upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// Chat history
app.post('/chat-history', (req, res) => {
  const { user1, user2 } = req.body;
  db.query(`
    SELECT * FROM messages 
    WHERE 
      (sender_id = ? AND receiver_id = ?) OR 
      (sender_id = ? AND receiver_id = ?)
    ORDER BY timestamp ASC
  `, [user1, user2, user2, user1], (err, rows) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, chats: rows });
  });
});

app.post('/delete-message', (req, res) => {
  const { id } = req.body;
  db.query('UPDATE messages SET is_deleted = 1 WHERE id = ?', [id], err => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

// Last seen
app.post('/last-seen', (req, res) => {
  const { username } = req.body;
  db.query('SELECT last_active FROM users WHERE username = ?', [username], (err, rows) => {
    if (err || rows.length === 0) return res.json({ last: null });
    res.json({ last: rows[0].last_active });
  });
});

// Socket.IO
let users = {};

io.on('connection', socket => {
  console.log('🔌 Socket:', socket.id);

  socket.on('register', (username) => {
    users[socket.id] = { id: socket.id, username };

    // Simpan user ke DB jika belum
    db.query('INSERT IGNORE INTO users (username) VALUES (?)', [username]);
    io.emit('user_list', Object.values(users));
  });

  socket.on('private_message', ({ to, message }) => {
    const fromUser = users[socket.id];
    if (!fromUser) return;

    db.query('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [fromUser.username, to, message]);

    const receiver = Object.values(users).find(u => u.username === to);
    if (receiver) {
      io.to(receiver.id).emit('private_message', { from: fromUser.username, message });
    }
  });

  socket.on('message_read', ({ from, to }) => {
    db.query('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?', [from, to]);
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      db.query('UPDATE users SET last_active = NOW() WHERE username = ?', [user.username]);
    }
    delete users[socket.id];
    io.emit('user_list', Object.values(users));
  });
});

server.listen(3000, () => {
  console.log('🚀 Server jalan di http://localhost:3000');
});
