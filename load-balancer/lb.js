const httpProxy = require("http-proxy");
const proxy = httpProxy.createProxyServer({});
const { Server } = require("../database/db");

let currentIndex = 0;

async function getNextServer() {
  const servers = await Server.find({
    status: "UP",
    isDisconnected: { $ne: true }
  }).sort({ url: 1 });

  if (!servers.length) {
    return null;
  }

  const server = servers[currentIndex % servers.length];
  currentIndex++;

  console.log(`➡️ Routing request to: ${server.url}`);

  await Server.updateOne(
    { _id: server._id },
    {
      $inc: { connections: 1 }
    }
  );

  return server;
}

module.exports = async (req, res) => {
  const backend = await getNextServer();

  if (!backend) {
    return res.status(503).send("No backend available");
  }

  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;

    cleaned = true;

    try {
      const latestServer = await Server.findById(
        backend._id
      );

      if (!latestServer) return;

      const newConnections = Math.max(
        0,
        latestServer.connections - 1
      );

      await Server.updateOne(
        { _id: backend._id },
        {
          connections: newConnections
        }
      );
    } catch (err) {
      console.error(
        "Cleanup Error:",
        err.message
      );
    }
  };

  proxy.web(
    req,
    res,
    {
      target: backend.url
    },
    async (err) => {
      console.error(
        `❌ Backend Error: ${backend.url}`
      );

      try {
        await Server.updateOne(
          { _id: backend._id },
          {
            status: "DOWN",
            connections: 0,
            responseTime: 0
          }
        );
      } catch (dbErr) {
        console.error(
          "DB Error:",
          dbErr.message
        );
      }

      if (!res.headersSent) {
        res.status(502).send(
          "Backend unavailable"
        );
      }
    }
  );

  res.on("finish", cleanup);

  res.on("error", async () => {
    await cleanup();
  });
};