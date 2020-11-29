const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const chatSchema = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  name:String,
  image: {
    type: String,
    default: '/img/multi-user.png'
  }, 
  groupId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  // },
  gotNewMsg: {   
    type: Boolean,
    default: false
  },
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    date: {
      type: Date,
      default: Date.now
    },
  }]
});

module.exports = mongoose.model("Chat", chatSchema);
