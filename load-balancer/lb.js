const httpProxy = require("http-proxy");
const proxy = httpProxy.createProxyServer();
const Server = require("../database/db");

async function getServer() {
  const servers = await Server.find({ status: "UP" });

  if (servers.length === 0) return null;

  let selected = servers.reduce((prev, curr) =>
    prev.connections < curr.connections ? prev : curr
  );

  await Server.updateOne(
    { _id: selected._id },
    { $inc: { connections: 1 } }
  );

  return selected;
}

module.exports = async (req, res) => {
  const server = await getServer();

  if (!server) {
    return res.status(503).send("❌ No backend available");
  }

  proxy.web(req, res, { target: server.url });

  res.on("finish", async () => {
    await Server.updateOne(
      { _id: server._id },
      { $inc: { connections: -1 } }
    );
  });
};
