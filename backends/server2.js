const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("✅ Response from Server 2");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.listen(3002, () => console.log("Server2 running on 3002"));