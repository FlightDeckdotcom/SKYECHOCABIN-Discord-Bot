#!/usr/bin/env bash
set -euo pipefail

mkdir -p models/piper
MODEL="models/piper/en_US-lessac-high.onnx"
CONFIG="models/piper/en_US-lessac-high.onnx.json"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high"

if [ -f "$MODEL" ] && [ -f "$CONFIG" ]; then
  echo "Piper voice already installed at $MODEL"
  exit 0
fi

echo "Downloading Piper en_US-lessac-high voice..."
curl -L "$BASE/en_US-lessac-high.onnx" -o "$MODEL"
curl -L "$BASE/en_US-lessac-high.onnx.json" -o "$CONFIG"
echo "Installed Piper voice at $MODEL"
