[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![token-radar-01 rank](https://make.fun/badge/token-radar-01-rank.svg)](https://make.fun/bounty/token-radar-01)
[![token-radar-01 reward](https://make.fun/badge/token-radar-01-reward.svg)](https://make.fun/bounty/token-radar-01)

# token-radar-01 — the token launch radar

A program that reads a sealed DefiLlama snapshot of 758 protocols, fits a
launch-value curve on the traded tokens, ranks the 198 protocols that record
no token by implied launch value, and prices a costed farm plan for every
row. The dashboard shows the board, a detail view for each protocol, and
filters; every figure traces back to the snapshot, and every term in the
model earned its place by lowering the held-out miss in two tests.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. It writes `board.json`, `data.js`,
`dashboard/` (3 files), `screenshots/` (3 images) and `dossier.json` into
the output directory.

## The model (radar-7)

- Value curve: log market cap on log TVL, 7-day TVL growth capped at
  ±30% and a bend in size, fitted on the traded tokens with comps
  winsorized 5–95% and a category premium shrunk with ridge K=50. The cap
  stops a one-week TVL crash from multiplying a value several-fold; the
  full model with the capped term beats the model without it on both
  held-out tests.
- Token odds: a logistic model on size, no-token age, 7-day growth and
  whether a namesake sibling exists, fitted on the standing peers.
- Implied value = value if a token launches × token odds. The printed
  P25–P75 range comes from the leave-one-out misses, widened ×1.2.
- Farm plan: the drop is shared pro-rata with the protocol's TVL; fees
  are a 0.3% swap plus one gas payment per transaction; the T-bill pays
  4% a year. Verdicts: ROBUST beats the T-bill at $25 an hour on a $500
  deposit as well as on the plan deposit; FARM beats it at $10; THIN
  clears its fees; MARGINAL loses under $25; SKIP loses more.

Held-out results on this snapshot: value miss LOO ×2.75 / walk-forward
×2.31 (flat baseline ×4.89 / ×5.33); token-odds Brier LOO 0.191 /
walk-forward 0.224 (base-rate Brier 0.248 / 0.356); token-odds accuracy
67% held-out (walk-forward) and 71% in-sample, both at a 0.5 call;
verdicts ROBUST 0 / FARM 68 / THIN 74 / MARGINAL 25 / SKIP 31 across 198
rows; watchlist 40/40 ranked; total implied value $883M.

## Verification

- The board gate runs inside `main.ts`: all 40 watchlist slugs present,
  ranks 1–198 in order, implied value never rises, every row carries 6
  farm steps of 20–600 characters.
- Two runs to fresh directories are byte-identical (deterministic).
- Sizes stay inside the caps: `data.js` under 65,536 bytes, each
  screenshot under 512 KiB, the dossier under 1.5 MiB.
