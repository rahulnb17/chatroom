const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderNickname: {
    type: String,
    required: true
  },
  content: {
    type: String, // Can be text or base64 image
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image'],
    default: 'text'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  // 12-hour TTL: MongoDB will delete the document after this time
  expireAt: {
    type: Date,
    default: () => new Date(+new Date() + 12*60*60*1000), // 12 hours from now
    index: { expires: 0 } 
  },
  messages: [messageSchema],
  lastActivity: {
    type: Date,
    default: Date.now
  }
});

// Method to add a message to the room
roomSchema.methods.addMessage = function(senderNickname, content, type = 'text') {
  this.messages.push({ senderNickname, content, type });
  this.lastActivity = Date.now();
  return this.save();
};

module.exports = mongoose.model("Room", roomSchema);
