const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);

// Create Socket.IO server with CORS configuration
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:5173", // Vite's default port
    methods: ["GET", "POST"],
    credentials: true
  },
  // Add some reliability settings
  pingTimeout: 30000,
  pingInterval: 10000
});

// Map to keep track of connected users
const connectedUsers = new Map();

io.on("connection", (socket) => {
  const userId = socket.id;
  console.log("New client connected:", userId);
  
  // Add user to connected users
  connectedUsers.set(userId, { socketId: userId });
  
  // Send the user their ID
  socket.emit("me", userId);
  
  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", userId);
    
    // Remove from connected users
    connectedUsers.delete(userId);
    
    // Notify all other users that this user has disconnected
    socket.broadcast.emit("callEnded", { userId });
  });

  // Handle call initiation
  socket.on("callUser", (data) => {
    if (!data || !data.userToCall) {
      console.error("Invalid callUser data received");
      return;
    }
    
    console.log(`Call from ${data.from} to ${data.userToCall}`);
    
    // Check if the user to call is connected
    if (!connectedUsers.has(data.userToCall)) {
      console.log(`User ${data.userToCall} is not connected`);
      socket.emit("callError", { 
        message: "User is not connected", 
        to: data.userToCall 
      });
      return;
    }
    
    // Forward the call data to the recipient
    io.to(data.userToCall).emit("callUser", {
      signal: data.signalData,
      from: data.from,
      name: data.name || "Anonymous"
    });
  });

  // Handle call answer
  socket.on("answerCall", (data) => {
    if (!data || !data.to) {
      console.error("Invalid answerCall data received");
      return;
    }
    
    console.log(`Call answered: ${userId} -> ${data.to}`);
    
    // Check if the caller is still connected
    if (!connectedUsers.has(data.to)) {
      console.log(`Caller ${data.to} is no longer connected`);
      socket.emit("callError", { 
        message: "Caller is no longer connected", 
        to: data.to 
      });
      return;
    }
    
    // Forward the answer to the caller
    io.to(data.to).emit("callAccepted", data.signal);
  });
  
  // Handle call end
  socket.on("endCall", (data) => {
    if (!data || !data.to) {
      return;
    }
    
    console.log(`Call ended: ${userId} -> ${data.to}`);
    
    // Forward the end call request to the other user
    io.to(data.to).emit("callEnded", { from: userId });
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
