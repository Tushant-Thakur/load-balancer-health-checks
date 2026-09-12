const axios = require("axios");
const http = require("http");
const {
  Server,
  HealthHistory,
  BackendConfig
} = require("../database/db");

const MAX_CONN = 10;
const MIN_CONN = 2;
const HEALTH_CHECK_INTERVAL = 5000;
const KEEP_HISTORY_LIMIT = 500;

let scalingInProgress = false;

const healthHttp = axios.create({
  timeout: 3000,
  httpAgent: new http.Agent({
    keepAlive: true,
    maxSockets: 64
  })
});

async function trimHealthHistory() {
  const count = await HealthHistory.countDocuments();

  if (count <= KEEP_HISTORY_LIMIT) return;

  const removeCount = count - KEEP_HISTORY_LIMIT;

  const oldRecords = await HealthHistory.find()
    .sort({ checkedAt: 1 })
    .limit(removeCount)
    .select("_id");

  if (oldRecords.length > 0) {
    await HealthHistory.deleteMany({
      _id: {
        $in: oldRecords.map(item => item._id)
      }
    });
  }
}

async function checkHealth() {
  const servers = await Server.find();

  for (const server of servers) {
    if (server.isDisconnected) {
      await Server.updateOne(
        { _id: server._id },
        {
          status: "DOWN",
          responseTime: 0,
          connections: 0,
          lastChecked: new Date()
        }
      );

      continue;
    }

    const startTime = Date.now();

    try {
      await healthHttp.get(`${server.url}/health`);

      const latency = Date.now() - startTime;

      await Server.updateOne(
        { _id: server._id },
        {
          status: "UP",
          responseTime: latency,
          lastChecked: new Date()
        }
      );

      await HealthHistory.create({
        serverUrl: server.url,
        status: "UP",
        latencyMs: latency
      });

      console.log(`✅ ${server.url} UP`);
    } catch (err) {
      await Server.updateOne(
        { _id: server._id },
        {
          status: "DOWN",
          responseTime: 0,
          connections: 0,
          lastChecked: new Date()
        }
      );

      await HealthHistory.create({
        serverUrl: server.url,
        status: "DOWN",
        latencyMs: 0,
        note: err.message
      });

      console.log(`❌ ${server.url} DOWN`);
    }
  }

  await trimHealthHistory();
}

async function autoScale() {
  if (scalingInProgress) return;

  const servers = await Server.find({
    status: "UP",
    isDisconnected: { $ne: true }
  });

  if (servers.length === 0) return;

  const totalConnections = servers.reduce(
    (sum, s) => sum + Math.max(0, s.connections),
    0
  );

  const avgConnections =
    totalConnections / servers.length;

  const availablePorts = [3003, 3004];

  const usedPorts = servers.map(server =>
    Number(server.url.split(":").pop())
  );

  const freePort = availablePorts.find(
    port => !usedPorts.includes(port)
  );

  if (avgConnections >= MAX_CONN && freePort) {
    scalingInProgress = true;

    try {
      const newServerUrl =
        `http://localhost:${freePort}`;

      const exists = await Server.findOne({
        url: newServerUrl
      });

      if (!exists) {
        await Server.create({
          url: newServerUrl,
          status: "UP",
          connections: 0,
          responseTime: 0,
          lastChecked: new Date()
        });

        await BackendConfig.create({
          action: "AUTO_SCALE_UP",
          url: newServerUrl,
          changedBy: "health-monitor",
          metadata: {
            reason: "high load"
          }
        });

        console.log(
          `🚀 Auto Scale UP -> ${newServerUrl}`
        );
      }
    } catch (error) {
      console.error(
        "Scale Up Error:",
        error.message
      );
    }

    setTimeout(() => {
      scalingInProgress = false;
    }, 10000);

    return;
  }

  const lowLoad = avgConnections < MIN_CONN;

  if (lowLoad && servers.length > 2) {
    scalingInProgress = true;

    try {
      const removable = servers.filter(
        s =>
          !s.url.includes("3001") &&
          !s.url.includes("3002")
      );

      if (removable.length > 0) {
        const target =
          removable[removable.length - 1];

        await Server.deleteOne({
          _id: target._id
        });

        await BackendConfig.create({
          action: "AUTO_SCALE_DOWN",
          url: target.url,
          changedBy: "health-monitor",
          metadata: {
            reason: "low load"
          }
        });

        console.log(
          `🗑️ Auto Scale DOWN -> ${target.url}`
        );
      }
    } catch (error) {
      console.error(
        "Scale Down Error:",
        error.message
      );
    }

    setTimeout(() => {
      scalingInProgress = false;
    }, 10000);
  }
}

setInterval(async () => {
  try {
    await checkHealth();
    await autoScale();
  } catch (err) {
    console.error(
      "Monitor Error:",
      err.message
    );
  }
}, HEALTH_CHECK_INTERVAL);

console.log("✅ Health Monitor Started");