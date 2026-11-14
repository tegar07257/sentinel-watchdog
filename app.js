/* Sentinel Watchdog — page logic. Boots runtime.js, renders live state,
 * the agent list from the published network definition, the interaction
 * panel, and the optional BYOK settings. No build step, no dependencies. */
(function () {
  "use strict";

  var RT = window.SentinelRuntime;
  var handle = null;
  var BYOK_KEY = "sentinel_watchdog_byok";

  function $(id) { return document.getElementById(id); }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function renderState(state) {
    var l = state.lasna, b = state.baseSepolia;
    setText("lv-count", l.largeSellCount);
    setText("lv-amount", RT.formatEth(l.lastLargeSellAmountWei) + " ETH");
    setText("lv-block", l.lastLargeSellBlock);
    setText("lv-threshold", RT.formatEth(l.thresholdWei) + " ETH");
    setText("lv-balance", RT.formatEth(l.balanceWei) + " lREACT");
    setText("lv-cron", l.lastCronBlock);
    setText("cb-count", b.lastAlertCount);
    setText("cb-amount", RT.formatEth(b.lastAlertAmountWei) + " ETH");
    setText("cb-block", b.lastAlertBlock);
    var cls = RT.classify(l, b);
    setText("verdict", cls.verdict);
    var src = $("state-source");
    if (src) {
      src.textContent = state.live
        ? "Live read via public JSON-RPC just now. Counts and amounts come straight from the contracts — refresh any time."
        : "Live RPC read failed, so this panel shows the last verified snapshot (" +
          RT.VERIFIED_SNAPSHOT.asOf + "), read with cast against the same public endpoints. Treat it as the latest confirmed state, not live data.";
      src.className = state.live ? "source live" : "source snapshot";
    }
  }

  function renderAgents(network) {
    var list = $("agents-list");
    if (!list || !network) return;
    list.innerHTML = "";
    (network.tools || []).forEach(function (agent) {
      var card = document.createElement("article");
      card.className = "agent-card";
      var title = document.createElement("h3");
      title.textContent = agent.name +
        (network.metadata && network.metadata.front_agent === agent.name ? " — front agent" : "");
      var desc = document.createElement("p");
      desc.textContent = (agent.function && agent.function.description) || "";
      var calls = document.createElement("p");
      calls.className = "agent-calls";
      var targets = (agent.tools || []).slice();
      (agent.site_actions || []).forEach(function (a) { targets.push("site action: " + a.name); });
      calls.textContent = targets.length ? "Can call: " + targets.join(", ") : "Can call: — (leaf agent)";
      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(calls);
      list.appendChild(card);
    });
  }

  function addTrace(text) {
    var ol = $("trace");
    if (!ol) return;
    var li = document.createElement("li");
    li.textContent = text;
    ol.appendChild(li);
  }

  function runQuestion(question) {
    var answerEl = $("answer");
    var ol = $("trace");
    if (ol) ol.innerHTML = "";
    if (answerEl) answerEl.textContent = "Running the network…";
    if (!handle) {
      if (answerEl) answerEl.textContent = "The runtime is still loading the network definition. Try again in a moment.";
      return;
    }
    handle.run(question, addTrace).then(function (result) {
      renderState(result.state);
      if (answerEl) answerEl.textContent = result.answer;
    }).catch(function (err) {
      if (answerEl) answerEl.textContent = "Run failed: " + err.message;
    });
  }

  function loadByok() {
    try {
      var raw = localStorage.getItem(BYOK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function renderByokStatus() {
    var profile = loadByok();
    setText("byok-status", profile
      ? "Saved in this browser only: " + (profile.model || "(no model)") + " via " + (profile.baseUrl || "(no URL)") +
        ". The deterministic watchdog path does not use it yet; it is reserved for optional LLM narration."
      : "No BYOK profile saved. The watchdog works fully without one.");
  }

  function init() {
    setText("contract-address", RT.CONTRACT);
    var explorer = $("explorer-link");
    if (explorer) explorer.href = RT.CHAINS.baseSepolia.explorer;

    RT.boot({ base: "." }).then(function (h) {
      handle = h;
      renderAgents(h.network);
      return h.refresh();
    }).then(function (state) {
      renderState(state);
    }).catch(function (err) {
      /* Manifest/network failed to load (e.g. opened via file://): still show
       * the verified snapshot so the page remains meaningful. */
      renderState({ live: false, lasna: RT.VERIFIED_SNAPSHOT.lasna, baseSepolia: RT.VERIFIED_SNAPSHOT.baseSepolia });
      var src = $("state-source");
      if (src) src.textContent = "Network files could not be loaded (" + err.message +
        "). Serve this folder over HTTP (see README) for the full runtime. Showing the last verified snapshot (" +
        RT.VERIFIED_SNAPSHOT.asOf + ").";
    });

    var refreshBtn = $("btn-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function () {
      if (!handle) return;
      refreshBtn.disabled = true;
      handle.refresh().then(renderState).finally(function () { refreshBtn.disabled = false; });
    });

    var form = $("ask-form");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var q = $("ask-q").value.trim();
      runQuestion(q || "What is the latest large-transfer status?");
    });

    document.querySelectorAll("[data-q]").forEach(function (btn) {
      btn.addEventListener("click", function () { runQuestion(btn.getAttribute("data-q")); });
    });

    var saveBtn = $("byok-save");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var profile = {
        baseUrl: $("byok-base").value.trim(),
        model: $("byok-model").value.trim(),
        key: $("byok-key").value
      };
      try { localStorage.setItem(BYOK_KEY, JSON.stringify(profile)); } catch (e) { /* storage unavailable */ }
      $("byok-key").value = "";
      renderByokStatus();
    });
    var clearBtn = $("byok-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      try { localStorage.removeItem(BYOK_KEY); } catch (e) { /* ignore */ }
      renderByokStatus();
    });
    var saved = loadByok();
    if (saved) {
      if ($("byok-base")) $("byok-base").value = saved.baseUrl || "";
      if ($("byok-model")) $("byok-model").value = saved.model || "";
    }
    renderByokStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
