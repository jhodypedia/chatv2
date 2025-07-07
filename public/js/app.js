const socket = io();
let selectedUser = null;
let currentFocus = true;

const myUsername = localStorage.getItem('userPhone');
if (!myUsername) location.href = 'index.html';

socket.emit('register', myUsername);

// Fokus window
window.addEventListener('focus', () => currentFocus = true);
window.addEventListener('blur', () => currentFocus = false);

// Tampilkan daftar user
socket.on('user_list', users => {
  const list = document.getElementById('userList');
  list.innerHTML = '';
  users.forEach(user => {
    if (user.username === myUsername) return;
    const li = document.createElement('li');
    li.className = 'mb-2 p-2 rounded user-item';
    li.style.cursor = 'pointer';
    li.innerHTML = `
      <div class="d-flex align-items-center">
        <img src="https://ui-avatars.com/api/?name=${user.username}&background=random" class="rounded-circle me-2" width="36" height="36">
        <div>
          <strong>${user.username}</strong><br>
          <small class="text-success">Online</small>
        </div>
      </div>
    `;
    li.onclick = () => {
      selectedUser = user.username;
      document.getElementById('currentContact').textContent = user.username;
      document.getElementById('currentContact').dataset.username = user.username;
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

// Load riwayat chat
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

// Tambahkan bubble
function addMessageBubble(message, type, isRead = false, msgId = null, isDeleted = false) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${type}`;
  if (isDeleted) {
    bubble.innerHTML = `<i class="text-muted fst-italic">Pesan dihapus</i>`;
  } else if (message.startsWith('[file]')) {
    const url = message.replace('[file]', '');
    if (url.match(/\.(jpg|jpeg|png|gif)$/)) {
      bubble.innerHTML = `<img src="${url}" style="max-width:200px;border-radius:10px;" />`;
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

  const chatBox = document.getElementById('chatBox');
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
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

// Terima pesan
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

// Notifikasi sedang mengetik
document.getElementById('messageInput').addEventListener('input', () => {
  if (selectedUser) {
    socket.emit('typing', { to: selectedUser });
  }
});

socket.on('typing', ({ from }) => {
  const header = document.getElementById('currentContact');
  const original = header.dataset.username || header.textContent;

  header.textContent = `${from} sedang mengetik...`;
  header.dataset.username = original;

  clearTimeout(header.typingTimeout);
  header.typingTimeout = setTimeout(() => {
    header.textContent = original;
  }, 1500);
});
