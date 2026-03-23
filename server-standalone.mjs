import { createServer } from "node:http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { spawn } from "node:child_process";

dotenv.config();

const port = process.env.PORT || 3001;

const httpServer = createServer((req, res) => {
  res.writeHead(200);
  res.end("WebMeet Signaling Server is Running");
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 120000,
  pingInterval: 25000,
  connectTimeout: 45000
});

const rooms = new Map(); // roomId -> { adminId, waitingUsers: Map, participants: Map }
const userIdToSocketId = new Map(); 
const socketIdToUserId = new Map(); 

io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on("join-room", (roomId, userId, userName, isAdmin = false, isPreAuthorized = false, userImage = null) => {
    console.log(`[Join] ${userName} (${userId}) requesting access to ${roomId}`);
    
    userIdToSocketId.set(userId, socket.id);
    socketIdToUserId.set(socket.id, userId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { adminId: null, waitingUsers: new Map(), participants: new Map() });
    }
    
    const room = rooms.get(roomId);
    
    if (isAdmin) {
      // Host joins — approve immediately, then auto-approve all waiting users
      room.adminId = socket.id;
      room.participants.set(userId, { socketId: socket.id, userName, userImage });
      socket.join(roomId);
      socket.emit("join-approved");
      
      // Auto-approve all waiting (pre-authorized) users
      if (room.waitingUsers.size > 0) {
        room.waitingUsers.forEach((user) => {
          io.to(user.socketId).emit("join-approved");
        });
        room.waitingUsers.clear();
      }
    } else if (isPreAuthorized && room.adminId) {
      // Pre-authorized user AND host is present — auto-approve
      room.participants.set(userId, { socketId: socket.id, userName, userImage });
      socket.join(roomId);
      socket.emit("join-approved");
    } else {
      // No host yet, or not pre-authorized — wait
      room.waitingUsers.set(userId, { socketId: socket.id, userId, userName, userImage, isPreAuthorized });
      if (room.adminId) {
        io.to(room.adminId).emit("request-to-join", { userId, userName, userImage });
      } else {
        socket.emit("waiting-for-admin");
      }
    }

    if (isAdmin && room.hostTimers) {
      clearTimeout(room.hostTimers.fiveMin);
      clearTimeout(room.hostTimers.tenMin);
      room.hostTimers = null;
      room.adminMissingSince = null;
    }

    socket.on("disconnect", () => {
      const currentSocketForUser = userIdToSocketId.get(userId);
      if (currentSocketForUser !== socket.id) return; // Prevent old socket disconnects from breaking reconnects

      if (room && room.adminId === socket.id) {
        // Teacher disconnected
        room.adminId = null;
        socket.to(roomId).emit("user-disconnected", userId);
        
        if (!room.isResumedWithoutHost) {
          // 5 minute warning: Kick students back to waiting room
          const fiveMin = setTimeout(() => {
            room.adminMissingSince = Date.now();
            io.to(roomId).emit("waiting-for-admin");
          }, 5 * 60 * 1000); // 5 minutes
          
          // 10 minute force kill
          const tenMin = setTimeout(() => {
            io.to(roomId).emit("room-ended");
            if (rooms.has(roomId)) {
              rooms.get(roomId).participants.forEach((_, uId) => userIdToSocketId.delete(uId));
              rooms.get(roomId).waitingUsers.forEach((_, uId) => userIdToSocketId.delete(uId));
              rooms.delete(roomId);
            }
          }, 10 * 60 * 1000); // 10 minutes

          room.hostTimers = { fiveMin, tenMin };
        }
      } else if (room) {
        // Student disconnected (Immediate removal)
        room.participants.delete(userId);
        room.waitingUsers.delete(userId);
        socket.to(roomId).emit("user-disconnected", userId);
      }

      userIdToSocketId.delete(userId);
      socketIdToUserId.delete(socket.id);

      // If room is completely empty of humans, tell bot to save recording
      if (room) {
        let humanCount = 0;
        room.participants.forEach((_, id) => { if (!id.startsWith("recorder-bot-")) humanCount++; });
        room.waitingUsers.forEach((_, id) => { if (!id.startsWith("recorder-bot-")) humanCount++; });
        
        if (humanCount === 0) {
          if (room.botProcess) {
            io.to(roomId).emit("room-ended"); // Gracefully tell bot to save the Cloudinary video
          } else {
            rooms.delete(roomId);
          }
        }
      }
    });
  });

  socket.on("ready-to-connect", (roomId, userId, userName, userImage = null) => {
    const room = rooms.get(roomId);
    if (!room) return;
    socket.join(roomId);
    room.participants.set(userId, { socketId: socket.id, userName, userImage });
    
    socket.to(roomId).emit("user-connected", userId, userName, userImage);
    
    const existingUsers = Array.from(room.participants.entries())
      .filter(([id]) => id !== userId)
      .map(([id, data]) => ({ userId: id, userName: data.userName, userImage: data.userImage }));
    
    socket.emit("room-participants", existingUsers);
  });

  socket.on("approve-user", (roomId, userId) => {
    const room = rooms.get(roomId);
    const user = room?.waitingUsers.get(userId);
    if (user) {
      io.to(user.socketId).emit("join-approved");
      room.waitingUsers.delete(userId);
    }
  });

  socket.on("reject-user", (roomId, userId) => {
    const room = rooms.get(roomId);
    const user = room?.waitingUsers.get(userId);
    if (user) {
      io.to(user.socketId).emit("join-rejected");
      room.waitingUsers.delete(userId);
    }
  });

  socket.on("offer", (payload) => {
    const targetSocketId = userIdToSocketId.get(payload.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", { ...payload, caller: socketIdToUserId.get(socket.id) });
    }
  });

  socket.on("answer", (payload) => {
    const targetSocketId = userIdToSocketId.get(payload.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", { ...payload, caller: socketIdToUserId.get(socket.id) });
    }
  });

  socket.on("ice-candidate", (payload) => {
    const targetSocketId = userIdToSocketId.get(payload.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", { ...payload, caller: socketIdToUserId.get(socket.id) });
    }
  });

  socket.on("toggle-mute", (roomId, userId, isMuted) => {
    socket.to(roomId).emit("user-mute-status", { userId, isMuted });
  });

  socket.on("toggle-hand", (roomId, userId, isRaised) => {
    socket.to(roomId).emit("user-hand-status", { userId, isRaised });
  });

  socket.on("toggle-video", (roomId, userId, isVideoOff) => {
    socket.to(roomId).emit("user-video-status", { userId, isVideoOff });
  });

  socket.on("toggle-screen-share", (roomId, userId, isSharing, streamId) => {
    socket.to(roomId).emit("user-screen-share-status", { userId, isSharing, streamId });
  });

  socket.on("chat-message", (roomId, message) => {
    socket.to(roomId).emit("chat-message", message);
  });

  // ─── Moderation: Resume for students (Teacher Leaves but keeps open) ───
  socket.on("resume-for-students", (roomId, adminToken) => {
    const room = rooms.get(roomId);
    if (room && room.adminId === socket.id) {
      room.isResumedWithoutHost = true;
      console.log(`[Room] ${roomId} resumed without host. Launching Bot...`);
      
      const botProcess = spawn('node', ['record-bot.mjs', roomId, adminToken], {
        detached: true,
        stdio: 'inherit'
      });
      botProcess.unref();
      room.botProcess = botProcess;
    }
  });

  // ─── Moderation: Force-end entire room (admin terminates) ───
  socket.on("force-end-room", (roomId) => {
    io.to(roomId).emit("room-ended");
    const room = rooms.get(roomId);
    if (room) {
      room.participants.forEach((_, userId) => {
        userIdToSocketId.delete(userId);
      });
      room.waitingUsers.forEach((_, userId) => {
        userIdToSocketId.delete(userId);
      });
      rooms.delete(roomId);
    }
    console.log(`[Room] Force-ended: ${roomId}`);
  });

  // ─── Moderation: Kick a specific user ───
  socket.on("kick-user", (roomId, targetUserId) => {
    const targetSocketId = userIdToSocketId.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("you-were-kicked");
      const room = rooms.get(roomId);
      if (room) {
        room.participants.delete(targetUserId);
      }
      // Tell others they left
      socket.to(roomId).emit("user-disconnected", targetUserId);
      console.log(`[Kick] ${targetUserId} kicked from ${roomId}`);
    }
  });

  // ─── Moderation: Force-mute a user's mic ───
  socket.on("force-mute-user", (roomId, targetUserId) => {
    const targetSocketId = userIdToSocketId.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("force-muted");
      // Broadcast new mute state to everyone
      socket.to(roomId).emit("user-mute-status", { userId: targetUserId, isMuted: true });
    }
  });

  // ─── Moderation: Force turn off a user's camera ───
  socket.on("force-video-off-user", (roomId, targetUserId) => {
    const targetSocketId = userIdToSocketId.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("force-video-off");
      // Broadcast new video state to everyone
      socket.to(roomId).emit("user-video-status", { userId: targetUserId, isVideoOff: true });
    }
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`> Signaling Server ready on port ${port}`);
});
