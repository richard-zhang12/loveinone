const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const contactSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    contacts: [{
        contactUser: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        }
    }]
})

module.exports = mongoose.model('Contact', contactSchema);