#!/usr/bin/env bash
set -euo pipefail

echo "==> Building frontend..."
(cd frontend && npm run build)

echo "==> Cleaning dist/..."
rm -rf dist/*

echo "==> Building Python package..."
uv build

echo "==> Publishing to PyPI..."
uv publish dist/*

echo "==> Done!"
