[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jonjet155/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jonjet155/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# token-radar-01 — the token launch radar (v2c)

[Build the best token launch radar](https://make.fun/bounty/token-radar-01) — a program that reads a
sealed DefiLlama snapshot of 758 protocols, fits a comps curve (log-log OLS of market cap on TVL
across 128 traded token families, with a category factor shrunk toward 1 with K pseudo-peers tuned
by leave-one-out over {3, 5, 8, 12, 20, 25, 40}, plus growth and seasoning multipliers), ranks the
198 pre-token protocols by implied launch value, and costs a $1,000 farm plan for each one to the
dollar (ROBUST / FARM / THIN / SKIP, with a pays-from break-even and 58 early finds). The chains
term was fitted and dropped: with chains the backtest reads LOO ×3.38 / time-split ×3.27, without
it ×3.28 / ×2.77 at the tuned K, so the shipped curve has no breadth term. Buckets follow the field
convention: 416 protocols record a token, 144 pre-token protocols are set aside (42 CEX, 11
versioned names, 63 off the watchlist above the floor, 28 below the early cut), and the 128 fitted
families are named on their own. The dashboard leads with the sortable board table, shows a detail
view per protocol and a filter, with every number traceable to the snapshot — no hand-kept list
of names.

Run it with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>`.
