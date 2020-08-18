const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const postSchema = new Schema({
    postBody: String,
    image: String,
    postUser: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    date: {
        type: Date,
        default: Date.now
    },
    comments: [{
        commentUser: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        commentBody: String,
        date: {
            type: Date,
            default: Date.now
        }
    }],
    likes: [{
        likeUser: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        date: {
            type: Date,
            default: Date.now
        }
    }]

})

module.exports = mongoose.model('Post', postSchema);