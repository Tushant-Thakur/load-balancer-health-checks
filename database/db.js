const mongoose = require("mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/loadbalancer");

const serverSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, unique: true },
    status: { type: String, enum: ["UP", "DOWN"], default: "UP" },
    connections: { type: Number, default: 0 },
    lastChecked: Date,
    responseTime: { type: Number, default: 0 },
    weight: { type: Number, default: 1 },
    isManaged: { type: Boolean, default: true },
    isDisconnected: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const healthHistorySchema = new mongoose.Schema(
  {
    serverUrl: { type: String, required: true },
    status: { type: String, enum: ["UP", "DOWN"], required: true },
    latencyMs: { type: Number, default: 0 },
    checkedAt: { type: Date, default: Date.now },
    source: { type: String, default: "monitor" },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

const backendConfigSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        "ADD",
        "REMOVE",
        "AUTO_SCALE_UP",
        "AUTO_SCALE_DOWN",
        "SEED",
        "DISCONNECT",
        "RECONNECT"
      ],
      required: true
    },
    url: { type: String, required: true },
    gitCommit: { type: String, default: "unknown" },
    changedBy: { type: String, default: "system" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

healthHistorySchema.index({ checkedAt: -1 });
healthHistorySchema.index({ serverUrl: 1, checkedAt: -1 });
backendConfigSchema.index({ createdAt: -1 });

const Server = mongoose.model("Server", serverSchema);
const HealthHistory = mongoose.model("HealthHistory", healthHistorySchema);
const BackendConfig = mongoose.model("BackendConfig", backendConfigSchema);

module.exports = {
  mongoose,
  Server,
  HealthHistory,
  BackendConfig
};