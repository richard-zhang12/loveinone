const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const { isDate } = require('moment');
const Schema = mongoose.Schema;

//Schema
const userSchema = new mongoose.Schema({
  aboutMe: String,
  aboutYou: String,
  aboutUs: String,
  age: String,
  bodytype: String,
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
  follows: [{
    _id: {
      type: Schema.Types.ObjectId
    }
  }],
  gender: String,
  gotNewMsg: {
    type: Boolean,
    default: false
  },
  height: String,
  image: {
    type: String,
    default: '/img/user.png'
  },
  maritalStatus: String,
  profession: String,
  religion: String,
  state: String,
  status: {
    type: String,
    default: 'Active'
  },
  username: String,
  wallet: {
    type: Number,
    default: 0
  },
  zipcode: String
});

userSchema.plugin(passportLocalMongoose, { usernameField: "email" });
module.exports = mongoose.model("User", userSchema);
