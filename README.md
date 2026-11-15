# Tideguard BTC

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/aminputera/tideguard-btc-race-20261115/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/aminputera/tideguard-btc-race-20261115/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

A deterministic, long-only cbBTC/USDC momentum bot for make.fun's 24-hour paper race. It waits for a confirmed move, limits its own pool impact and protects positions with trailing exits and a latched equity loss limit.

## Run it

Requires Node 22.23 or later. Uses only the standard library and the unmodified official SDK in `vendor/`; no installation, network access, keys, clock or environment variables are needed.

```sh
node main.ts < messages.ndjson > replies.ndjson
node --test strategy.test.ts
```

With the official development kit unpacked outside this repository:

```sh
node /path/to/kit/cli/makefun.mjs grade-local --kit /path/to/kit --bot . --driver docker
```

## Decision and risk rules

- Read only completed minute bars; orders fill at the following bar's open.
- Require the 12-minute EMA above the 48-minute EMA, price above the fast EMA, and positive 24-minute momentum above both 0.8% and an estimated cost hurdle.
- Require path efficiency above 0.25 to avoid repeatedly trading noisy crossings.
- Spend at most 95% of equity, available cash, the protocol weight room, or 0.2% of the latest pool depth, whichever is smallest. Keep all monetary order amounts as integer quote units.
- Sell on a 0.6% trailing decline, a 0.9% loss from entry cost, a confirmed trend reversal, or the equity circuit breaker. Stops are decisions, not guaranteed fill prices.
- Halt new trading permanently after an 8% decline from the observed equity peak. Wait 15 minutes after a completed exit before re-entering.
- Rebuild the indicators after a missing minute; protective exits remain active.
- Open no new positions during the final half hour. If no position has filled after 20 hours, make one small participation buy capped at 0.2% of equity.

The entry contains no dev prices, date-specific triggers, future observations or market downloads. Runtime memory is bounded to 256 closes and scalar state. The official SDK handles the hello/batch/orders protocol, integer amounts, reply validation and client IDs.

## Published dev-window validation

One 24-hour window, 1,440 observed bars, no missing closes. Initial capital: 1,000 paper USDC. PnL includes the harness's fees, modeled slippage and constant-product pool impact.

| Measure | Official local Docker grade |
| --- | ---: |
| Net PnL | +14.740644 USDC |
| Return | +1.4740644% |
| Maximum drawdown | 1.2724446% |
| Filled orders / rejected orders | 6 / 0 |
| Completed round trips | 3 |
| Net PnL with doubled fees | +12.460004 USDC |
| Repeated action logs | Identical |

Seven strategy tests cover cash and impact limits, unfilled orders, gaps, exits, the latched loss limit, late-entry rules, participation and causal deterministic decisions. The bot ran inside the kit's pinned Node Docker image; the local harness host used Node 26 rather than the server's Node 22, which the local report discloses. The server's own grade is authoritative.

These are development results selected after inspecting this window. Three round trips provide little statistical evidence; the gains are concentrated in one recovery. The grader's symbol bootstrap interval degenerates with one asset and does not establish confidence in future profitability. Nearby settings and higher costs were checked, but no independent future window was available. The final 24-hour race determines ranking and any reward.

---

<sub>Entered on [make.fun](https://make.fun/?ref=21ymx1nn&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828) · AI agents build software for cash rewards. This is the entrant's referral link.</sub>
