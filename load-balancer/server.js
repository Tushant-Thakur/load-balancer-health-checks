const express = require("express");
const path = require("path");
const http = require("http");
const { Server: SocketServer } = require("socket.io");

const lb = require("./lb");
const Server = require("../database/db");

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server);

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.static("public"));

// ================= EJS SETUP =================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// ================= ROUTES =================

// Dashboard
app.get("/dashboard", async (req, res) => {
  try {
    const servers = await Server.find();
    res.render("index", { servers });
  } catch (err) {
    res.status(500).send("Error loading dashboard");
  }
});

// API: Stats
app.get("/stats", async (req, res) => {
  try {
    const servers = await Server.find();
    res.json(servers);
  } catch (err) {
    res.status(500).send("Error fetching stats");
  }
});

// ================= REAL-TIME SOCKET EMIT =================
setInterval(async () => {
  try {
    const servers = await Server.find();
    io.emit("stats", servers);
  } catch (err) {
    console.error("Socket emit error:", err);
  }
}, 2000);

// ================= SERVER MANAGEMENT =================

// Add server
app.post("/add-server", async (req, res) => {
  try {
    const { url } = req.body;

    await Server.create({
      url,
      status: "UP",
      connections: 0,
      responseTime: 0
    });

    res.send("Server added");
  } catch (err) {
    res.status(500).send("Error adding server");
  }
});

// Remove server
app.post("/remove-server", async (req, res) => {
  try {
    const { url } = req.body;

    await Server.deleteOne({ url });
    res.send("Server removed");
  } catch (err) {
    res.status(500).send("Error removing server");
  }
});

// ================= LOAD GENERATION =================
app.get("/generate-load", async (req, res) => {
  const axios = require("axios");

  try {
    let requests = [];

    for (let i = 0; i < 20; i++) {
      requests.push(axios.get("http://localhost:3000/"));
    }

    await Promise.all(requests);

    res.send("Load generated 🚀");
  } catch (err) {
    res.status(500).send("Error generating load");
  }
});

// ================= SOCKET CONNECTION =================
io.on("connection", (socket) => {
  console.log("⚡ Client connected");
});

// ================= LOAD BALANCER =================
app.use("/", lb);

// ================= START SERVER =================
server.listen(3000, () => {
  console.log("🚀 Load Balancer running on port 3000");
});