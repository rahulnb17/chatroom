const socket = io({
  autoConnect: false,
  reconnection: false
});

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room");

// DOM Elements
const loginView = document.getElementById('loginView');
const chatContainer = document.getElementById('chatContainer');
const nicknameInput = document.getElementById('nicknameInput');
const joinBtn = document.getElementById('joinBtn');
const chatBox = document.getElementById('chatBox');
const msgForm = document.getElementById('msgForm');
const msgInput = document.getElementById('msgInput');
const roomNameEl = document.getElementById('roomName');
const userCountEl = document.getElementById('userCount');

let myNickname = sessionStorage.getItem(`nick_${roomId}`) || '';

// Initialize View
if (!roomId) {
  alert("No room specified!");
  window.location.href = '/';
} else if (myNickname) {
  showChat();
  connectSocket();
} else {
  // Already in login view
}

// Join Room Logic
joinBtn.addEventListener('click', () => {
  const nick = nicknameInput.value.trim();
  if (nick.length < 2) return alert('Nickname must be at least 2 characters');

  myNickname = nick;
  sessionStorage.setItem(`nick_${roomId}`, nick);

  showChat();
  connectSocket();
});

function showChat() {
  loginView.style.display = 'none';
  chatContainer.classList.remove('hidden');
}

function connectSocket() {
  socket.auth = { roomId, nickname: myNickname };
  socket.connect();

  socket.emit('join-room', { roomId, nickname: myNickname });
}

// Socket Events
socket.on('connect_error', (err) => {
  alert(err.message);
  if (err.message.includes('full') || err.message.includes('fane')) {
    window.location.href = '/';
  }
});

socket.on('error', (msg) => {
  alert(msg);
});

socket.on('room-history', (data) => {
  roomNameEl.textContent = data.roomName;
  userCountEl.textContent = data.count;

  chatBox.innerHTML = ''; // Clear existing
  data.messages.forEach(msg => appendMessage(msg));
  scrollToBottom();
});

socket.on('user-joined', (data) => {
  userCountEl.textContent = data.count;
  appendSystemMessage(`${data.nickname} joined the room`);
});

socket.on('user-left', (data) => {
  userCountEl.textContent = data.count;
  appendSystemMessage(`${data.nickname} left the room`);
});

socket.on('new-message', (msg) => {
  appendMessage(msg);
  scrollToBottom();
});

// Sending Messages
msgForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = msgInput.value.trim();
  if (!content) return;

  socket.emit('send-message', { roomId, content, type: 'text' });
  msgInput.value = '';
});

// Image Paste Handling
msgInput.addEventListener('paste', (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;

  for (const item of items) {
    if (item.type.indexOf('image') === 0) {
      e.preventDefault();
      const blob = item.getAsFile();
      const reader = new FileReader();

      reader.onload = function (event) {
        const base64 = event.target.result;
        // Check size (approx 5MB limit check before sending)
        if (base64.length > 7000000) {
          return alert('Image too large (Max ~5MB)');
        }

        socket.emit('send-message', { roomId, content: base64, type: 'image' });
      };

      reader.readAsDataURL(blob);
    }
  }
});

// UI Helpers
function appendMessage(msg) {
  const div = document.createElement('div');
  const isSelf = msg.senderNickname === myNickname;
  div.className = `message ${isSelf ? 'self' : 'other'}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = isSelf ? 'You' : msg.senderNickname;
  div.appendChild(meta);

  if (msg.type === 'image') {
    const img = document.createElement('img');
    img.src = msg.content;
    img.onclick = () => {
      const w = window.open("");
      w.document.write(img.outerHTML);
    };
    div.appendChild(img);
  } else {
    const p = document.createElement('div');
    p.textContent = msg.content; // textContent handles avoiding HTML injection
    div.appendChild(p);
  }

  chatBox.appendChild(div);
}

function appendSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  chatBox.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}
