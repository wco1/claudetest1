#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code Web) environment
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# --- gh CLI (GitHub management: Pages, visibility, repos, PRs) ---
if ! command -v gh &> /dev/null; then
  echo "Installing gh CLI..."
  GH_VERSION=$(curl -sL "https://github.com/cli/cli/releases/latest" -o /dev/null -w "%{url_effective}" | grep -oP 'v[\d.]+')
  GH_VERSION_NUM="${GH_VERSION#v}"
  curl -sL "https://github.com/cli/cli/releases/download/${GH_VERSION}/gh_${GH_VERSION_NUM}_linux_amd64.deb" -o /tmp/gh.deb
  sudo dpkg -i /tmp/gh.deb
  rm -f /tmp/gh.deb
fi

# Auth gh with token if available
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null || true
  echo "gh CLI authenticated"
fi

# --- Python tools ---
pip install --quiet fpdf2 cffi 2>/dev/null || true

# --- Node tools for static site deployment ---
npm install -g surge 2>/dev/null || true

# --- Persist useful env vars ---
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$PATH:/usr/local/bin"' >> "$CLAUDE_ENV_FILE"
fi

echo "Session start hook completed successfully"
