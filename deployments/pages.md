# Playground site — GitHub Pages (M-UI-8)

```
HOST        GitHub Pages (static hosting; not a GenLayer network)
URL         https://habte-selassie27.github.io/equivalence-kit/
SOURCE      GitHub Actions (build_type=workflow) — .github/workflows/pages.yml
BUILD       `npm ci && npm run build` in frontend/, artifact = frontend/dist
REFRESH     push to main — the Actions deploy pipeline rebuilds and publishes the artifact
DATE        converged 2026-10-23 (legacy gh-pages branch + manual script removed)
```

Convergence (pass 24): the two pipelines (legacy `gh-pages` branch served by
`tools/deploy_playground_site.sh`, and the Actions artifact pipeline) are merged into one.
Pages now builds from `main` via `.github/workflows/pages.yml`; the `gh-pages` branch and
the manual refresh script are deleted. The site follows `main` automatically.

Verification at deploy time (HTTP 200 on every probe):

```
/                                         HTTP/2 200 (HTML contains the brand)
/assets/*.js                              HTTP/2 200 (hashed bundle)
/pkg/equivalencekit/compare.py            HTTP/2 200 (Pyodide runtime copy)
```

Notes
- `.nojekyll` is committed so Jekyll processing never mangles hashed asset paths.
- Source is public (`private: false` confirmed via the GitHub API before enabling).
- The site deploys itself on every push to `main`; no manual refresh step remains.
