#!/usr/bin/env bash
# Refresh the GitHub Pages site (branch `gh-pages`) from a fresh playground build.
#
# The site is served from the `gh-pages` branch, root "/" — the vite `base: "./"`
# makes the bundle path-agnostic. Refresh after any playground change:
#
#   tools/deploy_playground_site.sh
#
# Pages rebuilds automatically after the push; the live URL and current deployment
# record live in deployments/pages.md.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT=$PWD
REPO_URL=$(git remote get-url origin)
WORKTREE=/tmp/opencode/ek-pages

# Fresh build; prebuild hooks keep public/pkg in sync with the Python package.
npm --prefix playground run build
[ -f playground/dist/index.html ] || { echo "playground/dist/index.html missing" >&2; exit 1; }

# Clean up any stale worktree from a previous run; the disposable local branch is
# reproduced below, so a leftover branch must not block checkout --orphan.
git worktree remove --force "$WORKTREE" 2>/dev/null || true
rm -rf "$WORKTREE"
git branch -D gh-pages 2>/dev/null || true

git worktree add --detach "$WORKTREE" HEAD > /dev/null
(
  cd "$WORKTREE"
  git checkout --orphan gh-pages
  # On an unborn branch everything is staged-new; -f is required to clear the index.
  git rm -rfq -- .
  cp -r "$REPO_ROOT/playground/dist/." .
  touch .nojekyll
  git add -A
  git commit -qm "deploy: refresh gh-pages playground site"
  git push -q origin gh-pages --force
)
git worktree remove --force "$WORKTREE"
echo "gh-pages pushed. GitHub Pages rebuilds automatically."
