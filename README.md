[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# token-radar-01 — the token launch radar

Launch Radar reads a sealed DefiLlama snapshot of 758 protocols, fits a
value curve on the traded tokens, and ranks the 198 protocols that record
no token by implied launch value — the value a token would have if it
launched, times the odds that it launches at all. Every row also gets a
priced farm plan: the drop a deposit would earn, minus swap and gas fees,
against a T-bill, graded ROBUST, FARM, THIN, MARGINAL or SKIP. The
dashboard shows the board, a detail drawer per protocol, and filters for
tier, verdict, category, chain, deposit, drop share and horizon. Every
number on the page traces back to the snapshot; no name is special-cased
and nothing is fetched from the network.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` is Node 22, standard library only. It writes `board.json`,
`data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the
output directory.

## The model (radar-6)

The value curve regresses log market cap on log TVL, the 7-day TVL
change, and a squared and cubed bend in size, fitted on winsorized comps
(5–95%) with a category premium shrunk by ridge K=50. The token-odds
model is a small logistic fit on the standing peers: size, no-token age,
7-day growth and a namesake sibling. A term is kept only if it lowers the
held-out miss in both out-of-sample tests — leave-one-out and
walk-forward — and the dashboard shows every term that was tried, kept
or not.

- Value miss: LOO ×2.76, walk-forward ×2.28 (flat median multiple: ×5.33
  walk-forward); R² 0.2254 on the traded comps.
- Token odds: Brier LOO 0.192, walk-forward 0.224, against a 0.356
  base-rate walk-forward; base token rate 0.555 (242/436 peers).
- Board: 198 rows, watchlist 40/40, total implied value $889,260,123,
  checksum `e2e9b17d`.
- Verdicts at the $10,000 / 7% / 12-week plan: ROBUST 20, FARM 158,
  THIN 14, MARGINAL 0, SKIP 6.
- Top row: Steakhouse Financial, if-it-launches ≈ $30.7M.

## Verification

The board gate passes 7/7: all 198 rows present, ranks 1–198 in order,
implied values never rise, totals match, the checksum matches the one
`main.ts` recomputes, the watchlist is fully ranked, and the ledger
accounts for all 758 snapshot protocols in exactly one group. Two runs
into fresh directories are byte-identical. Sizes stay inside the caps:
`data.js` under 65,536 bytes, the dashboard under 4 MiB, the dossier
under 1.5 MiB, and each screenshot under 512 KiB.
