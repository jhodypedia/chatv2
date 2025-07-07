const socket = io();
let selectedUser = null;
const myUsername = localStorage.getItem('userPhone');
if (!myUsername) location.href = 'index.html';

socket.emit('register', myUsername);

// Load User List
socket.on('user_list', users => {
  const list = document.getElementById('userList');
  list.innerHTML = '';
  users.forEach(user => {
    if (user.username === myUsername) return;
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = user.username;
    li.onclick = () => {
      selectedUser = user.username;
      document.getElementById('currentContact').textContent = user.username;
      loadChatHistory(user.username);
    };
    list.appendChild(li);
  });
});

// Load History
function loadChatHistory(user) {
  fetch('/chat-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user1: myUsername, user2: user })
  })
    .then(res => res.json())
    .then(data => {
      const chatBox = document.getElementById('chatBox');
      chatBox.innerHTML = '';
      if (data.success) {
        data.chats.forEach(chat => {
          const type = chat.sender_id === myUsername ? 'me' : 'other';
          addMessageBubble(chat.content, type);
        });
        socket.emit('message_read', { from: user, to: myUsername });
      }
    });
}

// Kirim Pesan
function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message || !selectedUser) return;

  socket.emit('private_message', { to: selectedUser, message });
  addMessageBubble(message, 'me');
  input.value = '';
}

// Terima Pesan Masuk
socket.on('private_message', ({ from, message }) => {
  if (from === selectedUser) {
    addMessageBubble(message, 'other');
  } else {
    document.getElementById('notifAudio').play();
  }
});

// Bubble
function addMessageBubble(message, type) {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  if (message.startsWith('[file]')) {
    const url = message.replace('[file]', '');
    if (url.match(/\.(jpg|jpeg|png|gif)$/)) {
      div.innerHTML = `<img src="${url}" class="img-fluid rounded" style="max-width:200px;">`;
    } else {
      div.innerHTML = `<a href="${url}" target="_blank">📄 Unduh File</a>`;
    }
  } else {
    div.textContent = message;
  }
  document.getElementById('chatBox').appendChild(div);
  document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight;
}

// Upload
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !selectedUser) return;
  const formData = new FormData();
  formData.append('file', file);
  fetch('/upload', { method: 'POST', body: formData })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const message = `[file]${data.url}`;
        socket.emit('private_message', { to: selectedUser, message });
        addMessageBubble(message, 'me');
      }
    });
});

// Toggle Mode
function toggleMode() {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', document.body.classList.contains('dark'));
}

window.onload = () => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  if (isDark) document.body.classList.add('dark');
};
