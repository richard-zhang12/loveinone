const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const { isDate } = require('moment');
const Schema = mongoose.Schema;

//Schema
const userSchema = new mongoose.Schema({
  aboutMe: String,
  bodytype: String,
  children: String,
  city: String,
  contacts: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
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
    type: Schema.Types.ObjectId,
    ref: 'Group'
  }],
  gender: String,
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
  yearBorn: String,
  zipcode: String
});

userSchema.plugin(passportLocalMongoose, { usernameField: "email" });
module.exports = mongoose.model("User", userSchema);
