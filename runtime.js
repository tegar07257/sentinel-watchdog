/*
 * Sentinel Watchdog — browser runtime (Week 1)
 *
 * The "runtime" file for this agent site, per the Open Agentic Web Challenge
 * submission requirements and the Worldwide Agentic Web MVP Profile 0.2
 * (Cognizant AI Lab). It loads agent-manifest.json, resolves and validates the
 * published network definition (sentinel_watchdog.network.json), registers the
 * site's read-only site actions, and runs the front agent with bounded steps.
 *
 * The network's Week 1 execution path is deterministic: chain_reader calls
 * public JSON-RPC endpoints (no wallet, no keys) and interpreter applies the
 * published classification rules. An LLM is optional narration only.
 * See runtime.json for the exact conformance subset and assumptions.
 */
(function (global) {
  "use strict";

  /* Pair #3 (hardened redeploy, 2026-11-15): the two contracts live at
   * DIFFERENT addresses — CONTRACT is the Sentinel on Lasna, CALLBACK is
   * SentinelCallback on Base Sepolia. (Pair #1 shared one address.) */
  var CONTRACT = "0xE86A5E5D1bCC4c1bF68aecAA8D3763BF475e8AE0";
  var CALLBACK = "0x61D4b1F2bC65d578B00CC9CF64a83EA191Cd6245";

  var CHAINS = {
    lasna: {
      name: "Lasna (Reactive Network testnet)",
      chainId: 5318007,
      rpc: "https://lasna-rpc.rnk.dev",
      role: "Sentinel (reactive contract)"
    },
    baseSepolia: {
      name: "Base Sepolia",
      chainId: 84532,
      rpc: "https://sepolia.base.org",
      explorer: "https://sepolia.basescan.org/address/" + CALLBACK,
      role: "SentinelCallback (alert receiver)"
    }
  };

  /* Function selectors (first 4 bytes of keccak256 of the signature). */
  var SEL = {
    largeSellCount: "0xc0831e63",
    lastLargeSellAmount: "0xefe18b5a",
    lastLargeSellBlock: "0xf9890b09",
    lastCronBlock: "0x03ac52b3",
    threshold: "0x42cde4e8",
    lastAlertCount: "0xbae0faf7",
    lastAlertAmount: "0x84806545",
    lastAlertBlock: "0xc8ebcc42"
  };

  /*
   * Last verified on-chain snapshot, read via eth_call against the public
   * RPC endpoints above on 2026-11-15 (~12:25 WIB, Asia/Jakarta). Used ONLY as
   * a labelled fallback when live reads fail — never presented as live data.
   */
  var VERIFIED_SNAPSHOT = {
    asOf: "2026-11-15 (~12:25 WIB)",
    source: "cast call against the public RPC endpoints listed in this file",
    lasna: {
      largeSellCount: "18",
      lastLargeSellAmountWei: "274850660950339408",
      lastLargeSellBlock: "58971012",
      lastCronBlock: "0",
      thresholdWei: "50000000000000000",
      balanceWei: "5094100000000000"
    },
    baseSepolia: {
      lastAlertCount: "18",
      lastAlertAmountWei: "274850660950339408",
      lastAlertBlock: "58971017"
    }
  };

  var RPC_TIMEOUT_MS = 10000;
  var MAX_STEPS = 8;

  function rpc(url, method, params) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, RPC_TIMEOUT_MS);
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("RPC HTTP " + res.status);
      return res.json();
    }).then(function (body) {
      if (body.error) throw new Error("RPC error: " + (body.error.message || body.error.code));
      return body.result;
    });
  }

  function ethCall(url, addr, selector) {
    return rpc(url, "eth_call", [{ to: addr, data: selector }, "latest"])
      .then(function (hex) { return BigInt(hex).toString(10); });
  }

  function ethBalance(url) {
    return rpc(url, "eth_getBalance", [CONTRACT, "latest"])
      .then(function (hex) { return BigInt(hex).toString(10); });
  }

  /* Format a wei integer string as a trimmed ETH decimal string. */
  function formatEth(weiStr) {
    var wei = BigInt(weiStr);
    var whole = wei / 1000000000000000000n;
    var frac = (wei % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
    return frac ? whole.toString() + "." + frac : whole.toString();
  }

  /* ---- Site actions (registered with the runtime; read-only) ---- */

  function readSentinelState() {
    var url = CHAINS.lasna.rpc;
    return Promise.all([
      ethCall(url, CONTRACT, SEL.largeSellCount),
      ethCall(url, CONTRACT, SEL.lastLargeSellAmount),
      ethCall(url, CONTRACT, SEL.lastLargeSellBlock),
      ethCall(url, CONTRACT, SEL.lastCronBlock),
      ethCall(url, CONTRACT, SEL.threshold),
      ethBalance(url)
    ]).then(function (v) {
      return {
        largeSellCount: v[0],
        lastLargeSellAmountWei: v[1],
        lastLargeSellBlock: v[2],
        lastCronBlock: v[3],
        thresholdWei: v[4],
        balanceWei: v[5]
      };
    });
  }

  function readCallbackState() {
    var url = CHAINS.baseSepolia.rpc;
    return Promise.all([
      ethCall(url, CALLBACK, SEL.lastAlertCount),
      ethCall(url, CALLBACK, SEL.lastAlertAmount),
      ethCall(url, CALLBACK, SEL.lastAlertBlock)
    ]).then(function (v) {
      return { lastAlertCount: v[0], lastAlertAmountWei: v[1], lastAlertBlock: v[2] };
    });
  }

  var SITE_ACTIONS = {
    read_sentinel_state: readSentinelState,
    read_callback_state: readCallbackState
  };

  /* ---- Interpreter: the published deterministic classification rules ---- */

  function classify(lasna, base) {
    var count = BigInt(lasna.largeSellCount);
    var alerts = BigInt(base.lastAlertCount);
    var amount = BigInt(lasna.lastLargeSellAmountWei);
    var threshold = BigInt(lasna.thresholdWei);
    var ratio = threshold > 0n ? Number((amount * 100n) / threshold) / 100 : 0;
    var verdict;
    if (count === 0n) verdict = "QUIET";
    else if (count >= 3n) verdict = "DUMP_CASCADE";
    else if (ratio >= 50) verdict = "LARGE MOVE";
    else if (ratio >= 10) verdict = "ELEVATED";
    else verdict = "NOISE";
    return {
      verdict: verdict,
      ratioToThreshold: ratio,
      loopIntegrity: alerts === count,
      flagged: lasna.largeSellCount,
      alerted: base.lastAlertCount
    };
  }

  function describeVerdict(v) {
    switch (v) {
      case "QUIET": return "no above-threshold transfer has been flagged yet";
      case "NOISE": return "a transfer barely above the threshold was flagged";
      case "ELEVATED": return "an above-threshold transfer worth watching was flagged";
      case "LARGE MOVE": return "a single transfer far above the threshold was flagged";
      case "DUMP_CASCADE": return "repeated large transfers were flagged — a possible dump cascade";
      default: return v;
    }
  }

  function composeAnswer(state, cls) {
    var l = state.lasna, b = state.baseSepolia;
    var lines = [];
    lines.push("Verdict: " + cls.verdict + " — " + describeVerdict(cls.verdict) + ".");
    lines.push(
      "On Lasna, the Sentinel has flagged " + l.largeSellCount +
      " large WETH transfer(s) on Base Sepolia. The latest was " +
      formatEth(l.lastLargeSellAmountWei) + " ETH (about " + cls.ratioToThreshold +
      "x the " + formatEth(l.thresholdWei) + " ETH threshold), at Base Sepolia block " +
      l.lastLargeSellBlock + "."
    );
    lines.push(
      "On Base Sepolia, SentinelCallback has received " + b.lastAlertCount +
      " alert(s); the latest alert carried " + formatEth(b.lastAlertAmountWei) +
      " ETH at block " + b.lastAlertBlock + ". Loop integrity: " +
      (cls.loopIntegrity
        ? "OK — every flagged transfer produced a cross-chain alert."
        : "MISMATCH — flagged count and alert count differ; see the project README's open-issue note.")
    );
    lines.push(
      state.live
        ? "Data source: live public JSON-RPC read, just now."
        : "Data source: last verified snapshot (" + VERIFIED_SNAPSHOT.asOf + ") — the live RPC read failed, so treat these numbers as the latest confirmed state, not live data."
    );
    return lines.join("\n");
  }

  /* ---- Network loading and validation (spec section 3.1/3.3) ---- */

  function validateNetwork(network, frontName) {
    var agents = (network && network.tools) || [];
    var names = {};
    agents.forEach(function (a) {
      if (!a.name) throw new Error("Agent without a name in network definition");
      if (names[a.name]) throw new Error("Duplicate agent name: " + a.name);
      names[a.name] = a;
    });
    if (!names[frontName]) throw new Error("Front agent not found in network: " + frontName);
    agents.forEach(function (a) {
      (a.tools || []).forEach(function (t) {
        if (typeof t === "string" && !names[t]) {
          throw new Error("Agent " + a.name + " references unknown agent: " + t);
        }
      });
    });
    return names;
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Fetch failed (" + res.status + "): " + url);
      return res.json();
    });
  }

  /*
   * boot({ base }) — base is the folder URL that holds agent-manifest.json.
   * Returns a handle { manifest, network, agents, refresh, run }.
   * refresh() reads live on-chain state (falling back to the snapshot).
   * run(question, onTrace) executes the front agent with bounded steps and
   * resolves to { answer, state, classification, trace }.
   */
  function boot(options) {
    options = options || {};
    var base = options.base || ".";
    var manifestUrl = base.replace(/\/?$/, "/") + "agent-manifest.json";
    var handle = { manifest: null, network: null, agents: null, state: null };

    handle.refresh = function () {
      return Promise.all([readSentinelState(), readCallbackState()])
        .then(function (v) {
          handle.state = { live: true, lasna: v[0], baseSepolia: v[1] };
          return handle.state;
        })
        .catch(function () {
          handle.state = {
            live: false,
            lasna: VERIFIED_SNAPSHOT.lasna,
            baseSepolia: VERIFIED_SNAPSHOT.baseSepolia
          };
          return handle.state;
        });
    };

    handle.run = function (question, onTrace) {
      var trace = [];
      var steps = 0;
      function step(text) {
        steps += 1;
        if (steps > MAX_STEPS) throw new Error("Execution bound exceeded (" + MAX_STEPS + " steps)");
        trace.push(text);
        if (typeof onTrace === "function") onTrace(text);
      }
      step("front agent sentinel_watchdog received: " + (question || "(status check)"));
      step("sentinel_watchdog -> chain_reader: read on-chain state");
      return handle.refresh().then(function (state) {
        step("chain_reader: read_sentinel_state + read_callback_state " +
          (state.live ? "(live RPC)" : "(RPC failed — verified snapshot)"));
        var cls = classify(state.lasna, state.baseSepolia);
        step("sentinel_watchdog -> interpreter: classify");
        step("interpreter: verdict " + cls.verdict + " (" + cls.ratioToThreshold + "x threshold)");
        var answer = composeAnswer(state, cls);
        step("sentinel_watchdog: answer composed from on-chain values only");
        return { answer: answer, state: state, classification: cls, trace: trace };
      });
    };

    return fetchJson(manifestUrl).then(function (manifest) {
      handle.manifest = manifest;
      var entry = (manifest.networks || [])[0];
      if (!entry) throw new Error("Manifest publishes no network");
      var networkUrl = new URL(entry.hocon, new URL(manifestUrl, global.location.href)).href;
      return fetchJson(networkUrl).then(function (network) {
        handle.network = network;
        handle.agents = validateNetwork(network, entry.front_man);
        return handle;
      });
    });
  }

  global.SentinelRuntime = {
    boot: boot,
    classify: classify,
    formatEth: formatEth,
    CHAINS: CHAINS,
    CONTRACT: CONTRACT,
    CALLBACK: CALLBACK,
    VERIFIED_SNAPSHOT: VERIFIED_SNAPSHOT
  };
})(window);
