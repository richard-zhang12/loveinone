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
const ejs = require('ejs');

//Load models
const Chat = require('./models/chat');
const Contact = require('./models/contact');
const Message = require('./models/message');
const Post = require('./models/post');
const User = require('./models/user');
const Zip = require('./models/zip');

const app = express();

const Keys = require('./config/keys');
const stripe = require('stripe')(Keys.StripeSecretkey);

app.use(flash());
app.use(express.static("public"));
app.set('view engine', 'ejs');

app.locals.copyrightYear = () => {
  return new Date().getFullYear();
};
app.locals.getLastMoment = (date, hour) => {
  return moment(date).startOf(hour).fromNow();
}
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



app.get("/contacts", requireLogin, checkNewMsg, function (req, res) {
  res.render("index");
  // Contact.find({ user: req.user._id }).lean()
  //   .populate('user')
  //   .populate('contacts.contactUser')
  //   .then((contacts) => {
  //     res.render("contacts", { contacts: contacts });
  //   });
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
  User.find({ status: "Active", _id: { $ne: req.user._id } })
    .sort({ date: 'desc' })
    .then(users => {
      res.render("discover", { users: users });
    }).catch((err) => {
      console.log(err);
    });
});

app.get("/follow/:id", requireLogin, checkNewMsg, function (req, res) {
  //first check if the follow user id exists
  User.findById(req.user._id, (err, user) => {
    if (err) throw err;
    user.follows.push(req.params.id);
    user.save((err, user) => {
      if (err) throw err;
      if (user) { res.render('home'); }
    });
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

app.route("/myaccount")
  .get(requireLogin, checkNewMsg, function (req, res) {
    res.render('myaccount');
  })
  .post(requireLogin, (req, res) => {
    console.log(req.body.username);
    User.findById(req.user._id, (err, user) => {
      if (err) throw err;
      user.username = req.body.username;
      user.email = req.body.email;
      user.status = req.body.status;
      user.save(() => {
        res.redirect('/myaccount');
      });
    });
  });

app.get('/myposts', requireLogin, checkNewMsg, (req, res) => {
  Post.find({ postUser: req.user._id })
    .populate('postUser')
    .populate('comments.commentUser')
    // .populate('likes.likeUser')
    .then((posts) => {
      res.render('myposts', {
        posts: posts
      });
    })

});

app.route("/myprofile")
  .get(requireLogin, checkNewMsg, (req, res) => {
    res.render('myprofile');
  })
  .post(requireLogin, (req, res) => {
    singleUpload(req, res, (err) => {
      User.findById(req.user._id, (err, user) => {
        if (err) {
          console.err(err);
        } else {
          if (req.file) { user.image = req.file.location; }
          user.ethnicity = req.body.ethnicity;
          user.country = req.body.country;
          user.zipcode = req.body.zipcode;
          user.state = req.body.state;
          user.city = req.body.city;
          user.education = req.body.education;
          user.profession = req.body.profession;
          user.gender = req.body.gender;
          user.age = req.body.age;
          user.height = req.body.height;
          user.bodytype = req.body.bodytype;
          user.religion = req.body.religion;
          user.maritalStatus = req.body.maritalStatus;
          user.children = req.body.children;
          user.aboutMe = req.body.aboutMe;
          user.aboutYou = req.body.aboutYou;
          user.aboutUs = req.body.aboutUs;
          user.save((err) => {
            if (err) {
              throw err;
            } else {
              res.redirect('myprofile');
            }
          });
        }
      });
    });
  });

app.route("/passwordForgot")
  .get(function (req, res) {
    res.render('passwordForgot');
  })
  .post(function (req, res) {
    User.findOne({ email: req.body.email })
      .then((user) => {
        if (user) {
          user.setPassword(req.body.password, function () {
            user.save();
            res.render("login", { message: "New password has been saved.  Enter new password to log in" });
          })
        }
      })
  });

app.route("/postCreate")
  .get(requireLogin, checkNewMsg, function (req, res) {
    res.render('postCreate');
  })
  .post(requireLogin, (req, res) => {
    singleUpload(req, res, (err) => {
      if (req.file) {
        const newPost = {
          postBody: req.body.postBody,
          image: req.file.location,
          postUser: req.user._id,
          date: new Date()
        }
        new Post(newPost).save()
          .then(() => {
            res.redirect('/myposts');
          })
      }
    })
  });

app.get('/postLike/:id', requireLogin, checkNewMsg, (req, res) => {
  Post.findById(req.params.id)
    .then((post) => {
      const newLike = {
        likeUser: req.user._id,
        date: new Date()
      }
      post.likes.push(newLike);
      post.save((err, post) => {
        if (err) {
          throw err;
        }
        if (post) {
          res.redirect('/posts');
        }
      });
    });
});

app.route("/postComment/:id")
  .get(requireLogin, checkNewMsg, (req, res) => {
    Post.findById(req.params.id).lean()
      .populate('postUser')
      .populate('likes.likeUser')
      .populate('comments.commentUser')
      .sort({ date: 'desc' })
      .then((post) => {
        res.render('postComment', {
          post: post
        });
      });
  })
  .post(requireLogin, checkNewMsg, (req, res) => {
    Post.findById(req.params.id)
      .then((post) => {
        const newComment = {
          commentUser: req.user._id,
          commentBody: req.body.commentBody,
          date: new Date()
        }
        post.comments.push(newComment);
        post.save((err, post) => {
          if (err) throw err;
          if (post) {
            res.redirect(`/postComment/${post._id}`);
          }
        });
      })
  })

app.get('/posts', requireLogin, checkNewMsg, (req, res) => {
  let postArray = [];
  User.findById(req.user._id, (err, user) => {
    if (err) throw err;
    let userArray = user.follows;  // all the users that this user follows
    for (i = 0; i < userArray.length; i++) {
      postArray.push({ postUser: userArray[i]._id });
    }
    postArray.push({ postUser: req.user._id });
    if (postArray.length > 0) {
      Post.find({ $or: postArray }).lean()  //Find all the posts of the users that this user follows.
        .populate('postUser')
        .populate('likes.likeUser')
        .populate('comments.commentUser')
        .sort({ date: 'desc' })
        .then((posts) => {
          res.render('posts', {
            posts: posts
          })
        })
    } else {
      res.render('posts', {
        posts: null
      })
    }

  })
});

app.get('/posts/:id', requireLogin, checkNewMsg, (req, res) => {
  Post.find({ postUser: req.params.id })
    .populate('postUser')
    .populate('comments.commentUser')
    // .populate('likes.likeUser')
    .then((posts) => {
      res.render('posts', {
        posts: posts
      });
    })
});

app.route("/signup")
  .get(function (req, res) {
    res.render("signup", { message: "" });
  })
  .post(function (req, res) {
    const { username, email, password } = req.body;
    User.findOne({ email }, function (err, user) {
      if (user) {
        res.render("signup", { message: "The email already exist, please try again!" });
      }
    });
    User.register({ email, username }, password, function (err, user) {
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

app.get('/userProfile/:id', requireLogin, (req, res) => {
  User.findById(req.params.id, (err, user) => {
    if (err) throw err;
    res.render("userProfile", { oneUser: user });

  });
});

app.get('/zipcode', (req, res) => {
  // let zipcode = req.query.zipcode;
  Zip.findOne({ _id: req.query.zipcode }, (err, zip) => {
    if (err) throw err;
    res.send(zip);
  });

});

app.listen(process.env.PORT || 3000, function () {
  console.log("Server started on port 3000");
});
