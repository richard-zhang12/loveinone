const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const groupSchema = new Schema({
    groupLeader: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    groupName: String,
    groupDetail: String,
    members: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    membersRequested: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    status: {
        type: String,
        default: 'Active'
    }
})

module.exports = mongoose.model('Group', groupSchema);