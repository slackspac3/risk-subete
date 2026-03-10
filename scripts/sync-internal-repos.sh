#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_BRANCH="$(git -C "${SOURCE_REPO}" rev-parse --abbrev-ref HEAD)"
SOURCE_HEAD="$(git -C "${SOURCE_REPO}" rev-parse HEAD)"
SOURCE_SHORT="$(git -C "${SOURCE_REPO}" rev-parse --short HEAD)"

HISTORY_REPO="${HISTORY_REPO:-/Users/bhavuk.arora/Documents/GitHub/Internal-Risk-Calculator}"
FRESH_REPO="${FRESH_REPO:-/Users/bhavuk.arora/Documents/GitHub/Internal-Risk-Calculator-fresh}"
FRESH_BRANCH="${FRESH_BRANCH:-master}"

require_repo() {
  local path="$1"
  if [[ ! -d "${path}/.git" ]]; then
    echo "Missing git repo: ${path}" >&2
    exit 1
  fi
}

ensure_clean_source() {
  if [[ -n "$(git -C "${SOURCE_REPO}" status --short)" ]]; then
    echo "Source repo has uncommitted changes. Commit in ${SOURCE_REPO} before syncing." >&2
    exit 1
  fi
}

configure_history_remote() {
  if git -C "${HISTORY_REPO}" remote get-url source >/dev/null 2>&1; then
    git -C "${HISTORY_REPO}" remote set-url source "${SOURCE_REPO}"
  else
    git -C "${HISTORY_REPO}" remote add source "${SOURCE_REPO}"
  fi
}

sync_history_repo() {
  echo "Syncing history-preserving repo..."
  configure_history_remote
  git -C "${HISTORY_REPO}" fetch source "${SOURCE_BRANCH}"
  git -C "${HISTORY_REPO}" checkout master >/dev/null 2>&1

  mapfile -t commits < <(git -C "${HISTORY_REPO}" cherry master "source/${SOURCE_BRANCH}" | awk '/^\+/ {print $2}')
  if [[ "${#commits[@]}" -eq 0 ]]; then
    echo "  No new source commits to apply."
  else
    for commit in "${commits[@]}"; do
      echo "  Cherry-picking ${commit}..."
      git -C "${HISTORY_REPO}" cherry-pick "${commit}"
    done
  fi

  git -C "${HISTORY_REPO}" push origin master
}

sync_fresh_repo() {
  echo "Syncing fresh-history repo..."
  git -C "${FRESH_REPO}" checkout "${FRESH_BRANCH}" >/dev/null 2>&1
  rsync -a --delete --exclude='.git' "${SOURCE_REPO}/" "${FRESH_REPO}/"

  if [[ -z "$(git -C "${FRESH_REPO}" status --short)" ]]; then
    echo "  No file changes to snapshot."
  else
    git -C "${FRESH_REPO}" add -A
    git -C "${FRESH_REPO}" commit -m "Sync from risk-calculator ${SOURCE_SHORT}"
    git -C "${FRESH_REPO}" push origin "${FRESH_BRANCH}"
  fi
}

main() {
  require_repo "${HISTORY_REPO}"
  require_repo "${FRESH_REPO}"
  ensure_clean_source

  echo "Source repo: ${SOURCE_REPO}"
  echo "Source branch: ${SOURCE_BRANCH}"
  echo "Source head: ${SOURCE_HEAD}"

  sync_history_repo
  sync_fresh_repo

  echo "Done."
}

main "$@"
