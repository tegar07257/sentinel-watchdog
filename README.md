# Sentinel Watchdog

**A watchdog for large cross-chain transfers, published as an open agent network.**

Large token transfers are public the moment they happen — but nobody watches them
around the clock, and a human checking a block explorer always sees them too late.
Sentinel Watchdog watches continuously, on-chain, with no server and no human in the
loop: an autonomous **Reactive Network** sentinel monitors WETH transfers on
Base Sepolia, and every transfer at or above a fixed threshold triggers a verifiable
alert back on the origin chain.

This repository is the *agentic web* face of that watchdog. The site publishes the
network — a manifest, a network definition, and a browser runtime — so that any
person, and any conforming agent runtime, can inspect the network, load it, and ask
it what it has seen.

> Built for **The Open Agentic Web Challenge** (Devpost × Cognizant), during the
> submission period (the on-chain contracts were deployed 14 November 2026).

---

## What it does

Ask the watchdog a question — *"What is the latest large-transfer status?"* — and the
front agent delegates to a chain reader that fetches the live public state of both
contracts, then to an interpreter that classifies the activity with published,
deterministic rules (QUIET / NOISE / ELEVATED / LARGE MOVE / DUMP_CASCADE) and checks
loop integrity: every flagged transfer should have produced exactly one alert.

## How it works

1. **Watch** — the `Sentinel` reactive contract (Lasna testnet) subscribes to
   `Transfer` events of WETH on Base Sepolia (`0x4200000000000000000000000000000000000006`).
2. **Decide on-chain** — a transfer ≥ the immutable threshold (0.05 ETH) increments
   `largeSellCount` and records amount + block. Nothing off-chain can fake or skip this.
3. **Alert cross-chain** — the Reactive Network delivers a callback to
   `SentinelCallback` on Base Sepolia, which stores the alert count, amount, and block.
4. **Explain** — this site's agent network reads that state in the visitor's browser
   (public JSON-RPC, no wallet, no keys) and explains it with exact numbers.

## Live testnet deployment (verify it yourself)

Current deployment is pair #3, the hardened redeploy of 2026-11-15
(threshold 0.05 ETH, Cron1000, callback gas limit 500,000). The two
contracts live at different addresses:

```
Sentinel (Lasna):             0xE86A5E5D1bCC4c1bF68aecAA8D3763BF475e8AE0
SentinelCallback (Base Sep.): 0x61D4b1F2bC65d578B00CC9CF64a83EA191Cd6245
```

| Component | Chain | Chain ID | Evidence |
|---|---|---|---|
| Sentinel | Lasna (Reactive testnet) | 5318007 | deploy tx `0xba6ad5c8f859aeb2ba4f9a2fdaf1e3e715031c589a49f4e75650b377599cdf51` |
| SentinelCallback | Base Sepolia | 84532 | deploy tx `0x1dc55d939db77ffa3102b98481f34739d7abbcfaf18caf8ea4ac9bee3d25b490` |

**End-to-end loop — verified with real organic transfers.** The sentinel flagged
WETH transfers ≥ 0.05 ETH, and every callback arrived on Base Sepolia with the
matching amount (18 detections / 18 alerts at the last full read).
State read live from the public RPCs on 2026-11-15:

| Value | On-chain |
|---|---|
| `largeSellCount` (Lasna) | 18 |
| `lastLargeSellAmount` | 0.274850660950339408 ETH (≈ 5.5× the 0.05 ETH threshold) |
| `lastLargeSellBlock` | 58971012 |
| `lastAlertCount` (Base Sepolia) | 18 |
| `lastAlertAmount` | 0.274850660950339408 ETH |
| `lastAlertBlock` | 58971017 |
| Sentinel lREACT balance (fuel) | 0.0050941 lREACT |

(The first deployment, pair #1 of 2026-11-14, shared the address
`0xb78d73DEfCcCD42f3A6bbca4E05aF9149320c3C9` on both chains; it is superseded.)

The website's status panel reads these getters in your browser; the same snapshot is
embedded as a clearly labelled fallback if an RPC is unreachable.

## Open Agentic Web conformance

