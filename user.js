const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const Schema = mongoose.Schema;

//Schema
const userSchema = new mongoose.Schema({
  birthyear: Number,
  children: String,
  city: String,
  country: String,
  dateLogin: {
    type: Date,
    default: Date.now
  },
  dateMember: {  //last date as a member
    type: Date,
    default: Date.now
  },
  education: String,
  email: String,
  ethnicity: String,
  firstname: String,
  fullName: String,
  gender: String,
  height: String,
  image: {
    type: String,
    default: '/img/user.png'
  },
  lastname: String,
  nickname: String,
  religion: String,
  smoke: String,
  gotNewMsg: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'active'
  },
  wallet: {
    type: Number,
    default: 0
  },
});

userSchema.plugin(passportLocalMongoose, { usernameField: "email" });
module.exports = mongoose.model("User", userSchema);
