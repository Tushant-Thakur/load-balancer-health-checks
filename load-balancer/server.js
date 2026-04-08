const express = require("express");
const path = require("path");
const lb = require("./lb");
const Server = require("../database/db");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Dashboard
app.get("/dashboard", async (req, res) => {
  const servers = await Server.find();
  res.render("index", { servers });
});

// API: Stats
app.get("/stats", async (req, res) => {
  const servers = await Server.find();
  res.json(servers);
});

// Add server
app.post("/add-server", async (req, res) => {
  const { url } = req.body;

  await Server.create({
    url,
    status: "UP",
    connections: 0
  });

  res.send("Server added");
});

// Remove server
app.post("/remove-server", async (req, res) => {
  const { url } = req.body;

  await Server.deleteOne({ url });
  res.send("Server removed");
});

// Load Balancer
app.use("/", lb);

app.listen(3000, () => {
  console.log("🚀 Load Balancer running on port 3000");
});