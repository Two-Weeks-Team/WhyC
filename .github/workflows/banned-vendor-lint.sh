#!/usr/bin/env bash
# Banned-vendor lint (SPEC §10.6, M2 + SC7 medium).
#
# Two passes:
#   1. Imports lint  — grep agent-backbone source for direct imports of banned packages.
#   2. Lockfile lint — walk pnpm-lock.yaml looking for banned packages anywhere in
#                       the resolved-deps tree (including transitive).
#
# Banned packages: aws-sdk, openai, @anthropic-ai/sdk
# Web tier exemption: documented in this file (per §10.6 last sentence).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

BANNED_PKGS=("aws-sdk" "openai" "@anthropic-ai/sdk")

# ---- Web-tier exemption allowlist ------------------------------------------
# Only @whyc/web is allowed to depend on `openai/tiktoken` style sub-paths,
# AND ONLY for token-counting helpers (NOT for LLM calls).
# Extend with care; each entry is a regex matched against `package@version`.
WEB_EXEMPT_REGEX='^openai/tiktoken@'

AGENT_BACKBONE_GLOBS=(
  "apps/api/src"
  "packages/agent-backbone"     # future package
  "packages/pipeline"            # future package
)

red()  { printf "\033[31m%s\033[0m\n" "$*"; }
grn()  { printf "\033[32m%s\033[0m\n" "$*"; }
ylw()  { printf "\033[33m%s\033[0m\n" "$*"; }

violations=0

# -----------------------------------------------------------------------------
# Pass 1: Imports lint
# -----------------------------------------------------------------------------
echo "[banned-vendor] pass 1/2: imports in agent backbone"
for glob in "${AGENT_BACKBONE_GLOBS[@]}"; do
  [ -d "$glob" ] || continue
  for pkg in "${BANNED_PKGS[@]}"; do
    # Match: from 'pkg', from "pkg", require('pkg'), require("pkg"), import('pkg')
    pat="(from[[:space:]]+['\"]${pkg}['\"]|require\\(['\"]${pkg}['\"]\\)|import\\(['\"]${pkg}['\"]\\))"
    matches=$(grep -RInE "$pat" "$glob" \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' \
      || true)
    if [ -n "$matches" ]; then
      red "Banned import of '$pkg' in agent backbone:"
      printf '%s\n' "$matches"
      violations=$((violations+1))
    fi
  done
done

# -----------------------------------------------------------------------------
# Pass 2: Lockfile lint (transitive)
# -----------------------------------------------------------------------------
echo "[banned-vendor] pass 2/2: pnpm-lock.yaml transitive deps"
if [ -f pnpm-lock.yaml ]; then
  for pkg in "${BANNED_PKGS[@]}"; do
    # Lock file lines look like:  /aws-sdk@2.123.0:   or  /@anthropic-ai/sdk@0.x:
    matches=$(grep -nE "^[[:space:]]*'?/${pkg}@" pnpm-lock.yaml || true)
    if [ -n "$matches" ]; then
      # Check exemption (web tier) for each match.
      while IFS= read -r line; do
        # Strip leading '/'/quotes to get pkg@version token
        ident=$(echo "$line" | sed -E "s|^[[:space:]]*'?/||; s|:.*$||")
        if [[ "$ident" =~ $WEB_EXEMPT_REGEX ]]; then
          ylw "Allowed (web exemption): $ident"
          continue
        fi
        red "Banned transitive dep in pnpm-lock.yaml: $ident"
        violations=$((violations+1))
      done <<< "$matches"
    fi
  done
else
  ylw "pnpm-lock.yaml not present — skipping transitive lint"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
if [ "$violations" -gt 0 ]; then
  red "FAILED: $violations banned-vendor violation(s) found."
  exit 1
fi

grn "OK: no banned-vendor imports or transitive deps found."
