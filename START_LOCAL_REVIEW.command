#!/bin/zsh

set -e
cd "${0:A:h}"

PORT=4173
URL="http://localhost:${PORT}/"

python3 -m http.server "${PORT}" &
SERVER_PID=$!
trap 'kill "${SERVER_PID}" 2>/dev/null || true' EXIT INT TERM

sleep 1
open "${URL}"

echo ""
echo "AURA PADDLE local review is running at:"
echo "${URL}"
echo ""
echo "Keep this Terminal window open. Press Control-C to stop the preview server."

wait "${SERVER_PID}"
