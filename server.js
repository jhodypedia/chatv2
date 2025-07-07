const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql');
const multer = require('multer');
const venom = require('venom-bot');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

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

// === OTP VIA VENOM ===
let clientVenom;
let otpStore = {};

venom.create({ session: 'otp-session' }).then(client => {
  clientVenom = client;
  console.log('📲 Venom Ready');
});

app.post('/send-otp', async (req, res) => {
  let { phone } = req.body;
  if (phone.startsWith('08')) phone = '62' + phone.slice(1);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[phone] = otp;

  try {
    await clientVenom.sendText(`${phone}@c.us`, `Kode OTP kamu: *${otp}*`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  if (otpStore[phone] === otp) {
    delete otpStore[phone];
    // Tambahkan ke tabel users jika belum
    db.query('INSERT IGNORE INTO users (username) VALUES (?)', [phone]);
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false });
  }
});

// === FILE UPLOAD ===
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

// === API Tambahan ===
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

app.post('/last-seen', (req, res) => {
  const { username } = req.body;
  db.query('SELECT last_active FROM users WHERE username = ?', [username], (err, rows) => {
    if (err || rows.length === 0) return res.json({ last: null });
    res.json({ last: rows[0].last_active });
  });
});

app.post('/group-history', (req, res) => {
  const { groupId } = req.body;
  db.query('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC', [groupId], (err, rows) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, messages: rows });
  });
});

// === SOCKET.IO ===
let users = {};

io.on('connection', socket => {
  console.log('🔌 Socket:', socket.id);

  socket.on('register', (username) => {
    users[socket.id] = { id: socket.id, username };
    io.emit('user_list', Object.values(users));
  });

  socket.on('private_message', ({ to, message }) => {
    const fromUser = users[socket.id];
    if (!fromUser) return;
    db.query('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)', [fromUser.username, to, message]);
    io.to(to).emit('private_message', { from: socket.id, message });
  });

  socket.on('message_read', ({ from, to }) => {
    db.query('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?', [from, to]);
  });

  socket.on('typing', ({ to }) => {
    io.to(to).emit('typing', { from: socket.id });
  });

  // === Grup ===
  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
  });

  socket.on('group_message', ({ groupId, sender, message }) => {
    db.query('INSERT INTO group_messages (group_id, sender, content) VALUES (?, ?, ?)', [groupId, sender, message]);
    io.to(`group_${groupId}`).emit('group_message', { groupId, sender, message });
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
