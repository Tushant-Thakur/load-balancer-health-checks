const express = require("express");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");
const axios = require("axios");
const { Server: SocketServer } = require("socket.io");

const lb = require("./lb");
const { Server, HealthHistory, BackendConfig } = require("../database/db");

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server);
const loadGenClient = axios.create({
  timeout: 6000,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 128 })
});
const DEFAULT_BACKENDS = [
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://localhost:3004"
];

function getGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
  } catch {
    return "no-git";
  }
}

async function ensureDefaultBackends() {
  const count = await Server.countDocuments();

  if (count > 0) return;

  const seedDocs = DEFAULT_BACKENDS.map((url) => ({
    url,
    status: "UP",
    connections: 0,
    responseTime: 0,
    isManaged: true
  }));

  await Server.insertMany(seedDocs);
  await BackendConfig.insertMany(
    seedDocs.map((item) => ({
      action: "SEED",
      url: item.url,
      gitCommit: getGitCommit(),
      changedBy: "bootstrap",
      metadata: { reason: "initial backend pool" }
    }))
  );

  console.log("✅ Seeded default backend servers");
}

async function ensureConfigBaseline() {
  const configCount = await BackendConfig.countDocuments();
  if (configCount > 0) return;

  const currentServers = await Server.find().select("url");
  if (!currentServers.length) return;

  await BackendConfig.insertMany(
    currentServers.map((item) => ({
      action: "SEED",
      url: item.url,
      gitCommit: getGitCommit(),
      changedBy: "bootstrap",
      metadata: { reason: "baseline snapshot from existing pool" }
    }))
  );
}

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.static("public"));

// ================= EJS SETUP =================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// ================= ROUTES =================

// Dashboard (single entry point)
app.get("/", async (req, res) => {
  try {
    const servers = await Server.find();
    res.render("index", { servers });
  } catch (err) {
    res.status(500).send("Error loading dashboard");
  }
});

// Backward-compatible dashboard URL
app.get("/dashboard", (req, res) => {
  res.redirect("/");
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

app.get("/history", async (req, res) => {
  try {
    const history = await HealthHistory.find()
      .sort({ checkedAt: -1 })
      .limit(50);
    res.json(history);
  } catch (err) {
    res.status(500).send("Error fetching health history");
  }
});

app.get("/config-history", async (req, res) => {
  try {
    const configHistory = await BackendConfig.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(configHistory);
  } catch (err) {
    res.status(500).send("Error fetching config history");
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

    if (!url) return res.status(400).send("url is required");

    await Server.create({
      url,
      status: "UP",
      connections: 0,
      responseTime: 0,
      isManaged: true
    });
    await BackendConfig.create({
      action: "ADD",
      url,
      gitCommit: getGitCommit(),
      changedBy: "api",
      metadata: { source: "POST /add-server" }
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
    await BackendConfig.create({
      action: "REMOVE",
      url,
      gitCommit: getGitCommit(),
      changedBy: "api",
      metadata: { source: "POST /remove-server" }
    });
    res.send("Server removed");
  } catch (err) {
    res.status(500).send("Error removing server");
  }
});

app.post("/disconnect-server", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).send("url is required");

    await Server.updateOne(
      { url },
      { isDisconnected: true, status: "DOWN", connections: 0, responseTime: 0, lastChecked: new Date() }
    );
    await BackendConfig.create({
      action: "DISCONNECT",
      url,
      gitCommit: getGitCommit(),
      changedBy: "ui",
      metadata: { source: "POST /disconnect-server" }
    });
    res.send("Server disconnected");
  } catch (err) {
    res.status(500).send("Error disconnecting server");
  }
});

app.post("/reconnect-server", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).send("url is required");

    await Server.updateOne(
      { url },
      { isDisconnected: false, lastChecked: new Date() }
    );
    await BackendConfig.create({
      action: "RECONNECT",
      url,
      gitCommit: getGitCommit(),
      changedBy: "ui",
      metadata: { source: "POST /reconnect-server" }
    });
    res.send("Server reconnected");
  } catch (err) {
    res.status(500).send("Error reconnecting server");
  }
});

// ================= LOAD GENERATION =================
app.get("/generate-load", async (req, res) => {
  try {
    let requests = [];

    for (let i = 0; i < 20; i++) {
      requests.push(loadGenClient.get("http://localhost:3000/gateway"));
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
// Keep the gateway under one explicit route so "/" stays the UI entry point.
app.use("/gateway", lb);
//starting the server  by udit raghav
// ================= START SERVER =================
async function start() {
  try {
    await ensureDefaultBackends();
    await ensureConfigBaseline();
    server.listen(3000, () => {
      console.log("🚀 Load Balancer running on port 3000");
    });
  } catch (err) {
    console.error("Failed to start load balancer:", err);
    process.exit(1);
  }
}

start();
