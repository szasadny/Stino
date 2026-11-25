#!/usr/bin/env bash
# Local CI parity: fast checks first, then the slow suites; no Docker or database service needed.
# Usage: scripts/test.sh [--guards] [--skip backend|frontend|quality]... (--skip takes a comma list too)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JSCPD="jscpd@5.4.3"
GUARDS_ONLY=0
SKIP=","

while [[ $# -gt 0 ]]; do
  case "$1" in
    --guards) GUARDS_ONLY=1; shift ;;
    --skip)
      [[ $# -ge 2 ]] || { echo "--skip needs a stage: backend, frontend or quality" >&2; exit 2; }
      SKIP+="$2,"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for stage in ${SKIP//,/ }; do
  case "$stage" in
    backend | frontend | quality) ;;
    *) echo "Unknown stage: $stage (use backend, frontend or quality)" >&2; exit 2 ;;
  esac
done

section() { printf '\n\033[36m=== %s ===\033[0m\n' "$1"; }
skipped() { [[ "$SKIP" == *",$1,"* ]]; }

if ! skipped backend; then
  section "Backend: fmt, clippy, guard tests"
  (
    cd "$ROOT/backend"
    cargo fmt --check
    cargo clippy --locked --all-targets -- -D warnings
    cargo test --locked --test guards
  )
fi

if ! skipped frontend; then
  section "Frontend: lint (prettier + eslint), svelte-check, knip, guard tests"
  (
    cd "$ROOT/frontend"
    npm run lint
    npm run check
    npm run knip
    npm run test:guards
  )
fi

if ! skipped quality; then
  section "Quality: duplication (jscpd)"
  (
    cd "$ROOT"
    for target in backend-src backend-tests frontend-src; do
      npx --yes "$JSCPD" --config ".jscpd/$target.json"
    done
  )
fi

if [[ "$GUARDS_ONLY" == "1" ]]; then
  printf '\n\033[32mAll selected fast checks passed (--guards).\033[0m\n'
  exit 0
fi

if ! skipped backend; then
  section "Backend: tests"
  ( cd "$ROOT/backend" && cargo test --locked )
fi

if ! skipped frontend; then
  section "Frontend: tests and build"
  (
    cd "$ROOT/frontend"
    npm test
    npm run build
  )
fi

printf '\n\033[32mAll selected stages passed.\033[0m\n'
