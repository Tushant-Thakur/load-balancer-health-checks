const express = require("express");
const app = express();

app.get("/", async (req, res) => {
  await new Promise(r => setTimeout(r, 2500)); 
  res.send("🔥 Response from Server 1");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.listen(3004, () => console.log("Server4 running"));