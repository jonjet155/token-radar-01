[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jonjet155/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jonjet155/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# token-radar-01 — the token launch radar

[Build the best token launch radar](https://make.fun/bounty/token-radar-01) — a program that reads a
sealed DefiLlama snapshot of 758 protocols, fits a comps curve (log-log OLS of market cap on TVL
across 128 traded token families, with shrunk category factors, growth and seasoning multipliers),
ranks the 198 pre-token protocols by implied launch value, and costs a $1,000 farm plan for each
one to the dollar (FARM / THIN / SKIP). The dashboard shows the board, a detail view per protocol
and a filter, with every number traceable to the snapshot — no hand-kept list of names.

Run it with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>`.
