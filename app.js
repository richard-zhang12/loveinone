//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const flash = require("connect-flash");
const multer = require("multer");
const moment = require("moment");
const AWS = require('aws-sdk');
const upload = require('./file-upload');
const singleUpload = upload.single('avatar');
const User = require('./user');
const ejs = require('ejs');
const app = express();

const Keys = require('./config/keys');
const stripe = require('stripe')(Keys.StripeSecretkey);

app.use(flash());
app.use(express.static("public"));
app.set('view engine', 'ejs');

app.locals.copyrightYear = () => {
  return new Date().getFullYear();
};
app.locals.iif = (cond, value1, value2) => {
  if (cond) return value1;
  return value2;
}

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
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// mongodb://localhost:27017/userDB
mongoose.connect(Keys.MongoDB, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
  useFindAndModify: false,
  autoIndex: false
}).catch(error => handldError(error));
// mongoose.set("useCreateIndex", true);

const messageSchema = new mongoose.Schema({
  fullname: String,
  email: String,
  message: String
});
const Message = mongoose.model("Message", messageSchema);

const chatSchema = new mongoose.Schema({
  chatter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gotNewMsg: {   //when chatter receives new message from chatmate, this value is set to true
    type: Boolean,
    default: false
  },
  chatmate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  date: {
    type: Date,
    default: Date.now
  },
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    date: {
      type: Date,
      default: Date.now
    },
  }]
});
const Chat = mongoose.model("Chat", chatSchema);

// Make user global object
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
})

const requireLogin = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  } else {
    // res.render("login", {message: ""});
    res.redirect('/login');
  }
}

const checkMembership = (req, res, next) => {
  if (req.user.dateMember < req.user.dateLogin) {
    res.render('payment', {
      title: 'Payment',
      StripePublishableKey: Keys.StripePublishableKey
    });
  } else {
    return next();
  }
}

const checkNewMsg = (req, res, next) => {
  Chat.findOne({ chatter: req.user._id, gotNewMsg: true }).lean()
    .then((newMsg) => {
      if (newMsg) { res.locals.gotNewMsg = true; }
      else { res.locals.gotNewMsg = false; }
      next();
    })
    .catch((err) => {
      console.log(err);
    });
}

app.get("/", requireLogin, checkNewMsg, function (req, res) {
  //The last login time is saved in the user's data

  User.findById(req.user._id, (err, user) => {
    if (err) throw err;
    user.dateLogin = new Date();
    user.save((err, user) => {
      if (err) throw err;
      if (user) { res.render('home'); }
    });
  });

});

app.post('/chargeOneMonth', requireLogin, (req, res) => {
  const amount = 1500;
  stripe.customers.create({
    email: req.body.stripeEmail,
    source: req.body.stripeToken
  }).then((customer) => {
    stripe.charges.create({
      amount: amount,
      description: '$15 for one month',
      currency: 'usd',
      customer: customer.id,
      receipt_email: customer.email
    }).then((charge) => {
      if (charge) {
        User.findById(req.user._id)
          .then(user => {
            user.dateMember = moment().add(1, 'days');
            // user.wallet += 3;
            // console.log(user.dateMember);
            user.save()
              .then(() => {
                res.render('success', {
                  charge: charge
                })
              })
          })
      }
    }).catch((err) => {
      console.log(err);
    });
  }).catch((err) => {
    console.log(err);
  });
});

app.get("/chats", requireLogin, checkNewMsg, function (req, res) {
  Chat.find({ chatter: req.user._id }).lean()
    .sort({ date: 'desc' })
    // .populate('chatter')
    .populate('chatmate')
    // .populate('messages.sender')
    .then((chats) => {
      res.render("chats", { chats: chats });
    });
});

