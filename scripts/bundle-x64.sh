#!/usr/bin/env bash
# Build web + electron + single win32-x64 zip bundle in one command.
# Usage: bash scripts/bundle-x64.sh   (from repo root)
# Adds the NodeJS install dir to PATH so `npm` resolves from Git Bash.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="${NODEJS_HOME:-/c/Program Files/nodejs}:$PATH"
npm run bundle:x64
