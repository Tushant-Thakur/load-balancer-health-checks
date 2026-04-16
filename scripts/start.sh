#!/bin/bash

echo "Starting all services..."

node backends/server1.js &
node backends/server2.js &
node backends/server3.js &
node backends/server4.js &
node health-monitor/monitor.js &
node load-balancer/server.js &