#!/usr/bin/env bash
# Runs the whole test suite in Docker against PostgreSQL in an isolated compose
# project, then tears it down. Usage: scripts/docker-test.sh [unit|e2e|all]
set -euo pipefail
cd "$(dirname "$0")/.."

what="${1:-all}"
export APP_SECRET="${APP_SECRET:-docker-test-secret-docker-test-secret-0}"
compose=(docker compose -p gatherly-test -f docker-compose.yml -f docker-compose.test.yml)

cleanup() { "${compose[@]}" --profile test --profile e2e down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${compose[@]}" build migrate app

if [[ "$what" == "unit" || "$what" == "all" ]]; then
  echo "==> Unit and integration tests (PostgreSQL)"
  "${compose[@]}" --profile test run --rm test
fi

if [[ "$what" == "e2e" || "$what" == "all" ]]; then
  echo "==> End-to-end tests (production image)"
  "${compose[@]}" up -d --wait app
  "${compose[@]}" --profile e2e run --rm e2e
fi
