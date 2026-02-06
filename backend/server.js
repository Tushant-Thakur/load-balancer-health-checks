const express = require("express");
const app = express();

const PORT = 3001;

app.get("/", (req, res) => {
  res.send("Hello from Backend Server");
});

app.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
});
