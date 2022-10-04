/*
 * Copyright (c) 2019. Arash Hatami
 */

import {MongoClient} from "mongodb";

export const addConnection =  async (connection, app, callback) => {
    if(!app.locals.dbConnections){
        app.locals.dbConnections = [];
    }

    if(!connection.connOptions){
        connection.connOptions = {};
    }
    const client = new MongoClient(connection.connString,connection.connOptions);
    try {
   const mongoClient =  await client.connect()
   var dbObj = {};
   dbObj.native = mongoClient;
   dbObj.connString = connection.connString;
   dbObj.connOptions = connection.connOptions;
   
   app.locals.dbConnections[connection.connName] = null;
   app.locals.dbConnections[connection.connName] = dbObj;
   callback(null, null);
    } catch (err) {
       callback(err, null);
    }
};

export const removeConnection =  (connection, app) => {
    if(!app.locals.dbConnections){
        app.locals.dbConnections = [];
    }

    try{
        app.locals.dbConnections[connection].native.close();
    }catch(e){
    }

    delete app.locals.dbConnections[connection];
    return;
};
