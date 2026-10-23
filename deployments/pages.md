# Playground site — GitHub Pages (M-UI-8)

```
HOST        GitHub Pages (static hosting; not a GenLayer network)
BRANCH      gh-pages, root "/"; vite base "./" keeps the bundle path-agnostic
URL         https://habte-selassie27.github.io/Equivalence-Kit-/
ENABLED     2026-10-23, source branch gh-pages, path "/" (already enabled at deploy time;
            first build reported status "built")
BUILT FROM  playground/dist at pass 15 (commit 83746c4) — fresh build at deploy time
REFRESH     tools/deploy_playground_site.sh (legacy branch pipeline, serving authority)
CI          .github/workflows/pages.yml (Actions artifact pipeline, fixed pass 20:
            copy_pkg step removed, `main` added to the github-pages environment
            branch allow-list; deploy succeeded on rerun)
DATE        2026-10-23
```

Verification at deploy time (HTTP 200 on every probe):

```
/                                         HTTP/2 200 (HTML contains the brand)
/assets/index-K2HjFmr9.css                HTTP/2 200 (hashed CSS bundle)
/pkg/equivalencekit/compare.py            HTTP/2 200 (Pyodide runtime copy)
```

Verification after pass 19 content: the served bundle contains "Developer's guide"
(the new nav entry) and the documented cannot-do limits line.

Deploy-pipeline note: the repo now has TWO coin-operated pipelines — the gh-pages
branch pipeline that actually serves (legacy build_type), and the Actions artifact
pipeline that records the deployment. Re-run `tools/deploy_playground_site.sh` after any
playground change until the serving source is switched to Actions; only one of them
should eventually remain.

Notes
- `.nojekyll` is committed so Jekyll processing never mangles hashed asset paths.
- Source is public (`private: false` confirmed via the GitHub API before enabling).
- The site deploys itself only when the refresh script runs; it does not follow
  `main` automatically. Re-run the script after any playground change.
