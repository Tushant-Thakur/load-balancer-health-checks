const { Server, HealthHistory } = require("../database/db");

const RECORDS = 500;
const BASE_URLS = [
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://localhost:3004"
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomStatus() {
  return Math.random() > 0.08 ? "UP" : "DOWN";
}

async function run() {
  const existingServers = await Server.find().select("url");
  const urls = existingServers.length
    ? existingServers.map((item) => item.url)
    : BASE_URLS;

  const now = Date.now();
  const docs = [];

  for (let i = 0; i < RECORDS; i++) {
    const url = urls[i % urls.length];
    const status = randomStatus();
    const checkedAt = new Date(now - (RECORDS - i) * 2000);

    docs.push({
      serverUrl: url,
      status,
      latencyMs: status === "UP" ? randomInt(20, 500) : 0,
      checkedAt,
      source: "seed",
      note: status === "DOWN" ? "seeded outage sample" : ""
    });
  }

  await HealthHistory.deleteMany({});
  await HealthHistory.insertMany(docs);

  console.log(`Seeded ${RECORDS} health-history records.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
