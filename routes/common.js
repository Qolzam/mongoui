/*
 * Copyright (c) 2019. Arash Hatami
 */

import _ from "lodash";
import fs from "node:fs";
import path from "node:path";
import junk from "junk";
import { __dirname } from "../utils/helper.js";
import async from "async";
import { ObjectID } from "mongodb";

// checks for the password in the /config/app.json file if it's set
export const checkLogin = (req, res, next) => {
  var passwordConf = req.nconf.app.get("app");

  // only check for login if a password is specified in the /config/app.json file
  if (passwordConf && passwordConf.hasOwnProperty("password")) {
    // dont require login session for login route
    if (
      req.path === "/app/login" ||
      req.path === "/app/logout" ||
      req.path === "/app/login_action"
    ) {
      next();
    } else {
      // if the session exists we continue, else renter login page
      if (req.session.loggedIn) {
        next(); // allow the next route to run
      } else {
        res.redirect(req.app_context + "/app/login");
      }
    }
  } else {
    // no password is set so we continue
    next();
  }
};

// gets some db stats
export const get_db_status = (mongo_db, cb) => {
  console.log("mongodb admin ", mongo_db);
  var adminDb = mongo_db.db().admin();
  adminDb.serverStatus(function (err, status) {
    if (err) {
      cb("Error", null);
    } else {
      cb(null, status);
    }
  });
};

// gets the backup dirs
export const get_backups = (cb) => {
  var backupPath = path.join(__dirname, "../backups");

  fs.readdir(backupPath, function (err, files) {
    cb(null, files.filter(junk.not));
  });
};

// gets the db stats
export const get_db_stats = (mongo_db, db_name, cb) => {
  var db_obj = {};

  // if at connection level we loop db's and collections
  if (db_name == null) {
    var adminDb = mongo_db.db().admin();
    adminDb.listDatabases(function (err, db_list) {
      if (err) {
        cb("User is not authorised", null);
        return;
      }
      if (db_list !== undefined) {
        async.forEachOf(
          order_object(db_list.databases),
          function (value, key, callback) {
            order_object(db_list.databases);
            var skipped_dbs = ["null", "admin", "local"];
            if (skipped_dbs.indexOf(value.name) === -1) {
              var tempDBName = value.name;
              mongo_db
                .db(tempDBName)
                .listCollections()
                .toArray(function (err, coll_list) {
                  var coll_obj = {};
                  async.forEachOf(
                    cleanCollections(coll_list),
                    function (value, key, callback) {
                      mongo_db
                        .db(tempDBName)
                        .collection(value)
                        .stats(function (err, coll_stat) {
                          coll_obj[value] = {
                            Storage: coll_stat.size,
                            Documents: coll_stat.count,
                          };
                          callback();
                        });
                    },
                    function (err) {
                      if (err) console.error(err.message);
                      // add the collection object to the DB object with the DB as key
                      db_obj[value.name] = order_object(coll_obj);
                      callback();
                    }
                  );
                });
            } else {
              callback();
            }
          },
          function (err) {
            if (err) console.error(err.message);
            // wrap this whole thing up
            cb(null, order_object(db_obj));
          }
        );
      } else {
        // if doesnt have the access to get all DB's
        cb(null, null);
      }
    });
    // if at DB level, we just grab the collections below
  } else {
    mongo_db
      .db(db_name)
      .listCollections()
      .toArray(function (err, coll_list) {
        var coll_obj = {};
        async.forEachOf(
          cleanCollections(coll_list),
          function (value, key, callback) {
            mongo_db
              .db(db_name)
              .collection(value)
              .stats(function (err, coll_stat) {
                coll_obj[value] = {
                  Storage: coll_stat ? coll_stat.size : 0,
                  Documents: coll_stat ? coll_stat.count : 0,
                };

                callback();
              });
          },
          function (err) {
            if (err) console.error(err.message);
            db_obj[db_name] = order_object(coll_obj);
            cb(null, db_obj);
          }
        );
      });
  }
};

// gets the Databases
export const get_db_list = (uri, mongo_db, cb) => {
  var adminDb = mongo_db.db().admin();
  var db_arr = [];

  // if a DB is not specified in the Conn string we try get a list
  if (uri.database === undefined || uri.database === null) {
    // try go all admin and get the list of DB's
    adminDb.listDatabases(function (err, db_list) {
      if (db_list !== undefined) {
        async.forEachOf(
          db_list.databases,
          function (value, key, callback) {
            var skipped_dbs = ["null", "admin", "local"];
            if (skipped_dbs.indexOf(value.name) === -1) {
              db_arr.push(value.name);
            }
            callback();
          },
          function (err) {
            if (err) console.error(err.message);
            order_array(db_arr);
            cb(null, db_arr);
          }
        );
      } else {
        cb(null, null);
      }
    });
  } else {
    cb(null, null);
  }
};

