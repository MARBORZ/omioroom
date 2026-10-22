#!/usr/bin/env bash
set -e

echo "=============================================="
echo " [omioroom] Restarting Server & Web App..."
echo "=============================================="

# Kill any existing processes on ports 4000 and 5174
PIDS_4000=$(lsof -ti :4000 2>/dev/null || true)
if [ -n "$PIDS_4000" ]; then
  echo "[omioroom] Killing process on port 4000 (PID: $PIDS_4000)..."
  echo "$PIDS_4000" | xargs kill -9 2>/dev/null || true
fi

PIDS_5174=$(lsof -ti :5174 2>/dev/null || true)
if [ -n "$PIDS_5174" ]; then
  echo "[omioroom] Killing process on port 5174 (PID: $PIDS_5174)..."
  echo "$PIDS_5174" | xargs kill -9 2>/dev/null || true
fi

sleep 1

echo "[omioroom] Starting backend (:4000) and frontend (:5174)..."
npm run dev
