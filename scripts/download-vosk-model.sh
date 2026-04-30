#!/usr/bin/env bash
set -euo pipefail
mkdir -p models
cd models
if [ -d "vosk-model-small-en-us-0.15" ]; then
  echo "Vosk model already exists: models/vosk-model-small-en-us-0.15"
  exit 0
fi
curl -L -o vosk-model-small-en-us-0.15.zip https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip
rm vosk-model-small-en-us-0.15.zip
echo "Installed Vosk model at models/vosk-model-small-en-us-0.15"
