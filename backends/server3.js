const express = require("express");
const app = express();

app.get("/", async (req, res) => {
  await new Promise(r => setTimeout(r, 2000)); 
  res.send("🔥 Response from Server 3");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.listen(3003, () => console.log("Server3 running"));