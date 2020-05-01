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

app.use(session({
  secret: 'Our little secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// mongoose.connect('mongodb://localhost:27017/userDB', {
mongoose.connect(process.env.DB_MONGO, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
  useFindAndModify: false,
  autoIndex: false
});
// mongoose.set("useCreateIndex", true);
const userSchema = new mongoose.Schema({
  email: String,
  firstname: String,
  lastname: String
});

userSchema.plugin(passportLocalMongoose, {usernameField: "email"});

const User = mongoose.model("User", userSchema);
// Make user global object
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
})
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get("/", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("home", {loginDisplay: "d-none", logoutDisplay: "d-block"});
  } else {
    res.render("home", {loginDisplay: "d-block", logoutDisplay: "d-none"});
  }
});

app.get("/contact", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("contact", {loginDisplay: "d-none", logoutDisplay: "d-block"});
  } else {
    res.redirect("/login");
  }
});

app.get("/dating", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("dating", {loginDisplay: "d-none", logoutDisplay: "d-block"});
  } else {
    res.redirect("/login");
  }
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

  // const user = new User({
  //   username: req.body.username,
  //   password: req.body.password
  // });
  // req.login(user, function(err){    
    
  //   if (err) {
  //     res.render("signin", {message: "Incorrect login, please try again."});
  //   } else {  
  //     passport.authenticate("local")(req, res, function() {
        
  //       res.redirect("/myDate");
  //     });
  //   }
  // });
// });

app.route("/signup")
.get(function(req, res) {
  res.render("signup", {message: ""});
})
.post(function(req, res) {
  const {firstname, lastname, email, password} = req.body
  User.findOne({email}, function(err,user){
    if (user) {
      res.render("signup", {message: "The username already exist, please try again!"});
    }
  });
  
  User.register({email, firstname, lastname}, password, function(err, user) {
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
