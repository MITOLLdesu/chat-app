var chat = require('express')();                                                // initial setup
var fs = require('fs');
var sslcert = {                                                                 // loading SSL sertificate
  key: fs.readFileSync('ssl/privateKey.key'),                                   // (self-signed, naturally, so your browser might freak out about it)
  cert: fs.readFileSync('ssl/certificate.crt')
};
var https = require('https').createServer(sslcert, chat);                       // we need to use the HTTPS protocol to gain access to user's webcam/mic
var io = require('socket.io')(https);

chat.get('/', function(req, res){                                               // serving index.html on connection
  res.sendFile(__dirname + '/index.html');
});

chat.get('/:chatroom', function (req, res){                                     // serving the same page if user is trying to get into a specific room
  res.sendFile(__dirname + '/index.html');
});

var roomlist = [];                                                              // we use this array to keep track of the rooms and the users in them

io.on('connection', function(socket){

  socket.on('joinroom', function(room, name){                                   // this is called if a user wants to join a room (gets desired room id and username as parameters)
    let chatRoom = room;
    if (!chatRoom){                                                             // if a user didn't specify a room (happens on connection to / ),
      chatRoom = Math.floor(Math.random() * 100000).toString();                 // we generate a random root id
      if (roomlist.includes(chatRoom)) chatRoom = '0' + chatRoom;               // if there's already a room with such id, we just add 0 to the beginning
    }
    if (!(roomlist.includes(chatRoom))) roomlist.push({'id': chatRoom, 'users': []});  // if the room id was specified in the request, we check if this room exists, and create one if it doesn't
    socket.roomId = chatRoom;                                                   // create a parameter for this specific socket and store his room id in it
    let memberList = roomlist.find((e) => {return e.id == chatRoom});           // get the list of users in this room
    if (memberList) memberList = memberList.users;                              // (this is literally just a bugfix, I have no idea why this works, but "if it ain't broke, don't fix it")
    if (memberList.find((e) => {return e == name})) {                           // if there's already a user with the same name in this chatroom,
      socket.emit('nameTaken', chatRoom);                                       // we inform the user about that
    } else {                                                                    // if there isn't,
      socket.username = name;                                                   // we store his username in his socket object,
      socket.join(chatRoom);                                                    // add the user to the requested room,
      memberList.push(socket.username);                                         // add him to the list of members,
      socket.emit('joinroomconf', name, chatRoom, memberList);                        // send him a confirmation message
      socket.broadcast.to(socket.roomId).emit('memberUpdate', memberList);      // and tell every other user in that room that there's a new chat member
    }
  });

  socket.on('chat message', function(msg){                                      // this is called if someone sent a message (gets message as a parameter)
    time = new Date(Date.now()).toLocaleString();                               // create a timestamp
    socket.broadcast.to(socket.roomId).emit('chat message', socket.username, msg, time);   // send the message, sender's username and a timestamp to every other person in that room
  });

  socket.on('media', function(media, hasVideo, isTransmitting){                 // this is called if someone is streaming audio/video
                                                                                // (gets media data as an ArrayBuffer, and two flags that tell if there's a video channel
                                                                                // and whether the user is still streaming)
    socket.broadcast.to(socket.roomId).emit('media', media, socket.username, hasVideo, isTransmitting);  // we just send all of this, along with the sender's username, to every other person in the room
  });

  socket.on('disconnect', function(){                                           // this is called if a socket disconnects (i.e. closes the browser/tab)
    let memberList = roomlist.find((e) => {return e.id == socket.roomId});      // we get his room's info from the array of rooms
    if (memberList) {                                                           // if he actually was in a room (he might not necessarily be in one!),
      memberList = memberList.users;                                            // (again, just a weird bugfix)
      memberList.splice(memberList.indexOf(socket.username), 1);                // remove his username from the list of members
      if (memberList == []) {                                                   // if the room is empty after that,
        roomlist.splice(roomlist.findIndex((e) => {return e.id == socket.roomId}), 1);  // we remove the info about this room from the array of rooms,
      } else {                                                                  // otherwise,
        roomlist.find((e) => {return e.id == socket.roomId}).users = memberList; // we put the newlyformed list of users back into the array
        socket.broadcast.to(socket.roomId).emit('memberUpdate', memberList);    // and tell every other user in that room to update their list of members
      };
    };
  });
});

https.listen(443, function(){                                                   // start the server and listen to port 443 (default for HTTPS)
  console.log('Chat app is up and running!');
});
