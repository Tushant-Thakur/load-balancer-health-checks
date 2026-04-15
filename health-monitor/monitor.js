const axios = require("axios");
const Server = require("../database/db");

const MAX_CONN = 10;   // scale up threshold
const MIN_CONN = 2;    // scale down threshold

let scalingInProgress = false;

// ================= HEALTH CHECK =================
async function checkHealth() {
  const servers = await Server.find();

  for (let server of servers) {
    try {
      await axios.get(server.url + "/health");

      await Server.updateOne(
        { _id: server._id },
        { status: "UP", lastChecked: new Date() }
      );

      console.log("✅ " + server.url + " UP");
    } catch {
      await Server.updateOne(
        { _id: server._id },
        { status: "DOWN", lastChecked: new Date() }
      );

      console.log("❌ " + server.url + " DOWN");
    }
  }
}

// ================= AUTO SCALING =================
async function autoScale() {
  const servers = await Server.find({ status: "UP" });

  if (servers.length === 0) return;

  // 🔥 Only allow known servers (avoid fake ports)
  const availablePorts = [3001, 3002, 3003, 3004];

  const usedPorts = servers.map(s => {
    const parts = s.url.split(":");
    return parseInt(parts[2]);
  });

  const newPort = availablePorts.find(p => !usedPorts.includes(p));

  // ================= SCALE UP =================
  let overloaded = servers.some(s => s.connections > MAX_CONN);

  if (overloaded && !scalingInProgress && newPort) {
    scalingInProgress = true;

    console.log("⚡ High load detected → adding new server");

    await Server.create({
      url: `http://localhost:${newPort}`,
      status: "UP",
      connections: 0
    });

    console.log("✅ New server added:", newPort);

    setTimeout(() => {
      scalingInProgress = false;
    }, 10000);
  }

  // ================= SCALE DOWN =================
  let lowLoad = servers.every(s => s.connections < MIN_CONN);

  if (lowLoad && servers.length > 2 && !scalingInProgress) {
    scalingInProgress = true;

    const last = servers[servers.length - 1];

    await Server.deleteOne({ _id: last._id });

    console.log(" Removed server:", last.url);

    setTimeout(() => {
      scalingInProgress = false;
    }, 10000);
  }
}

setInterval(async () => {
  await checkHealth();
  await autoScale();
}, 5000);