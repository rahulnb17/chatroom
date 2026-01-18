require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const Room = require('./models/Room');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e7 // Increase buffer for images (10MB)
});

// Simple Bad Words Filter (Custom to avoid ESM issues)
const BAD_WORDS = ['badword', 'profanity', 'idiot']; // Add more as needed
const filter = {
  isProfane: (text) => BAD_WORDS.some(word => text.toLowerCase().includes(word)),
  clean: (text) => {
    let cleanText = text;
    BAD_WORDS.forEach(word => {
      const regex = new RegExp(word, 'gi');
      cleanText = cleanText.replace(regex, '*'.repeat(word.length));
    });
    return cleanText;
  }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Routes
// Create Room Endpoint (generates ID for frontend)
app.post('/api/create-room', async (req, res) => {
  try {
    const roomId = crypto.randomUUID().slice(0, 10);
    const { name } = req.body;
    // Room will be created in DB when first user joins or pre-created here
    // Pre-creating to set name
    const newRoom = new Room({
      roomId,
      name: name || 'Anonymous Room'
    });
    await newRoom.save();
    res.json({ roomId, name: newRoom.name });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'chat.html'));
});

// Socket logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', async ({ roomId, nickname }) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room) {
        return socket.emit('error', 'Room not found');
      }

      // Validations
      if (!nickname || nickname.length < 2) {
        return socket.emit('error', 'Nickname too short');
      }

      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      if (roomSize >= 50) {
        return socket.emit('error', 'Room is full (Max 50 participants)');
      }

      // Join room
      socket.join(roomId);
      socket.data.nickname = nickname;
      socket.data.roomId = roomId;

      // Notify room
      io.to(roomId).emit('user-joined', { nickname, count: roomSize + 1 });

      // Send history (last 50 messages)
      const history = room.messages.slice(-50);
      socket.emit('room-history', {
        messages: history,
        roomName: room.name,
        count: roomSize + 1
      });

    } catch (error) {
      console.error("Join error", error);
      socket.emit('error', 'Failed to join room');
    }
  });

  socket.on('send-message', async (data) => {
    const { roomId, content, type = 'text' } = data;
    const nickname = socket.data.nickname;

    if (!nickname || !roomId) return;

    try {
      let finalContent = content;

      // Moderation for text
      if (type === 'text') {
        if (filter.isProfane(content)) {
          finalContent = filter.clean(content);
        }
      }

      const room = await Room.findOne({ roomId });
      if (room) {
        await room.addMessage(nickname, finalContent, type);

        const messageData = {
          senderNickname: nickname,
          content: finalContent,
          type,
          createdAt: new Date()
        };

        io.to(roomId).emit('new-message', messageData);
      }
    } catch (error) {
      console.error("Message error", error);
    }
  });

  socket.on('disconnect', () => {
    const { roomId, nickname } = socket.data;
    if (roomId && nickname) {
      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit('user-left', { nickname, count: roomSize });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});