app.route("/chat/:id/:receiverName")   //id is the receiver's id
  .get(requireLogin, checkMembership, checkNewMsg, (req, res) => {
    Chat.findOne({ chatter: req.user._id, chatmate: req.params.id })
      .sort({ date: 'desc' })
      // .populate('chatter')
      // .populate('chatmate')
      .populate('messages.sender')
      .then((chat) => {
        if (chat) {
          chat.gotNewMsg = false;
          chat.save((err, chat) => {
            if (err) {
              throw err;
            } else {
              res.render("chatRoom", {
                receiverName: req.params.receiverName,
                chat: chat,
              });
            }
          });
        } else {
          res.render("chatRoom", {
            receiverName: req.params.receiverName,
            receiverId: req.params.id,
            chat: null
          });
        }
      }).catch((err) => {
        console.log(err);
      });
  })
  .post(requireLogin, checkNewMsg, (req, res) => {
    Chat.findOne({ chatter: req.user._id, chatmate: req.params.id }, (err, chat) => {
      if (err) throw err;

      if (chat) {
        const newMessage = {
          sender: req.user._id,
          message: req.body.message,
        }
        chat.messages.push(newMessage);
        chat.gotNewMsg = false;
        chat.date = new Date();

        chat.save((err, chat) => {
          if (err) throw err;
          Chat.findOne({ chatter: chat.chatmate, chatmate: chat.chatter }, (err, onechat) => {
            onechat.gotNewMsg = true;
            onechat.messages.push(newMessage);
            onechat.save();
          })

          Chat.findById(chat._id).lean()
            .sort({ date: 'desc' })
            .populate('chatmate')
            .populate('messages.sender')
            .then(chat => {
              res.render("chatRoom", {
                receiverName: req.params.receiverName,
                chat: chat
              });

            })
        });
      } else {
        let newChat = {
          chatter: req.user._id,
          gotNewMsg: false,
          chatmate: req.params.id,
          messages: [{
            sender: req.user._id,
            message: req.body.message
          }]
        }
        new Chat(newChat).save((err, chat) => {
          if (err) throw err;
          newChat = {
            chatter: req.params.id,
            gotNewMsg: true,
            chatmate: req.user._id,
            messages: [{
              sender: req.user._id,
              message: req.body.message
            }]
          }
          new Chat(newChat).save();
          Chat.findById(chat._id).lean()
            .sort({ date: 'desc' })
            .populate('messages.sender')
            .then(chat => {
              if (chat) {
                res.render("chatRoom", {
                  receiverName: req.params.receiverName,
                  chat: chat
                });
              }
            });
        });
      }
    });

  });

app.route("/contactus")
  .get(requireLogin, function (req, res) {
    res.render("contactus");
  })
  .post(requireLogin, function (req, res) {
    const newMessage = new Message({
      fullname: req.body.fullname,
      email: req.body.email,
      message: req.body.message
    });
    newMessage.save(function (err) {
      if (!err) {
        res.render('message', { message: newMessage });
      }
    });
  });

app.get("/discover", requireLogin, checkNewMsg, function (req, res) {
  User.find({ status: "active", _id: { $ne: req.user._id } })
    .sort({ date: 'desc' })
    .then(users => {
      res.render("discover", { users: users });
    }).catch((err) => {
      console.log(err);
    });
});

app.route("/login")
  .get(function (req, res) {
    res.render("login", { message: req.flash("error") });
  })
  .post(passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  }));

app.get("/logout", requireLogin, function (req, res) {
  req.logout();
  res.redirect("/");

});

app.get("/myaccount", requireLogin, function (req, res) {
  Chat.findOne({ chatter: req.user._id, gotNewMsg: true }).lean()
    .then((newMsg) => {
      if (newMsg) { gotNewMsg = true; }
      else { gotNewMsg = false; }
      const locals = {
        message: req.flash('infomsg'),
        gotNewMsg: gotNewMsg
      };
      res.render("myaccount", locals);
    })
    .catch((err) => {
      console.log(err);
    });

});

app.route("/posting")
  .get(function (req, res) {
    res.render("posting", { message: "" });
  })


app.route("/signup")
  .get(function (req, res) {
    res.render("signup", { message: "" });
  })
  .post(function (req, res) {
    const { firstname, lastname, gender, birthyear, email, password } = req.body;
    User.findOne({ email }, function (err, user) {
      if (user) {
        res.render("signup", { message: "The username already exist, please try again!" });
      }
    });
    User.register({ email, firstname, lastname, gender, birthyear }, password, function (err, user) {
      if (err) {
        console.log(err);
        res.redirect("/signup");
      } else {
        passport.authenticate("local")(req, res, function () {
          res.redirect("/");
        })
      }
    });
  });

app.post('/updateInfo', requireLogin, (req, res) => {
  singleUpload(req, res, (err) => {
    User.findById(req.user._id, (err, user) => {
      if (err) {
        console.err(err);
      } else {
        if (req.file) { user.image = req.file.location; }
        user.firstname = req.body.firstname;
        user.lastname = req.body.lastname;
        user.gender = req.body.gender;
        user.birthyear = req.body.birthyear;
        user.email = req.body.email;
        user.status = req.body.status;
        user.save((err) => {
          if (err) {
            throw err;
          } else {
            req.flash('infomsg', 'Info is saved');

            res.redirect('myaccount');
          }
        });
      }
    });
  });
});

app.get('/userProfile/:id', requireLogin, (req, res) => {
  User.findById(req.params.id, (err, user) => {
    if (err) throw err;
    res.render("userProfile", { oneUser: user });

  });
});

app.listen(process.env.PORT || 3000, function () {
  console.log("Server started on port 3000");
});
