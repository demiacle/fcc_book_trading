import App from "./App";
import React from "react";
import { StaticRouter } from "react-router-dom";
import express from "express";
import bodyParser from "body-parser";
import session from "cookie-session";
import { renderToString } from "react-dom/server";
import mongoose from "mongoose";
import dbController from "./dbController.js";
import googleBooks from "google-books-search";

const assets = require(process.env.RAZZLE_ASSETS_MANIFEST);
const server = express();

mongoose.connect(process.env.RAZZLE_DB);
var db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function() {
  console.log("connecting to db");
});

server.set("trust proxy", 1);

var sessionData = {
  secret: "booksGud",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
};

function renderReactComponent(req, res) {
  const context = {};
  const serverData = res.locals.serverData ? res.locals.serverData : {};
  console.log("serverdata", serverData);
  // Render component to html
  const markup = renderToString(
    <StaticRouter context={context} location={req.url}>
      <App {...serverData} />
    </StaticRouter>
  );
  if (context.url) {
    res.redirect(context.url);
  } else {
    res.status(200).send(
      `<!doctype html>
    <html lang="">
    <head>
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta charSet='utf-8' />
        <title>Book My Life</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        ${
          assets.client.css
            ? `<link rel="stylesheet" href="${assets.client.css}">`
            : ""
        }
        ${
          process.env.NODE_ENV === "production"
            ? `<script src="${assets.client.js}" defer></script>`
            : `<script src="${assets.client.js}" defer crossorigin></script>`
        }
        <link href="https://fonts.googleapis.com/css?family=EB+Garamond" rel="stylesheet">
        <script>
          window.__PRELOADED_STATE__ = ${JSON.stringify(serverData).replace(
            /</g,
            "\\u003c"
          )}
        </script
    </head>
    <body>
        <div id="root">${markup}</div>
    </body>
</html>`
    );
  }
}

function initializeServerData(req, res, next) {
  res.locals.serverData = {};
  next();
}
function isLoggedIn(req, res, next) {
  if (req.session.user) {
    res.locals.serverData.isLoggedIn = true;
  }
  next();
}
function requireLoggedIn(req, res, next) {
  if (req.session.user) {
    res.locals.serverData.isLoggedIn = true;
    next();
  } else {
    res.send("You must be logged in to access this page.");
  }
}
function requireNotLoggedIn(req, res, next) {
  if (req.session.user) {
    res.send("You are already logged in");
  } else {
    next();
  }
}

