#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUTO_UPDATE="${AUTO_UPDATE:-0}"
HTTP_PORT="${HTTP_PORT:-3000}"
P2P_PORT="${P2P_PORT:-0}"
NICKNAME="${NICKNAME:-}"
DB_PATH="${DB_PATH:-}"
MDNS="${MDNS:-0}"
BOOTSTRAP_PEERS="${BOOTSTRAP_PEERS:-}"

if [[ "$AUTO_UPDATE" == "1" ]]; then
  echo "[run-web] Pulling latest changes..."
  git pull --ff-only
  echo "[run-web] Syncing dependencies..."
  npm install
fi

CMD=(npm run start --workspace @ordernet/web -- --http-port "$HTTP_PORT" --port "$P2P_PORT")

if [[ -n "$NICKNAME" ]]; then
  CMD+=(--nick "$NICKNAME")
fi

if [[ -n "$DB_PATH" ]]; then
  CMD+=(--db "$DB_PATH")
fi

if [[ "$MDNS" == "1" ]]; then
  CMD+=(--mdns)
fi

if [[ -n "$BOOTSTRAP_PEERS" ]]; then
  IFS=',' read -r -a peers <<< "$BOOTSTRAP_PEERS"
  for peer in "${peers[@]}"; do
    CMD+=(--bootstrap "$peer")
  done
fi

echo "[run-web] Starting web node..."
"${CMD[@]}"
