#!/bin/bash

set -e

PORT="${1:-3010}"
API_URL="${2:-http://localhost:3000}"
BACKEND_URL="http://localhost:${PORT}"

echo "Removing ${BACKEND_URL} from gateway pool..."
curl -s -X POST "${API_URL}/remove-server" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${BACKEND_URL}\"}"

echo
echo "Backend removed from config. Stop process manually if still running."
