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
const socket = require('socket.io');
const http = require('http');

//Load models
const Chat = require('./models/chat');
const Chatload = require('./models/chatload');
const Group = require('./models/group');
const Message = require('./models/message');
const Post = require('./models/post');
const User = require('./models/user');
const Zip = require('./models/zip');

const app = express();

const Keys = require('./config/keys');
const { resolve } = require('path');
const chat = require('./models/chat');
const stripe = require('stripe')(Keys.StripeSecretkey);

const port = process.env.PORT || 3000;
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
      chatId: req.params.chatId,
      StripePublishableKey: Keys.StripePublishableKey
    });
  } else {
    return next();
  }
}

const checkNewMsg = (req, res, next) => {
  Chat.findOne({ userId: req.user._id, gotNewMsg: true }).lean()
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

app.post('/chargeOneMonth/:chatId', requireLogin, (req, res) => {
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
                  chatId: req.params.chatId,
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

app.get("/chatPrivate/:receiverId", requireLogin, (req, res) => {
  Chat.findOne({ userId: req.user._id, members: [req.params.receiverId] }, (err, chat) => {
    if (err) throw err;
    if (chat) {
      res.redirect(`/chat/${chat._id}`);
    } else {
      User.findById(req.params.receiverId, (err, receiver) => {
        if (err) throw err;
        const newChat = new Chat({
          userId: req.user._id,
          name: receiver.username,
          image: receiver.image,
          members: [req.params.receiverId]
        })
        newChat.save((err, chat) => {
          if (err) throw err;
          chat.groupId = chat._id;
          chat.save();
          res.redirect(`/chat/${chat._id}`);
        });
      })
    }
  })
});

app.route("/chat/:chatId")
  .get(requireLogin, checkMembership, (req, res) => {
    Chat.findById(req.params.chatId)
      .populate('userId')
      .populate('messages.sender')
      .then(chat => {
        if (chat.gotNewMsg) {
          chat.gotNewMsg = false;
          chat.save(() => {
            res.render('chatRoom', {chat: chat});
          });
        } else {
          res.render('chatRoom', {chat: chat});
        }
      })
  })
  .post(requireLogin, (req, res) => {
    Chat.findById(req.params.chatId)
      .then(myChat => {
        myChat.messages.push({ sender: req.user._id, text: req.body.text });
        myChat.save((err, chat) => {
          if (err) throw err;
          if (chat.members.length == 1) {
            Chat.findOne({ userId: chat.members[0], groupId: chat.groupId }, (err, chatOne) => {
              if (chatOne) {
                chatOne.gotNewMsg = true;
                chatOne.messages.push({ sender: req.user._id, text: req.body.text });
                chatOne.save();
              }
              else {
                const newChat = new Chat({
                  userId: chat.members[0],
                  groupId: chat.groupId,
                  name: req.user.username,
                  image: req.user.image,
                  members: [req.user._id],
                  messages: [{ sender: req.user._id, text: req.body.text }],
                  gotNewMsg: true
                });
                newChat.save();
              }
            })
          } else {
            chat.members.forEach(memberId => {
              Chat.findOne({ userId: memberId, groupId: chat.groupId }, (err, chatMult) => {
                if (chatMult) {
                  chatMult.gotNewMsg = true;
                  chatMult.messages.push({ sender: req.user._id, text: req.body.text, gotNewMsg: true });
                  chatMult.save();
                }
                else {
                  var myArray = chat.members.map(m => { return m.toString(); });
                  var index = myArray.indexOf(memberId.toString());
                  myArray.splice(index, 1, req.user._id.toString());
                  const newChat = new Chat({
                    userId: memberId,
                    groupId: chat.groupId,
                    name: chat.name,
                    image: chat.image,
                    members: myArray,
                    messages: [{ sender: req.user._id, text: req.body.text }],
                    gotNewMsg: true
                  });
                  newChat.save();
                }
              })
            })
          }
          Chat.findById(req.params.chatId)
            .then(chat => {
              res.redirect(`/chat/${chat._id}`);
            });
        });
      })
  });

app.route("/chatGroup")
  .get(requireLogin, (req, res) => {
    User.findById(req.user._id)
      .populate('contacts')
      .then(user => {
        res.render('chatGroup', {
          user: user
        })
      })
  })
  .post(requireLogin, (req, res) => {
    const newChat = new Chat({
      userId: req.user._id,
      name: req.body.groupName,
      members: req.body.members.split(',')
    });
    newChat.save((err, chat) => {
      if (err) throw err;
      chat.groupId = chat._id;
      chat.save();
      res.redirect(`/chat/${chat._id}`);
    });
  });

app.get("/chats", requireLogin, function (req, res) {
  Chat.find({ userId: req.user._id })
    .populate('messages.sender')
    .then(chats => {
      res.render('chats', {
        chats: chats
      })
    })
})

app.get("/contactDelete/:id", requireLogin, function (req, res) {
  User.findById(req.user._id, (err, currentUser) => {
    if (err) throw err;
    currentUser.contacts.splice(currentUser.contacts.indexOf(req.params.id), 1);
    currentUser.save();
    User.findById(req.params.id, (err, user) => {
      if (err) throw err;
      res.render("userPage", {
        user: user,
        message: "User is removed from the contacts",
        iscontact: false
      });
    });
  });
});

app.get("/contactAdd/:id", requireLogin, function (req, res) {
  User.findById(req.user._id, (err, currentUser) => {
    if (err) throw err;
    currentUser.contacts.push(req.params.id);
    currentUser.save();
    User.findById(req.params.id, (err, user) => {
      if (err) throw err;
      res.render("userPage", {
        user: user,
        message: "User is added to the contacts",
        iscontact: true
      });
    });

  });
});

app.route("/contactUs")
  .get(requireLogin, function (req, res) {
    res.render("contactUs");
  })
  .post(requireLogin, function (req, res) {
    const newMessage = new Message({
      fullname: req.body.fullname,
      email: req.body.email,
      message: req.body.message
    });
    newMessage.save(function (err, message) {
      if (!err) {
        res.render('message', { message: newMessage });
      }
    });
  });

app.get('/groupProfile/:id', requireLogin, (req, res) => {
  let ismyGroup;
  Group.findById(req.params.id)
    // .populate('groupLeader')
    .populate('members')
    .populate('groupLeader')
    .then(group => {
      if (group) {
        if (group.groupLeader.equals(req.user._id)) { ismyGroup = true; } else { ismyGroup = false; }
        res.render('group/groupProfile', {
          group: group,
          ismyGroup: ismyGroup
        })
      }
    })
});

app.get("/groups", requireLogin, (req, res) => {
  Group.find({ status: "Active" })
    .populate('groupLeader')
    .populate('members')
    .then(groups => {
      if (groups) {
        res.render('group/groups', {
          groups: groups
        })
      }
    })
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

app.route("/myAccount")
  .get(requireLogin, checkNewMsg, function (req, res) {
    res.render('myAccount');
  })
  .post(requireLogin, (req, res) => {
    // console.log(req.body.username);
    User.findById(req.user._id, (err, user) => {
      if (err) throw err;
      user.username = req.body.username;
      user.email = req.body.email;
      user.status = req.body.status;
      user.save(() => {
        res.redirect('/myAccount');
      });
    });
  });

app.get("/myContacts", requireLogin, function (req, res) {
  User.findById(req.user._id)
    .populate('contacts')
    .then(user => {
      // user.contacts.splice(0, user.contacts.length);
      // user.save();
      res.render('myContacts', {
        user: user
      })
    })
});

app.get("/myGroup", requireLogin, (req, res) => {
  Group.findOne({ groupLeader: req.user._id })
    .populate('members')
    .populate('groupLeader')
    .then(group => {
      res.render('group/groupProfile', {
        group: group,
        ismyGroup: true
      })
    })
});

app.get('/myPosts', requireLogin, (req, res) => {
  Post.find({ postUser: req.user._id })
    .populate('postUser')
    .populate('comments.commentUser')
    // .populate('likes.likeUser')
    .then((posts) => {
      res.render('myPosts', {
        posts: posts
      });
    })

});

app.route("/myProfile")
  .get(requireLogin, (req, res) => {
    // let iscontact;
    let isCurrentUser = true;
    res.render("profile", {
      // iscontact: iscontact,
      isCurrentUser: isCurrentUser
    });

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
          user.yearBorn = req.body.yearBorn;
          user.height = req.body.height;
          user.bodytype = req.body.bodytype;
          user.religion = req.body.religion;
          user.maritalStatus = req.body.maritalStatus;
          user.children = req.body.children;
          user.aboutMe = req.body.aboutMe;
          user.save((err) => {
            if (err) {
              throw err;
            } else {
              res.redirect('myProfile');
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
            res.redirect('/myPosts');
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

app.get('/posts', requireLogin, (req, res) => {
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

app.get("/singles", requireLogin, checkNewMsg, function (req, res) {

  User.find({ status: "Active", _id: { $ne: req.user._id } })
    .sort({ date: 'desc' })
    .then(users => {
      res.render("singles", { users: users });
    }).catch((err) => {
      console.log(err);
    });
});

app.get('/userPage/:id', requireLogin, (req, res) => {
  User.findById(req.params.id, (err, user) => {
    if (err) throw err;
    let iscontact;
    User.findById(req.user._id)
      .then(currentUser => {
        if (currentUser.contacts.includes(req.params.id)) {
          iscontact = true;
        } else {
          iscontact = false;
        }
        res.render("userPage", {
          user: user,
          message: null,
          iscontact: iscontact
        });
      })
  });
});

app.get('/userProfile/:id', requireLogin, (req, res) => {
  User.findById(req.params.id, (err, user) => {
    if (err) throw err;
    res.render("profile", {
      user: user,
      isCurrentUser: false
    });

  });
});

app.get('/zipcode', (req, res) => {
  // let zipcode = req.query.zipcode;
  Zip.findOne({ _id: req.query.zipcode }, (err, zip) => {
    if (err) throw err;
    res.send(zip);
  });

});

app.get('/temp', (req, res) => {
  res.render("temp");
});

const server = http.createServer(app);
const io = socket(server);

io.on('connection', (socket) => {
  // console.log('Server is connected to Client');
  // emit event
  socket.on('username', function (username) {
    socket.username = username;
    io.emit('is_online', '🔵 <i>' + socket.username + ' join the chat..</i>');
  });

  socket.on('disconnect', function (username) {
    io.emit('is_online', '🔴 <i>' + socket.username + ' left the chat..</i>');
  })


  socket.on('chat message', (msg) => {
    io.emit('chat message', '<strong>' + socket.username + '</strong>: ' + msg);
  });
  // socket.emit('newMessage', {
  //   title: 'New Message',
  //   body: 'Hello World!',
  //   sender: 'Richard'
  // })

})
io.on('disconnection', () => {
  console.log('Server is disconnected from Client');
})

server.listen(port, function () {
  console.log(`Server is running on port ${port}`);
});
