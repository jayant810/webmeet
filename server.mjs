import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// In-memory store for meeting admins and waiting users
// In production, consider using Redis
const rooms = new Map(); 

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    socket.on("join-room", (roomId, userId, userName, isAdmin = false) => {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { adminId: null, waitingUsers: new Map() });
      }
      
      const room = rooms.get(roomId);
      
      if (isAdmin) {
        room.adminId = socket.id;
        socket.join(roomId);
        socket.to(roomId).emit("user-connected", userId, userName);
        
        // Notify admin about users already waiting
        if (room.waitingUsers.size > 0) {
          socket.emit("waiting-list", Array.from(room.waitingUsers.values()));
        }
      } else {
        // If no admin is present, or user is not admin, put them in waiting room
        room.waitingUsers.set(userId, { socketId: socket.id, userId, userName });
        
        if (room.adminId) {
          io.to(room.adminId).emit("request-to-join", { userId, userName });
        } else {
          socket.emit("waiting-for-admin");
        }
      }

      socket.on("disconnect", () => {
        if (socket.id === room?.adminId) {
           room.adminId = null;
        }
        socket.to(roomId).emit("user-disconnected", userId);
        room?.waitingUsers.delete(userId);
      });
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
      io.to(payload.target).emit("offer", payload);
    });

    socket.on("answer", (payload) => {
      io.to(payload.target).emit("answer", payload);
    });

    socket.on("ice-candidate", (incoming) => {
      io.to(incoming.target).emit("ice-candidate", incoming);
    });

    socket.on("toggle-media", (roomId, userId, type, state) => {
       socket.to(roomId).emit("user-toggled-media", userId, type, state);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
