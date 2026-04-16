const axios = require("axios");
const http = require("http");
const { Server, HealthHistory, BackendConfig } = require("../database/db");

const MAX_CONN = 10;   
const MIN_CONN = 2;    
const HEALTH_CHECK_INTERVAL = 5000;
const KEEP_HISTORY_LIMIT = 500;

let scalingInProgress = false;
const healthHttp = axios.create({
  timeout: 3000,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 64 })
});

async function trimHealthHistory() {
  const count = await HealthHistory.countDocuments();
  if (count <= KEEP_HISTORY_LIMIT) return;

  const removeCount = count - KEEP_HISTORY_LIMIT;
  const toRemove = await HealthHistory.find()
    .sort({ checkedAt: 1 })
    .limit(removeCount)
    .select("_id");

  if (toRemove.length) {
    await HealthHistory.deleteMany({ _id: { $in: toRemove.map((item) => item._id) } });
  }
}

async function checkHealth() {
  const servers = await Server.find();

  for (let server of servers) {
    if (server.isDisconnected) {
      await Server.updateOne(
        { _id: server._id },
        { status: "DOWN", lastChecked: new Date(), responseTime: 0, connections: 0 }
      );

      await HealthHistory.create({
        serverUrl: server.url,
        status: "DOWN",
        latencyMs: 0,
        checkedAt: new Date(),
        note: "manually disconnected"
      });
      continue;
    }

    const startedAt = Date.now();
    try {
      await healthHttp.get(server.url + "/health");
      const latency = Date.now() - startedAt;

      await Server.updateOne(
        { _id: server._id },
        { status: "UP", lastChecked: new Date(), responseTime: latency }
      );

      await HealthHistory.create({
        serverUrl: server.url,
        status: "UP",
        latencyMs: latency,
        checkedAt: new Date()
      });

      console.log("✅ " + server.url + " UP");
    } catch (err) {
      await Server.updateOne(
        { _id: server._id },
        { status: "DOWN", lastChecked: new Date() }
      );

      await HealthHistory.create({
        serverUrl: server.url,
        status: "DOWN",
        latencyMs: 0,
        checkedAt: new Date(),
        note: err.message
      });

      console.log("❌ " + server.url + " DOWN");
    }
  }

  await trimHealthHistory();
}


async function autoScale() {
  const servers = await Server.find({ status: "UP" });

  if (servers.length === 0) return;

  
  const availablePorts = [3001, 3002, 3003, 3004];

  const usedPorts = servers.map(s => {
    const parts = s.url.split(":");
    return parseInt(parts[2]);
  });

  const newPort = availablePorts.find(p => !usedPorts.includes(p));

  
  let overloaded = servers.some(s => s.connections > MAX_CONN);

  if (overloaded && !scalingInProgress && newPort) {
    scalingInProgress = true;

    console.log("⚡ High load detected → adding new server");

    await Server.create({
      url: `http://localhost:${newPort}`,
      status: "UP",
      connections: 0
    });
    await BackendConfig.create({
      action: "AUTO_SCALE_UP",
      url: `http://localhost:${newPort}`,
      changedBy: "health-monitor",
      metadata: { reason: "connections above threshold" }
    });

    console.log("✅ New server added:", newPort);

    setTimeout(() => {
      scalingInProgress = false;
    }, 10000);
  }

  
  let lowLoad = servers.every(s => s.connections < MIN_CONN);

  if (lowLoad && servers.length > 2 && !scalingInProgress) {
    scalingInProgress = true;

    const last = servers[servers.length - 1];

    await Server.deleteOne({ _id: last._id });
    await BackendConfig.create({
      action: "AUTO_SCALE_DOWN",
      url: last.url,
      changedBy: "health-monitor",
      metadata: { reason: "connections below threshold" }
    });

    console.log(" Removed server:", last.url);

    setTimeout(() => {
      scalingInProgress = false;
    }, 10000);
  }
}

setInterval(async () => {
  await checkHealth();
  await autoScale();
}, HEALTH_CHECK_INTERVAL);
