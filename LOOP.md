You are running an autonomous improvement loop on EquivalenceKit as a senior Intelligent
Contract and blockchain engineer. Rules and design live in AGENTS.md, UI.md and
Prompt.md in the repo root. If anything conflicts: official GenLayer docs, then
AGENTS.md, then Prompt.md, then UI.md.

SETUP (first pass only)
- Read all 3 files fully. Create LOOP_STATE.md with: current milestone, pass number,
  verified-API ledger, open gaps, last scores, stall counter.
- Confirm your tools: shell, pytest, genvm-lint, gltest, genlayer CLI, docs access. List
  what is missing and what it blocks. Missing tools are a hard stop, not a reason to guess.

STATE
Read LOOP_STATE.md at the start of every pass and rewrite it at the end. Never rely on
memory of earlier passes. Commit once per pass: "pass N: <milestone> <outcome>".

EACH PASS (one milestone, nothing else)
1. PICK: first unfinished milestone in AGENTS.md section 29 (UI.md section 19 only
   after M11). Restate it as one verifiable outcome. No skipping, no bundling.
2. VERIFY: list every GenLayer API or library behavior you need. For each, record
   source + finding in the verified-API ledger. Unverifiable means HARD STOP. Never
   assume GenVM stdlib availability.
3. DESIGN: fill the pattern spec (AGENTS.md 12.2), then write the acceptance matrix
   BEFORE any code: must-accept, must-reject, and boundary cases (exactly on each edge and
   one unit beyond).
4. BUILD: smallest slice that makes the matrix pass. Lint after every contract change.
5. GATE: run the gates in AGENTS.md section 22 in order. Paste real, trimmed output.
   Evidence rule: any number, hash, address or result you report must come from a command
   you ran this pass. If you did not run it, write NOT RUN.
6. ATTACK: try to break your own work. Run the perturbation generators, add 3 new
   harmful cases a hostile leader would try (hallucinated id, boundary push, injected
   instruction), and add 3 honest-noise cases a validator might produce. Any miss is a
   bug; fix the rule or the test, never weaken the matrix to make it pass.
7. REVIEW: run Prompt.md 5F on your own diff. Severity: HIGH = wrong/unsafe consensus or
   guessed API; MEDIUM = test gap, doc drift, missing bound; LOW = style. Fix all HIGH and
   MEDIUM before moving on.
8. REGRESS: rerun every earlier gate and matrix. If anything that passed before now
   fails, revert the pass (git) and diagnose before retrying.
9. SCORE: report in this exact format:
   PASS N | MILESTONE | RESULT (done/partial/blocked)
   GATES: primitives / lint / direct / integration (pass/fail/NOT RUN)
   TIGHTNESS: harmless accepted X/Y, harmful rejected X/Y, patterns covered
   CHECKLIST: items done of AGENTS.md section 31
   REVIEW: high/medium/low counts found and fixed
   GAPS: open items, ranked
   NEXT: one step
10. LOG: update docs, milestone status, CHANGELOG.md and LOOP_STATE.md, then start the
    next pass.

STALL RULE
If a pass makes no measurable progress (same failing test, same gap, same score), increment
the stall counter. At 3, STOP: show what you tried, your hypotheses, and what you need.
Never retry the same fix twice.

EXIT (all true, with evidence)
- Milestones M1-M11 done and evidenced
- Harmless acceptance = 100% and harmful rejection = 100% on every pattern
- Lint clean; primitive, direct and integration tests pass
- AGENTS.md section 31 fully checked; docs match code
- Two consecutive review passes with zero HIGH or MEDIUM findings
- FINAL AUDIT: a last pass that re-reads AGENTS.md as a skeptical reviewer for the
  Intelligent Contracts category (thin wrapper? format-only validator? hello-world?
  reusable? consensus explained?) and finds nothing blocking

HARD STOPS (pause, report, wait for me)
- Unverifiable API, failing test you don't understand, or any scope change
- Before deploying to Bradbury or Asimov (StudioNet is allowed)
- Anything needing a faucet claim, key, token, or other manual step
- Stall counter reaches 3
- You are about to report output you did not obtain from a real command

STOP FORMAT
STOPPED: <reason> | DONE SO FAR: <list> | NEEDED FROM YOU: <exact step or decision>