Conforms to the **Minimum Viable Specification for a Worldwide Agentic Web,
MVP Profile 0.2** (6 November 2026, Cognizant AI Lab —
[spec](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md),
Apache-2.0):

| Spec file (§3.3) | This site |
|---|---|
| `agent-manifest.json` | ✅ Published at the site root: network name, `front_man`, `hocon` file, router metadata, peer policy |
| Network definition `<network>.network.json` | ✅ `sentinel_watchdog.network.json` — Neuro SAN data model in JSON serialisation (JSON is valid HOCON, fully resolved) |
| Runtime that runs the network in the browser | ✅ `runtime.js` — loads + validates the network, registers site actions, runs the front agent with bounded steps |
| `links.json` peer map | ✅ Published; no peers bound yet (structure version 1) |
| `agent-mcp.json` | ✅ Published; explicitly marks the MCP facade unavailable on static hosting, as in the official examples |
| Optional LLM configuration interface | ✅ BYOK panel: key stays in caller-origin localStorage, never enters prompts, manifests, or peer calls |

Another agent site calls this network with the spec's URL convention:
`<this site's base URL>/sentinel_watchdog` — the runtime fetches `agent-manifest.json`
from the base and selects the network by exact name.

Honest subset note: Week 1 executes the network's deterministic tool path. The full
LLM streaming loop, peer loading with the consent flow, and the spec's reference
runtime (nsDeploy) integration are Week 2 work — see `runtime.json` for the exact
implemented / not-yet list.

## Agents

| Agent | Role |
|---|---|
| `sentinel_watchdog` (front) | Receives the visitor's question, orchestrates the read + classification, answers with exact on-chain values |
| `chain_reader` | Reads both contracts via the read-only site actions `read_sentinel_state` and `read_callback_state` |
| `interpreter` | Applies the published classification rules and the loop-integrity check |

## Run it locally

No build step, no dependencies:

```bash
cd sentinel-watchdog
python3 -m http.server 8080
# open http://localhost:8080
```

(Serve over HTTP — browsers block `fetch()` of the manifest from `file://`. If opened
from disk anyway, the page still renders with the labelled verified snapshot.)

## Project structure

```
sentinel-watchdog/
├── index.html                      # the public site (status panel, agents, interaction, BYOK)
├── styles.css
├── app.js                          # page logic
├── runtime.js                      # the browser runtime (loads + runs the network)
├── runtime.json                    # runtime descriptor: conformance subset + assumptions
├── agent-manifest.json             # site manifest (spec §3.3)
├── sentinel_watchdog.network.json  # the agent network definition
├── links.json                      # peer-network link map
├── agent-mcp.json                  # MCP facade status
├── LICENSE                         # Apache-2.0 (see note inside)
└── README.md
```

## Known limitations (stated plainly)

- **Testnet only**, and the origin is a test token (WETH on Base Sepolia). Values are
  real on-chain values, but not real funds.
- **Open issue — repeated deliberate triggers:** after the verified organic loop,
  several deliberate test transfers were not processed by the testnet reactive
  relayer (`lastCronBlock` still 0). This looks like a testnet relayer/subscription
  issue, not a contract bug (getters, funding, and the one organic loop are all
  correct); it is being investigated and may limit on-demand demo triggers.
- The classifier is deliberately simple and fully published — it is a reporting
  layer, not a trading signal.

## What's next

- Adopt the spec's reference browser runtime (nsDeploy) alongside `runtime.js` for
  the full LLM agent loop with BYOK streaming.
- Bind a first peer network via `links.json` so the watchdog can be called from
  another agentic site, and answer peers in return.
- More origins (additional tokens/chains) behind the same published network.

## License

Apache License 2.0 — see `LICENSE`. The specification this project implements is
© Cognizant AI Lab, Apache-2.0.

---

### Devpost submission checklist

- [x] Public website with `.json` network description + runtime (this folder, once hosted)
- [x] Text description (this README)
- [ ] Public URL (hosting decision pending)
- [ ] Screenshot of the running site
- [ ] Video < 2 minutes, entrant presenting in person (script ready:
      `../../files/naskah-video-open-agentic-web.md`)
