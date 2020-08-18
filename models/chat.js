const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const chatSchema = new mongoose.Schema({
    chatter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    gotNewMsg: {   //when chatter receives new message from chatmate, this value is set to true
      type: Boolean,
      default: false
    },
    chatmate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: {
      type: Date,
      default: Date.now
    },
    messages: [{
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      message: String,
      date: {
        type: Date,
        default: Date.now
      },
    }]
  });
  
  module.exports = mongoose.model("Chat", chatSchema);
  