#!/bin/bash

set -e

PORT="${1:-3010}"
NAME="${2:-Dynamic-${PORT}}"
DELAY="${3:-350}"
API_URL="${4:-http://localhost:3000}"
BACKEND_URL="http://localhost:${PORT}"

echo "Starting backend ${NAME} on ${PORT}..."
PORT="${PORT}" BACKEND_NAME="${NAME}" RESPONSE_DELAY_MS="${DELAY}" node backends/dynamic-server.js &
BACKEND_PID=$!

sleep 1

echo "Registering ${BACKEND_URL} in gateway pool..."
curl -s -X POST "${API_URL}/add-server" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${BACKEND_URL}\"}"

echo
echo "Backend deployed."
echo "PID: ${BACKEND_PID}"
echo "URL: ${BACKEND_URL}"
