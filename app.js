//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const flash = require("connect-flash");
// const multer = require('multer');
// const upload = multer({ dest: 'uploads/' })
const path = require('path');
var formidable = require('formidable');
const fs = require('fs');
const AWS = require('aws-sdk');
const app = express();
const s3 = new AWS.S3({
  accessKeyId: 'AKIAYSAXYZGENFNDDKPE',
  secretAccessKey: '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'
});

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
// mongodb://localhost:27017/userDB
mongoose.connect(connection, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
  useFindAndModify: false,
  autoIndex: false
}).catch(error => handldError(error));
// mongoose.set("useCreateIndex", true);

//Schema
const userSchema = new mongoose.Schema({
  email: String,
  firstname: String,
  lastname: String,
  gender: String,
  birthyear: Number,
  image: {
    type: String,
    default: '/img/user.png'
},
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
  if (req.isAuthenticated()) {
    res.render("home");
  } else {
    res.render("login", {message: ""});
  }
});

app.route("/contactus")
.get(function(req, res) {
  res.render("contactus");
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

app.get("/myinfo", function(req, res) {
  console.log(req.user);
  const getParams = {
    Bucket: 'online-dating-app2',
    Key: req.user.image
  }

  s3.getObject(getParams, function (err, data) {
    if (err) {
        console.log(err);
    } else {
        res.send({data}); 
    }
  });
  
  res.render("myinfo");
  // if (req.isAuthenticated()) {
  //   res.render("dating", {loginDisplay: "logout"});
  // } else {
  //   res.render("dating", {loginDisplay: "login"});
  // }
});

app.post('/uploadAvator', (req, res) => {
  var form = new formidable.IncomingForm();
  
  form.parse(req);
  form.on('fileBegin', function(name, file) {
    file.path = __dirname +'/public/img/' + file.name;
  });

  form.on('file', function (name, file){
    console.log(file.name);
    const fileName = file.name;
    const filecontent = fs.readFileSync(fileName);
    fs.readFile(fileName, (err, data) => {
      if (err) throw err;
      const params = {
          Bucket: 'online-dating-app2', // pass your bucket name
          Key: fileName, 
          Body: filecontent
      };
      s3.upload(params, function(s3Err, data) {
          if (s3Err) throw s3Err
          console.log(`File uploaded successfully at ${data.Location}`)
      });
   });

    User.findById({_id: req.user._id}, (err,user) => {
      if (err) {
        console.err(err);
      } else {
      user.image = file.name;    
      user.save((err) => {
        if (err) {
          throw err;
        } else {
          res.redirect('/myinfo');
        }
      });
      }
    });
  });

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
  successRedirect: "/",
  failureRedirect: "/login",
  failureFlash: true,
}));

app.route("/signup")
.get(function(req, res) {
  res.render("signup", {message: ""});
})
.post(function(req, res) {
  
  const {firstname, lastname, gender, birthyear, email, password} = req.body;
  User.findOne({email}, function(err,user){
    if (user) {
      res.render("signup", {message: "The username already exist, please try again!"});
    }
  });
  
  User.register({email, firstname, lastname, gender, birthyear}, password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/");
      })
    }
  });
});

app.listen(process.env.PORT || 3000, function() {
  console.log("Server started on port 3000");
});
