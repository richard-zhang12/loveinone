const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const chatloadSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group'
    },
    heading: String,
    text: String,
    date: {
      type: Date,
      default: Date.now
    },
    image: {
        type: String,
        default: '/img/user.png'
    },
});

module.exports = mongoose.model("Chatload", chatloadSchema);