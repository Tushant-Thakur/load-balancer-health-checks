const express = require("express");
const app = express();

app.get("/", async (req, res) => {
  await new Promise(r => setTimeout(r, 100)); 
  res.send("🔥 Response from Server 1");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.listen(3001, () => console.log("Server1 running"));