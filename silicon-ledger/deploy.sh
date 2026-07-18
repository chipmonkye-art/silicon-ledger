#!/usr/bin/env bash
set -euo pipefail

APP="silicon-ledger"
REMOTE_USER="sitedbwu"
REMOTE_HOST="silicon98.com"
REMOTE_PATH="home/sitedbwu/tmp"
REMOTE_FINAL="home/sitedbwu/public_html"

echo "==> Building production bundle..."
npm run build

echo "==> Creating deploy tarball..."
cd dist
tar czf ../dist.tar.gz .
cd ..

echo "==> Uploading to $REMOTE_HOST..."
scp dist.tar.gz "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

echo "==> Deploying on remote..."
ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
  cd "$REMOTE_PATH"
  rm -rf "$REMOTE_FINAL.bak"
  [ -d "$REMOTE_FINAL" ] && mv "$REMOTE_FINAL" "$REMOTE_FINAL.bak"
  mkdir -p "$REMOTE_FINAL"
  tar xzf dist.tar.gz -C "$REMOTE_FINAL"
  rm dist.tar.gz
  echo "  Deployed to $REMOTE_FINAL"
EOF

rm dist.tar.gz
echo "==> Done. Site deployed to https://www.silicon98.com"
