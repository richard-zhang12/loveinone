//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const flash = require("connect-flash");
const app = express();
app.use(flash());
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
// const keys = require('./config/keys');
app.use(session({
  secret: 'Our little secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

let connection;
if (process.env.NODE_ENV === 'production') {
  connection = process.env.DB_MONGO;
} else {
  connection = process.env.DB_LOCAL;
}
mongoose.connect(connection, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
  useFindAndModify: false,
  autoIndex: false
});
// mongoose.set("useCreateIndex", true);

//Schema
const userSchema = new mongoose.Schema({
  email: String,
  firstname: String,
  lastname: String,
  gender: String,
  birthday: Date,
  image: String,
  zipcode: String,
  city: String,
  country: String,
  wallet: {
    type: Number,
    default: 0
  }
});
const messageSchema = new mongoose.Schema({
  fullname: String,
  email: String,
  message: String
});

userSchema.plugin(passportLocalMongoose, {usernameField: "email"});
const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

// Make user global object
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
})
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get("/", function(req, res) {
  res.render("home");
  // if (req.isAuthenticated()) {
  //   res.render("home", {loginDisplay: "logout"});
  // } else {
  //   res.render("home", {loginDisplay: "login"});
  // }
});

app.route("/contact")
.get(function(req, res) {
  res.render("contact");
  // if (req.isAuthenticated()) {
  //   res.render("contact", {loginDisplay: "logout"});
  // } else {
  //   res.render("contact", {loginDisplay: "login"});
  // }
})
.post(function(req, res) {
  const newMessage = new Message({
    fullname: req.body.fullname,
    email: req.body.email,
    message: req.body.message
  });
  newMessage.save(function(err){
    if(!err) {
      res.render('message', {message: newMessage});
    }
  });

});

app.get("/dating", function(req, res) {
  res.render("dating");
  // if (req.isAuthenticated()) {
  //   res.render("dating", {loginDisplay: "logout"});
  // } else {
  //   res.render("dating", {loginDisplay: "login"});
  // }
});

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

app.route("/login")
.get(function(req, res) {
  res.render("login", {message: req.flash("error")});
})
.post(passport.authenticate("local", {
  successRedirect: "/dating",
  failureRedirect: "/login",
  failureFlash: true,
}));

app.route("/signup")
.get(function(req, res) {
  res.render("signup", {message: ""});
})
.post(function(req, res) {
  
  const {firstname, lastname, gender, birthday, email, password} = req.body;
  User.findOne({email}, function(err,user){
    if (user) {
      res.render("signup", {message: "The username already exist, please try again!"});
    }
  });
  
  User.register({email, firstname, lastname, gender, birthday}, password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/dating");
      })
    }
  });
});

app.listen(process.env.PORT || 3000, function() {
  console.log("Server started on port 3000");
});