// Middleware and routes
server
  .disable("x-powered-by")
  .use(express.static(process.env.RAZZLE_PUBLIC_DIR))
  .use(session(sessionData))
  .use(initializeServerData)
  // Routes
  .get(
    "/books-for-trade",
    isLoggedIn,
    async (req, res, next) => {
      var currentPage = req.query.page ? req.query.page : 1;
      currentPage = parseInt(currentPage, 10);
      var books = await dbController.getBooksForTrade(currentPage);
      var totalBooks = await dbController.getTotalBooks();
      res.locals.serverData.books = books;
      res.locals.serverData.currentPage = currentPage;
      if (req.session.user && req.session.user.requestedBooks) {
        res.locals.serverData.requestedBooks = await dbController.getBooksById(
          req.session.user.requestedBooks
        );
      }
      // use books.total
      res.locals.serverData.totalPages = Math.ceil(totalBooks / 12);
      res.locals.serverData.isShowingPagination = true;
      next();
    },
    renderReactComponent
  )
  .get("/", isLoggedIn, renderReactComponent)
  .get(
    "/profile",
    requireLoggedIn,
    async (req, res, next) => {
      var userData = { ...req.session.user };
      delete userData._id;
      delete userData.__v;
      res.locals.serverData.profile = userData;
      res.locals.serverData.userBooks = await dbController.getUserBooks(
        req.session.user._id
      );
      next();
    },
    renderReactComponent
  )
  .get(
    "/books-for-trade/search",
    async (req, res, next) => {
      var query = req.query.title;
      var books = await dbController.searchBooksForTrade(query);
      res.locals.serverData.books = books;
      res.locals.serverData.query = query;
      next();
    },
    renderReactComponent
  )
  .get(
    "/google-books",
    requireLoggedIn,
    (req, res, next) => {
      var query = req.query.search;
      googleBooks.search(query, { limit: 12 }, (err, results) => {
        if (err) {
          console.log(err);
          res.send("An error occured");
        } else {
          res.locals.serverData.books = results;
          next();
        }
      });
    },
    renderReactComponent
  )
  .get("/logout", function(req, res) {
    req.session = null;
    res.redirect("/");
  })
  // ** POST REQUESTS **
  .use(bodyParser.json())
  .use(
    bodyParser.urlencoded({
      extended: true
    })
  )
  .post("/update-profile", requireLoggedIn, async (req, res) => {
    var post = req.body;
    var updateQuery = {};
    if (post.firstName) {
      updateQuery.firstName = post.firstName;
    }
    if (post.lastName) {
      updateQuery.lastName = post.lastName;
    }
    if (post.city) {
      updateQuery.city = post.city;
    }
    if (post.state) {
      updateQuery.state = post.state;
    }
    if (post.userName) {
      updateQuery.userName = post.userName;
    }
    if (post.password) {
      updateQuery.password = post.password;
    }
    if (Object.keys(updateQuery).length === 0) {
      res.redirect("/profile");
      return;
    }
    var updatedUser = await dbController.updateUser(
      req.session.user._id,
      updateQuery
    );
    req.session.user = updatedUser;
    res.redirect("/profile");
  })
  .post("/register", requireNotLoggedIn, async function(req, res) {
    var post = req.body;
    if (
      !post.userName ||
      !post.password ||
      !post.firstName ||
      !post.lastName ||
      !post.city ||
      !post.state
    ) {
      res.redirect(encodeURI("/?error=You must complete the form"));
      return;
    }
    var user = await dbController.registerUser(
      post.userName,
      post.password,
      post.firstName,
      post.lastName,
      post.city,
      post.state
    );
    if (user) {
      req.session.user = user;
      res.redirect("/");
    } else {
      res.redirect(
        encodeURI("/?error=That username/password combination is already taken")
      );
    }
  })
  .post("/login", requireNotLoggedIn, async function(req, res) {
    var post = req.body;
    var user = await dbController.authenticate(post.userName, post.password);
    if (user) {
      req.session.user = user;
      res.redirect("/");
    } else {
      res.redirect(
        encodeURI(
          "/?error=That username/password combination does not exist, please register first"
        )
      );
    }
  })
  .post("/add-book-to-list", async (req, res) => {
    await dbController.addBookToList(
      req.body.title,
      req.body.thumbnail,
      req.session.user._id
    );
    res.redirect("/profile");
  })
  .post("/remove-book-from-list", async (req, res) => {
    var updatedUser = await dbController.removeBookFromList(req.body.id);
    if (updatedUser.id && updatedUser.id === req.session.user._id) {
      req.session.user = updatedUser;
    }
    res.redirect("/profile");
  })
  .post("/request-book", requireLoggedIn, async (req, res) => {
    var bookId = req.body.id;
    req.session.user = await dbController.requestBook(bookId, req.session.user);
    res.redirect("/profile");
  })
  .post("/respond-to-request", requireLoggedIn, async (req, res) => {
    var id = req.body.id;
    if (req.body.requestType === "accept") {
      req.session.user = await dbController.acceptRequest(
        id,
        req.session.user._id
      );
    } else {
      var updatedUser = await dbController.denyRequest(id);
      if (updatedUser.id === req.session.user._id) {
        req.session.user = updatedUser;
      }
    }
    res.redirect("/profile");
  });

export default server;
