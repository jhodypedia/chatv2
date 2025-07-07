const socket = io();
let selectedUser = null;
let currentFocus = true;

const myUsername = localStorage.getItem('userPhone');
if (!myUsername) location.href = 'index.html';

socket.emit('register', myUsername);

window.addEventListener('focus', () => currentFocus = true);
window.addEventListener('blur', () => currentFocus = false);

// Load user list
socket.on('user_list', users => {
  const list = document.getElementById('userList');
  list.innerHTML = '';
  users.forEach(user => {
    if (user.username === myUsername) return;
    const li = document.createElement('li');
    li.className = 'list-group-item list-group-item-action';
    li.innerHTML = `<i class="fas fa-circle text-success me-1"></i> ${user.username}`;
    li.onclick = () => {
      selectedUser = user.username;
      document.getElementById('currentContact').textContent = user.username;
      loadChatHistory(user.username);
      fetch('/last-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      }).then(res => res.json()).then(data => {
        if (data.last) {
          const info = new Date(data.last).toLocaleString();
          document.getElementById('currentContact').textContent = `${user.username} (${info})`;
        }
      });
    };
    list.appendChild(li);
  });
});

// Load chat history
function loadChatHistory(user) {
  fetch('/chat-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user1: myUsername, user2: user })
  }).then(res => res.json()).then(data => {
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = '';
    if (data.success) {
      data.chats.forEach(chat => {
        const type = chat.sender_id === myUsername ? 'me' : 'other';
        addMessageBubble(chat.content, type, chat.is_read, chat.id, chat.is_deleted);
      });
      socket.emit('message_read', { from: user, to: myUsername });
    }
  });
}

// Tambah bubble chat
function addMessageBubble(message, type, isRead = false, msgId = null, isDeleted = false) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${type}`;
  if (isDeleted) {
    bubble.innerHTML = `<i class="text-muted fst-italic">Pesan dihapus</i>`;
  } else if (message.startsWith('[file]')) {
    const url = message.replace('[file]', '');
    if (url.match(/\.(jpg|jpeg|png|gif)$/)) {
      bubble.innerHTML = `<img src="${url}" />`;
    } else {
      bubble.innerHTML = `<a href="${url}" target="_blank">📄 Unduh File</a>`;
    }
  } else {
    bubble.textContent = message;
  }

  if (type === 'me' && isRead) {
    bubble.innerHTML += ' <i class="fas fa-check-circle text-primary ms-1"></i>';
  }

  if (type === 'me' && msgId && !isDeleted) {
    bubble.onclick = () => {
      if (confirm('Hapus pesan ini?')) {
        fetch('/delete-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: msgId })
        }).then(() => loadChatHistory(selectedUser));
      }
    };
  }

  document.getElementById('chatBox').appendChild(bubble);
  document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight;
}

// Kirim pesan
function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message || !selectedUser) return;
  socket.emit('private_message', { to: selectedUser, message });
  addMessageBubble(message, 'me');
  input.value = '';
}

// Terima pesan masuk
socket.on('private_message', ({ from, message }) => {
  if (from === selectedUser) {
    addMessageBubble(message, 'other');
  } else if (!currentFocus) {
    document.getElementById('notifAudio').play();
  }
});

// Upload file
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

// Emoji Picker
function toggleEmoji() {
  const picker = document.getElementById('emojiPicker');
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

document.getElementById('emojiPicker').addEventListener('emoji-click', event => {
  const input = document.getElementById('messageInput');
  input.value += event.detail.unicode;
});

// Dark Mode Toggle
function toggleMode() {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', document.body.classList.contains('dark'));
}

window.onload = () => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  if (isDark) document.body.classList.add('dark');
};

// Voice-to-Text
function startVoiceInput() {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'id-ID';
  recognition.onresult = event => {
    document.getElementById('messageInput').value += event.results[0][0].transcript;
  };
  recognition.start();
}

// GIPHY Integration
const giphyApiKey = 'YOUR_GIPHY_API_KEY'; // ← Ganti dengan API Key Anda

document.getElementById('gifSearch').addEventListener('input', async (e) => {
  const q = e.target.value;
  if (!q) return;
  const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${giphyApiKey}&q=${q}&limit=6`);
  const data = await res.json();
  const gifResults = document.getElementById('gifResults');
  gifResults.innerHTML = '';
  data.data.forEach(gif => {
    const url = gif.images.fixed_height.url;
    const img = document.createElement('img');
    img.src = url;
    img.style = 'max-width:100px;cursor:pointer';
    img.onclick = () => {
      socket.emit('private_message', { to: selectedUser, message: `[file]${url}` });
      addMessageBubble(`[file]${url}`, 'me');
    };
    gifResults.appendChild(img);
  });
});
