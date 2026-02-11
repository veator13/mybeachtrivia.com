#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$REPO_ROOT/mybeachtrivia.com"

if [[ ! -d "$APP_DIR" ]]; then
  echo "❌ Expected folder not found: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f firebase.json ]]; then
  echo "❌ firebase.json not found in $APP_DIR (wrong folder?)"
  exit 1
fi

firebase deploy --only hosting --project beach-trivia-website
