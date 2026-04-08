const axios = require("axios");
const Server = require("../database/db");

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

setInterval(checkHealth, 5000);