// Normally you would know how your ID's are stored in your DB. As the _id value which is used to handle
// all document viewing in adminMongo is a parameter we dont know if it is an ObjectId, string or integer. We can check if
// the _id string is a valid MongoDb ObjectId but this does not guarantee it is stored as an ObjectId in the DB. It's most likely
// the value will be an ObjectId (hopefully) so we try that first then go from there
export const get_id_type = (mongo, collection, doc_id, cb) => {
  if (doc_id) {
    // if a valid ObjectId we try that, then then try as a string
    if (ObjectID.isValid(doc_id)) {
      mongo
        .collection(collection)
        .findOne({ _id: new ObjectID(doc_id) }, function (err, doc) {
          if (doc) {
            // doc_id is an ObjectId
            cb(null, { doc_id_type: new ObjectID(doc_id), doc: doc });
          } else {
            mongo
              .collection(collection)
              .findOne({ _id: doc_id }, function (err, doc) {
                if (doc) {
                  // doc_id is string
                  cb(null, { doc_id_type: doc_id, doc: doc });
                } else {
                  cb("Document not found", { doc_id_type: null, doc: null });
                }
              });
          }
        });
    } else {
      // if the value is not a valid ObjectId value we try as an integer then as a last resort, a string.
      mongo
        .collection(collection)
        .findOne({ _id: parseInt(doc_id) }, function (err, doc) {
          if (doc) {
            // doc_id is integer
            cb(null, { doc_id_type: parseInt(doc_id), doc: doc });
            return;
          } else {
            mongo
              .collection(collection)
              .findOne({ _id: doc_id }, function (err, doc) {
                if (doc) {
                  // doc_id is string
                  cb(null, { doc_id_type: doc_id, doc: doc });
                } else {
                  cb("Document not found", { doc_id_type: null, doc: null });
                }
              });
          }
        });
    }
  } else {
    cb(null, { doc_id_type: null, doc: null });
  }
};

// gets the Databases and collections
export const get_sidebar_list = (mongo_db, db_name, cb) => {
  var db_obj = {};

  // if no DB is specified, we get all DBs and collections
  if (db_name == null) {
    const adminDb = mongo_db.db().admin();
    adminDb.listDatabases(function (err, db_list) {
      if (db_list) {
        async.forEachOf(
          db_list.databases,
          function (value, key, callback) {
            var skipped_dbs = ["null", "admin", "local"];
            if (skipped_dbs.indexOf(value.name) === -1) {
              mongo_db
                .db(value.name)
                .listCollections()
                .toArray(function (err, collections) {
                  collections = cleanCollections(collections);
                  order_array(collections);
                  db_obj[value.name] = collections;
                  callback();
                });
            } else {
              callback();
            }
          },
          function (err) {
            if (err) console.error(err.message);
            cb(null, order_object(db_obj));
          }
        );
      } else {
        cb(null, order_object(db_obj));
      }
    });
  } else {
    console.log(mongo_db);
    mongo_db
      .db(db_name)
      .listCollections()
      .toArray(function (err, collections) {
        collections = cleanCollections(collections);
        order_array(collections);
        db_obj[db_name] = collections;
        cb(null, db_obj);
      });
  }
};

// order the object by alpha key
export const order_object = (unordered) => {
  const ordered = {};
  if (unordered !== undefined) {
    var keys = Object.keys(unordered);
    order_array(keys);
    keys.forEach(function (key) {
      ordered[key] = unordered[key];
    });
  }
  return ordered;
};

export const order_array = (array) => {
  if (array) {
    array.sort((a, b) => {
      a = a.toLowerCase();
      b = b.toLowerCase();
      if (a === b) return 0;
      if (a > b) return 1;
      return -1;
    });
  }
  return array;
};

// render the error page
export const render_error = (res, req, err, conn) => {
  var connection_list = req.nconf.connections.get("connections");

  var conn_string = "";
  if (connection_list[conn] !== undefined) {
    conn_string = connection_list[conn].connection_string;
  }

  res.render("error", {
    message: err,
    conn: conn,
    conn_string: conn_string,
    connection_list: order_object(connection_list),
    helpers: req.handlebars.helpers,
  });
};

export const cleanCollections = (collection_list) => {
  var list = [];
  _.each(collection_list, function (item) {
    list.push(item.name);
  });
  return list;
};
