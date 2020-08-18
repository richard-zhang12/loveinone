const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const zipSchema = new mongoose.Schema({
    _id: String,
    city: String,
    state: String
});

module.exports = mongoose.model("Zip", zipSchema);
