const express = require("express");

const app = express();
const port = Number(process.env.PORT || 3010);
const backendName = process.env.BACKEND_NAME || `Dynamic-${port}`;
const delayMs = Number(process.env.RESPONSE_DELAY_MS || 350);

app.get("/", async (_req, res) => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  res.send(`Response from ${backendName} on ${port}`);
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log(`${backendName} running on ${port}`);
});
