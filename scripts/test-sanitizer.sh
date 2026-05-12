#!/usr/bin/env bash
# Prompt-injection sanitizer fixtures (M5 / SPEC §10.1 / master-plan-v4 Phase 1).
#
# Builds @whyc/jobs (the sanitizer lives there) and runs the adversarial corpus
# under eval/sanitizer_fixtures/ through the real sanitize() implementation.
# Exits non-zero on any failed case. Wired to the `sanitizer-fixtures` job in
# .github/workflows/ci.yml; also runnable locally:
#
#   bash scripts/test-sanitizer.sh
#
set -euo pipefail

# repo root = parent of this script's dir
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> building @whyc/jobs (sanitize lives there)"
pnpm --filter @whyc/jobs run build >/dev/null

echo "==> running sanitizer fixtures"
node eval/sanitizer_fixtures/run.mjs
