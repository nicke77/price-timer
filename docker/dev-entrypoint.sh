#!/bin/bash
set -euo pipefail

SRC=/src/node-red-contrib-price-timer
SECRET_FILE=/data/.credential-secret

if [ ! -f "$SRC/package.json" ]; then
  echo "Node source is not mounted at $SRC" >&2
  exit 1
fi

mkdir -p /data/node_modules

if [ ! -f "$SECRET_FILE" ]; then
  node -e "require('fs').writeFileSync(process.argv[1], require('crypto').randomBytes(32).toString('hex'), { mode: 0o600 })" "$SECRET_FILE"
  echo "Created credential secret at $SECRET_FILE"
fi

# Drop any previous package name used during development.
rm -f /data/node_modules/node-red-contrib-energy-planner
ln -sfn "$SRC" /data/node_modules/node-red-contrib-price-timer

if [ ! -f /data/flows.json ]; then
  cp /opt/dev/flows.example.json /data/flows.json
  echo "Created /data/flows.json from the example flow"
fi

cd /usr/src/node-red
exec nodemon --config /opt/dev/nodemon.json
