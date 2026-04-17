const httpProxy = require("http-proxy");
const proxy = httpProxy.createProxyServer();
const { Server } = require("../database/db");

let index = 0;
const BURST_FALLBACK_GAP = 2;

async function getServer() {
  const servers = await Server.find({ status: "UP" }).sort({ url: 1 });

  if (servers.length === 0) return null;

  let selected = servers[index % servers.length];
  index++;

  let least = servers.reduce((prev, curr) =>
    prev.connections < curr.connections ? prev : curr
  );
  
  if (selected.connections - least.connections >= BURST_FALLBACK_GAP) {
    selected = least;
  }

  console.log("➡️ Routing request to:", selected.url);

  await Server.updateOne(
    { _id: selected._id },
    { $inc: { connections: 1 } }
  );

  return selected;
}

module.exports = async (req, res) => {
  const start = Date.now();
  const server = await getServer();

  if (!server) {
    return res.status(503).send("❌ No backend available");
  }

  proxy.web(req, res, { target: server.url }, async () => {
    await Server.updateOne(
      { _id: server._id },
      { status: "DOWN", responseTime: 0, $inc: { connections: -1 } }
    );
  });

  res.on("finish", async () => {
    const time = Date.now() - start;

    await Server.updateOne(
      { _id: server._id },
      { responseTime: time }
    );

    setTimeout(async () => {
      await Server.updateOne(
        { _id: server._id },
        { $inc: { connections: -1 } }
      );
    }, 1000);
  });

};
