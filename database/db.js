const mongoose = require("mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/loadbalancer");

const serverSchema = new mongoose.Schema({
  url: String,
  status: String,
  connections: { type: Number, default: 0 },
  lastChecked: Date,
  responseTime: { type: Number, default: 0 }
});



module.exports = mongoose.model("Server", serverSchema);