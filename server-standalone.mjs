import { createServer } from "node:http";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

const port = process.env.PORT || 3001;
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*";

const httpServer = createServer((req, res) => {
  res.writeHead(200);
  res.end("WebMeet Signaling Server is Running");
});

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow all origins for debugging on AWS, or add your duckdns domain
      callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true // Support older clients if any
});

const rooms = new Map(); // Map of roomId -> { adminId, waitingUsers: Map, participants: Map }

io.on("connection", (socket) => {
  console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);

  socket.on("join-room", (roomId, userId, userName, isAdmin = false) => {
    console.log(`[${new Date().toISOString()}] User ${userName} (${userId}) joining room: ${roomId} (Admin: ${isAdmin})`);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { adminId: null, waitingUsers: new Map(), participants: new Map() });
    }
    
    const room = rooms.get(roomId);
    
    if (isAdmin) {
      room.adminId = socket.id;
      room.participants.set(userId, { socketId: socket.id, userName });
      socket.join(roomId);
      console.log(`[${new Date().toISOString()}] Admin ${userName} joined and is ready.`);
      
      // Notify others already in the room
      socket.to(roomId).emit("user-connected", userId, userName);
      
      // If there are users waiting, notify the newly joined admin immediately
      if (room.waitingUsers.size > 0) {
        console.log(`[${new Date().toISOString()}] Sending waiting list to new admin`);
        room.waitingUsers.forEach((user) => {
          socket.emit("request-to-join", user);
        });
      }
    } else {
      room.waitingUsers.set(userId, { socketId: socket.id, userId, userName });
      if (room.adminId) {
        io.to(room.adminId).emit("request-to-join", { userId, userName });
      } else {
        socket.emit("waiting-for-admin");
      }
    }

    socket.on("disconnect", () => {
      console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}`);
      
      // Add a small grace period before removing the user
      // This helps with tab switching and brief connection flickers
      setTimeout(() => {
        const currentSocket = io.sockets.sockets.get(socket.id);
        if (!currentSocket || !currentSocket.connected) {
          if (socket.id === room?.adminId) room.adminId = null;
          socket.to(roomId).emit("user-disconnected", userId);
          room?.waitingUsers.delete(userId);
          room?.participants.delete(userId);
          console.log(`[${new Date().toISOString()}] User ${userName} permanently removed from room ${roomId}`);
        }
      }, 5000); // 5 second grace period
    });
  });

  socket.on("ready-to-connect", (roomId, userId, userName) => {
    const room = rooms.get(roomId);
    if (!room) return;

    console.log(`[${new Date().toISOString()}] User ${userName} (${userId}) is approved and joining room: ${roomId}`);
    socket.join(roomId);
    
    // 1. Add to active participants
    room.participants.set(userId, { socketId: socket.id, userName });

    // 2. Notify OTHERS that this user is now ready. 
    // They will be the ones to initiate the offer (Impolite peers).
    socket.to(roomId).emit("user-connected", userId, userName);
    
    // 3. Send the list of existing participants to THIS user
    // But don't trigger 'user-connected' for them yet, 
    // just let the new user know who is there so they can set names.
    const existingUsers = Array.from(room.participants.entries())
      .filter(([id]) => id !== userId)
      .map(([id, data]) => ({ userId: id, userName: data.userName }));
    
    socket.emit("room-participants", existingUsers);
  });

  socket.on("approve-user", (roomId, userId) => {
    const room = rooms.get(roomId);
    const user = room?.waitingUsers.get(userId);
    if (user) {
      console.log(`[${new Date().toISOString()}] Approving user ${userId} in room ${roomId}`);
      io.to(user.socketId).emit("join-approved");
      room.waitingUsers.delete(userId);
    }
  });

  socket.on("reject-user", (roomId, userId) => {
    const room = rooms.get(roomId);
    const user = room?.waitingUsers.get(userId);
    if (user) {
      console.log(`[${new Date().toISOString()}] Rejecting user ${userId} in room ${roomId}`);
      io.to(user.socketId).emit("join-rejected");
      room.waitingUsers.delete(userId);
    }
  });

  socket.on("offer", (payload) => io.to(payload.target).emit("offer", payload));
  socket.on("answer", (payload) => io.to(payload.target).emit("answer", payload));
  socket.on("ice-candidate", (incoming) => io.to(incoming.target).emit("ice-candidate", incoming));
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`> Signaling Server ready on port ${port}`);
  console.log(`> Allowed Origins: ${allowedOrigins}`);
});
