const REFRESH_MS = 60 * 1000;
const VIEWS = ["portfolio", "movers", "screener", "opportunity", "watchlist", "pnl", "simulate", "support", "dynamic", "analysis"];
let currentView = "portfolio";
let currentExchange = "BSE";
const INDEX_LABEL = { BSE: "Sensex 30", NSE: "Nifty 50" };

const API = window.STOCK_MONITOR_API_BASE || "";
// Each Cloud Function is its own URL (not paths under one server), mapped here:
const EP = {
  portfolio: `${API}/portfolio`,
  movers: `${API}/movers`,
  screener: `${API}/technical_screener`,
  opportunity: `${API}/opportunity_watch`,
  alerts: `${API}/alerts`,
  status: `${API}/status`,
  watchlist: `${API}/watchlist`,
  details: `${API}/details`,
  sell: `${API}/sell`,
  pnl: `${API}/pnl`,
  simulation: `${API}/simulation`,
  whatif: `${API}/whatif`,
  support: `${API}/support`,
  dynamic: `${API}/dynamic_monitor`,
  analysis: `${API}/analysis`,
};

function withExchange(url) {
  return `${url}?exchange=${currentExchange}`;
}

// ---------- exchange toggle (BSE / NSE) ----------
// Portfolio holds both exchanges together and ignores this; Movers,
// Screener, and Opportunity Watch are exchange-specific and refetch
// whenever this changes.
document.getElementById("exchange-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".exch-btn");
  if (!btn || btn.classList.contains("active")) return;
  currentExchange = btn.dataset.exchange;
  document.querySelectorAll(".exch-btn").forEach(el => el.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("board-title-sub").textContent =
    `${INDEX_LABEL[currentExchange]} \u00b7 live board`;
  loadMovers();
  loadScreener();
  loadOpportunity();
});

// ---------- view switching ----------
function showView(name) {
  if (!VIEWS.includes(name)) return;
  currentView = name;
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelector(`.tab[data-view="${name}"]`).classList.add("active");
}
function nextView() {
  const idx = VIEWS.indexOf(currentView);
  showView(VIEWS[(idx + 1) % VIEWS.length]);
}
document.getElementById("view-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (btn) showView(btn.dataset.view);
});
window.addEventListener("keydown", (e) => {
  // Don't hijack keystrokes while the person is typing in a field (e.g.
  // "RELIANCE" contains an N, "2900" contains a 2 -- both would otherwise
  // trigger view-switch shortcuts) or while the add-holding modal is open.
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (!backdrop.hidden || !watchlistBackdrop.hidden || !detailsBackdrop.hidden || !sellBackdrop.hidden || !simulationBackdrop.hidden) return;
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") nextView();
  if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) showView(VIEWS[parseInt(e.key, 10) - 1]);
  if (e.key === "0") showView(VIEWS[9]);
});
const urlView = new URLSearchParams(window.location.search).get("view");
if (urlView && VIEWS.includes(urlView)) showView(urlView);

// ---------- clock ----------
function tickClock() {
  document.getElementById("board-clock").textContent = new Date().toLocaleTimeString("en-IN", { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

// ---------- helpers ----------
function fmt(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return Number(n).toFixed(decimals);
}
function pctClass(n) { return (n === null || n === undefined) ? "" : (n >= 0 ? "pos" : "neg"); }
function verdictClass(v) { return v === "Good" ? "verdict-good" : v === "Bad" ? "verdict-bad" : "verdict-neutral"; }

async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function connectionWarningIfUnset() {
  if (!API || API.includes("YOUR-PROJECT-ID")) {
    document.getElementById("ticker-track").textContent =
      "Backend not connected yet -- set STOCK_MONITOR_API_BASE in static/config.js";
    return true;
  }
  return false;
}

// ---------- ticker strip ----------
async function loadTicker() {
  if (connectionWarningIfUnset()) return;
  try {
    const movers = await getJSON(withExchange(EP.movers));
    const items = [...movers.gainers, ...movers.losers]
      .filter(m => m && m.pct_change !== null)
      .map(m => {
        const cls = m.pct_change >= 0 ? "up" : "down";
        const arrow = m.pct_change >= 0 ? "\u25B2" : "\u25BC";
        return `<span class="${cls}">${m.ticker.replace(".BO", "")} ${arrow} ${fmt(m.pct_change)}%</span>`;
      });
    document.getElementById("ticker-track").innerHTML = items.join("&nbsp;&nbsp;&nbsp;&bull;&nbsp;&nbsp;&nbsp;") || "No data yet";
  } catch (e) {
    document.getElementById("ticker-track").textContent = "Ticker unavailable";
  }
}

// ---------- portfolio ----------
// ---------- Dynamic Monitor checkbox (shared across every table) ----------
let dynamicMonitorSet = new Set();

async function refreshDynamicMonitorSet() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  try {
    const tickers = await getJSON(EP.dynamic);
    dynamicMonitorSet = new Set(tickers);
  } catch (err) { /* leave set as-is on failure */ }
}

function watchCheckboxHtml(ticker) {
  const checked = dynamicMonitorSet.has(ticker) ? "checked" : "";
  return `<td><input type="checkbox" class="dyn-checkbox" data-ticker="${ticker}" ${checked}></td>`;
}

function wireWatchCheckboxes(container) {
  container.querySelectorAll(".dyn-checkbox").forEach(cb => {
    cb.addEventListener("change", async () => {
      const ticker = cb.dataset.ticker;
      if (cb.checked) {
        dynamicMonitorSet.add(ticker);
        await fetch(`${EP.dynamic}/${encodeURIComponent(ticker)}`, { method: "POST" });
      } else {
        dynamicMonitorSet.delete(ticker);
        await fetch(`${EP.dynamic}/${encodeURIComponent(ticker)}`, { method: "DELETE" });
      }
    });
  });
}

async function loadPortfolio() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const rows = await getJSON(EP.portfolio);
  const tbody = document.querySelector("#portfolio-table tbody");
  const emptyNote = document.getElementById("portfolio-empty");
  tbody.innerHTML = "";
  emptyNote.hidden = rows.length > 0;
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      ${watchCheckboxHtml(r.ticker)}
      <td>${r.ticker}</td>
      <td>${fmt(r.quantity, 0)}</td>
      <td>${fmt(r.buy_price)}</td>
      <td>${fmt(r.current_price)}</td>
      <td class="${pctClass(r.pnl)}">${fmt(r.pnl)}</td>
      <td class="${pctClass(r.pnl_pct)}">${fmt(r.pnl_pct)}%</td>
      <td><button class="row-remove" data-ticker="${r.ticker}">remove</button></td>
      <td><button class="row-details" data-ticker="${r.ticker}">Details</button></td>
      <td><button class="row-edit" data-ticker="${r.ticker}" data-quantity="${r.quantity}" data-buy-price="${r.buy_price}">Edit</button></td>
      <td><button class="row-sell" data-ticker="${r.ticker}" data-max-qty="${r.quantity}">Sell</button></td>`;
    tbody.appendChild(tr);
  }
  wireWatchCheckboxes(tbody);
  tbody.querySelectorAll(".row-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch(`${EP.portfolio}/${encodeURIComponent(btn.dataset.ticker)}`, { method: "DELETE" });
      loadPortfolio();
    });
  });
  tbody.querySelectorAll(".row-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      setHoldingModalMode("edit", {
        ticker: btn.dataset.ticker,
        quantity: btn.dataset.quantity,
        buy_price: btn.dataset.buyPrice,
      });
      backdrop.hidden = false;
    });
  });
  tbody.querySelectorAll(".row-sell").forEach(btn => {
    btn.addEventListener("click", () => {
      sellTargetTicker = btn.dataset.ticker;
      document.getElementById("sell-modal-ticker").textContent = btn.dataset.ticker;
      sellForm.querySelector('[name="quantity"]').max = btn.dataset.maxQty;
      sellForm.querySelector('[name="sell_date"]').value = new Date().toISOString().slice(0, 10);
      sellBackdrop.hidden = false;
    });
  });
  wireDetailsButtons(tbody);
}

// ---------- movers ----------
async function loadMovers() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const movers = await getJSON(withExchange(EP.movers));
  const gBody = document.getElementById("gainers-body");
  const lBody = document.getElementById("losers-body");
  gBody.innerHTML = movers.gainers.map(m => `
    <tr>${watchCheckboxHtml(m.ticker)}<td>${m.ticker}</td><td>${fmt(m.price)}</td><td class="pos">${fmt(m.pct_change)}%</td></tr>`).join("");
  lBody.innerHTML = movers.losers.map(m => `
    <tr>${watchCheckboxHtml(m.ticker)}<td>${m.ticker}</td><td>${fmt(m.price)}</td><td class="neg">${fmt(m.pct_change)}%</td></tr>`).join("");
  wireWatchCheckboxes(gBody);
  wireWatchCheckboxes(lBody);
}

// ---------- screener ----------
function macdLabel(v) { return v === 1 ? "Bullish" : v === -1 ? "Bearish" : "Flat"; }
function volLabel(v) { return v === 1 ? "Spike \u2191" : v === -1 ? "Spike \u2193" : "Normal"; }

async function loadScreener() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const rows = await getJSON(withExchange(EP.screener));
  const tbody = document.querySelector("#screener-table tbody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      ${watchCheckboxHtml(r.ticker)}
      <td>${r.ticker}</td><td>${r.trend}</td><td>${fmt(r.rsi_value)}</td>
      <td>${macdLabel(r.macd_signal)}</td><td>${volLabel(r.volume_signal)}</td>
      <td>${r.score}/4</td><td class="${verdictClass(r.verdict)}">${r.verdict}</td>
      <td><button class="row-details" data-ticker="${r.ticker}">Details</button></td>
    </tr>`).join("");
  wireWatchCheckboxes(tbody);
  wireDetailsButtons(tbody);
}

// ---------- opportunity ----------
async function loadOpportunity() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const data = await getJSON(withExchange(EP.opportunity));
  const tbody = document.querySelector("#opportunity-table tbody");
  const emptyNote = document.getElementById("opportunity-empty");
  tbody.innerHTML = data.candidates.map(o => `
    <tr>
      ${watchCheckboxHtml(o.ticker)}
      <td>${o.ticker}</td><td>${o.flagged_date}</td>
      <td class="neg">${fmt(o.price_return_pct)}%</td><td>${o.tech_score}/4</td>
      <td class="${verdictClass(o.verdict)}">${o.verdict}</td>
    </tr>`).join("");
  wireWatchCheckboxes(tbody);
  emptyNote.hidden = data.candidates.length > 0;
  const status = data.scan_status;
  document.getElementById("scan-status").textContent = status
    ? `Last scan: ${status.status} \u2014 ${status.detail || ""} (${new Date(status.last_run).toLocaleString("en-IN")})`
    : "No scan run yet";
}

// ---------- watchlist ----------
async function loadWatchlist() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const items = await getJSON(EP.watchlist);
  const tbody = document.querySelector("#watchlist-table tbody");
  const emptyNote = document.getElementById("watchlist-empty");
  tbody.innerHTML = items.map(w => `
    <tr>
      ${watchCheckboxHtml(w.ticker)}
      <td>${w.ticker}</td>
      <td>${fmt(w.price)}</td>
      <td class="${pctClass(w.pct_change)}">${fmt(w.pct_change)}%</td>
      <td><button class="row-remove" data-ticker="${w.ticker}">remove</button></td>
      <td><button class="row-details" data-ticker="${w.ticker}">Details</button></td>
    </tr>`).join("");
  emptyNote.hidden = items.length > 0;
  wireWatchCheckboxes(tbody);
  tbody.querySelectorAll(".row-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch(`${EP.watchlist}/${encodeURIComponent(btn.dataset.ticker)}`, { method: "DELETE" });
      loadWatchlist();
    });
  });
  wireDetailsButtons(tbody);
}

// ---------- P&L ----------
async function loadPnl() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const data = await getJSON(EP.pnl);
  document.getElementById("pnl-realized").textContent = fmt(data.realized_total);
  document.getElementById("pnl-realized").className = "details-value " + pctClass(data.realized_total);
  document.getElementById("pnl-unrealized").textContent = fmt(data.unrealized_total);
  document.getElementById("pnl-unrealized").className = "details-value " + pctClass(data.unrealized_total);
  document.getElementById("pnl-net").textContent = fmt(data.net_total);
  document.getElementById("pnl-net").className = "details-value " + pctClass(data.net_total);

  const tbody = document.querySelector("#pnl-table tbody");
  const emptyNote = document.getElementById("pnl-empty");
  tbody.innerHTML = data.sold_transactions.map(t => `
    <tr>
      <td>${t.ticker}</td><td>${t.sell_date}</td><td>${fmt(t.quantity, 0)}</td>
      <td>${fmt(t.buy_price)}</td><td>${fmt(t.sell_price)}</td>
      <td class="${pctClass(t.profit)}">${fmt(t.profit)}</td>
      <td class="${pctClass(t.profit_pct)}">${fmt(t.profit_pct)}%</td>
    </tr>`).join("");
  emptyNote.hidden = data.sold_transactions.length > 0;
}

// ---------- simulate: forward ----------
async function loadSimulation() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const items = await getJSON(EP.simulation);
  const tbody = document.querySelector("#simulation-table tbody");
  const emptyNote = document.getElementById("simulation-empty");
  tbody.innerHTML = items.map(s => `
    <tr>
      ${watchCheckboxHtml(s.ticker)}
      <td>${s.ticker}</td><td>${fmt(s.quantity, 0)}</td><td>${fmt(s.buy_price)}</td>
      <td>${fmt(s.current_price)}</td>
      <td class="${pctClass(s.pnl)}">${fmt(s.pnl)}</td>
      <td class="${pctClass(s.pnl_pct)}">${fmt(s.pnl_pct)}%</td>
      <td><button class="row-remove" data-ticker="${s.ticker}">remove</button></td>
    </tr>`).join("");
  emptyNote.hidden = items.length > 0;
  wireWatchCheckboxes(tbody);
  tbody.querySelectorAll(".row-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch(`${EP.simulation}/${encodeURIComponent(btn.dataset.ticker)}`, { method: "DELETE" });
      loadSimulation();
    });
  });
}

// ---------- simulate: backward (what-if) ----------
async function loadWhatifLog() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const items = await getJSON(EP.whatif);
  const tbody = document.querySelector("#whatif-table tbody");
  const emptyNote = document.getElementById("whatif-empty");
  tbody.innerHTML = items.map(w => `
    <tr>
      <td>${w.ticker}</td><td>${fmt(w.quantity, 0)}</td><td>${w.as_of_date}</td>
      <td>${fmt(w.historical_price)}</td><td>${fmt(w.current_price)}</td>
      <td class="${pctClass(w.profit)}">${fmt(w.profit)}</td>
      <td class="${pctClass(w.profit_pct)}">${fmt(w.profit_pct)}%</td>
    </tr>`).join("");
  emptyNote.hidden = items.length > 0;
}

// ---------- support screen ----------
async function loadSupport() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const items = await getJSON(EP.support);
  const tbody = document.querySelector("#support-table tbody");
  const emptyNote = document.getElementById("support-empty");
  tbody.innerHTML = items.map(s => `
    <tr>
      ${watchCheckboxHtml(s.ticker)}
      <td>${s.ticker}</td>
      <td>${fmt(s.current_price)}</td>
      <td class="${pctClass(s.decline_pct)}">${s.decline_pct !== null ? fmt(s.decline_pct) + '%' : '--'}</td>
      <td>${s.support_level !== null ? fmt(s.support_level) : '--'}</td>
      <td>${s.proximity_pct !== null ? fmt(s.proximity_pct) + '%' : '--'}</td>
      <td>${s.support_touches}</td>
      <td class="${s.near_support ? 'verdict-good' : 'verdict-neutral'}">${s.near_support ? 'Near support' : '--'}</td>
    </tr>`).join("");
  emptyNote.hidden = items.length > 0;
  wireWatchCheckboxes(tbody);
  loadDynamicZone();
}

// ---------- sparkline (mini SVG, no axes) ----------
function sparklineSvg(closes, w = 100, h = 32) {
  const vals = (closes || []).filter(c => c !== null && c !== undefined);
  if (vals.length < 2) return '<span class="details-label">no data</span>';
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const points = vals.map((c, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((c - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? "var(--gain)" : "var(--loss)";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}

function dynCardHtml(d) {
  return `
    <div class="dyn-card">
      <div class="dyn-card-ticker">${d.ticker}</div>
      <div class="dyn-card-price ${pctClass(d.pct_change)}">${fmt(d.price)} (${fmt(d.pct_change)}%)</div>
      <div class="dyn-card-meta"><span>${d.trend || '--'}</span><span class="${verdictClass(d.verdict)}">${d.verdict || '--'}</span></div>
      ${sparklineSvg(d.sparkline)}
    </div>`;
}

// ---------- dynamic zone (small pane, Support tab) ----------
async function loadDynamicZone() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const items = await getJSON(`${EP.dynamic}/trend`);
  const container = document.getElementById("dynamic-zone-cards");
  const emptyNote = document.getElementById("dynamic-zone-empty");
  container.innerHTML = items.map(dynCardHtml).join("");
  emptyNote.hidden = items.length > 0;
}

// ---------- dynamic monitor (full-screen tab, paginated + autoscroll) ----------
let dynamicFullscreenItems = [];
let dynamicFullscreenPage = 0;
let dynamicAutoscrollTimer = null;

function dynamicCardsPerPage() {
  const container = document.getElementById("dynamic-fullscreen-cards");
  const cardWidth = 236, cardHeight = 130; // approx incl. gap
  const cols = Math.max(1, Math.floor(container.clientWidth / cardWidth));
  const rows = Math.max(1, Math.floor((window.innerHeight - 260) / cardHeight));
  return Math.max(cols * rows, 3);
}

function renderDynamicFullscreenPage() {
  const container = document.getElementById("dynamic-fullscreen-cards");
  const emptyNote = document.getElementById("dynamic-fullscreen-empty");
  if (dynamicFullscreenItems.length === 0) {
    container.innerHTML = "";
    emptyNote.hidden = false;
    document.getElementById("dynamic-page-indicator").textContent = "Page 0/0";
    return;
  }
  emptyNote.hidden = true;
  const perPage = dynamicCardsPerPage();
  const totalPages = Math.max(1, Math.ceil(dynamicFullscreenItems.length / perPage));
  if (dynamicFullscreenPage >= totalPages) dynamicFullscreenPage = 0;
  const start = dynamicFullscreenPage * perPage;
  const pageItems = dynamicFullscreenItems.slice(start, start + perPage);
  container.innerHTML = pageItems.map(dynCardHtml).join("");
  document.getElementById("dynamic-page-indicator").textContent = `Page ${dynamicFullscreenPage + 1}/${totalPages}`;
}

async function loadDynamicFullscreen() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  dynamicFullscreenItems = await getJSON(`${EP.dynamic}/trend`);
  renderDynamicFullscreenPage();
}

function setupAutoscroll() {
  const toggle = document.getElementById("autoscroll-toggle");
  const intervalInput = document.getElementById("autoscroll-interval");
  function restart() {
    if (dynamicAutoscrollTimer) clearInterval(dynamicAutoscrollTimer);
    if (!toggle.checked) return;
    const seconds = Math.max(3, parseInt(intervalInput.value, 10) || 15);
    dynamicAutoscrollTimer = setInterval(() => {
      const perPage = dynamicCardsPerPage();
      const totalPages = Math.max(1, Math.ceil(dynamicFullscreenItems.length / perPage));
      dynamicFullscreenPage = (dynamicFullscreenPage + 1) % totalPages;
      renderDynamicFullscreenPage();
    }, seconds * 1000);
  }
  toggle.addEventListener("change", restart);
  intervalInput.addEventListener("change", restart);
  document.getElementById("dynamic-prev").addEventListener("click", () => {
    const perPage = dynamicCardsPerPage();
    const totalPages = Math.max(1, Math.ceil(dynamicFullscreenItems.length / perPage));
    dynamicFullscreenPage = (dynamicFullscreenPage - 1 + totalPages) % totalPages;
    renderDynamicFullscreenPage();
  });
  document.getElementById("dynamic-next").addEventListener("click", () => {
    const perPage = dynamicCardsPerPage();
    const totalPages = Math.max(1, Math.ceil(dynamicFullscreenItems.length / perPage));
    dynamicFullscreenPage = (dynamicFullscreenPage + 1) % totalPages;
    renderDynamicFullscreenPage();
  });
}

// ---------- portfolio analysis ----------
function allocationBarsHtml(rows, labelKey) {
  if (rows.length === 0) return '<p class="empty-note">Nothing to show yet.</p>';
  return rows.map(r => `
    <div class="allocation-row">
      <span class="alloc-label">${r[labelKey]}</span>
      <span class="alloc-bar-track"><span class="alloc-bar-fill" style="width:${r.pct}%"></span></span>
      <span class="alloc-pct">${fmt(r.pct)}%</span>
    </div>`).join("");
}

async function loadAnalysis() {
  if (!API || API.includes("YOUR-PROJECT-ID")) return;
  const data = await getJSON(EP.analysis);
  document.getElementById("analysis-networth").textContent = fmt(data.net_worth);
  document.getElementById("analysis-by-stock").innerHTML = allocationBarsHtml(data.by_stock, "ticker");
  document.getElementById("analysis-by-exchange").innerHTML = allocationBarsHtml(data.by_exchange, "exchange");

  const chartWrap = document.getElementById("analysis-networth-chart");
  const history = data.net_worth_history || [];
  if (history.length < 2) {
    chartWrap.innerHTML = '<p class="empty-note">Tracking starts today &mdash; check back as daily snapshots build up.</p>';
  } else {
    renderPriceChart(history.map(h => ({ date: h.date, close: h.total_value })), chartWrap);
  }
}

// ---------- details modal ----------
const detailsBackdrop = document.getElementById("details-modal-backdrop");

function wireDetailsButtons(container) {
  container.querySelectorAll(".row-details").forEach(btn => {
    btn.addEventListener("click", () => openDetails(btn.dataset.ticker));
  });
}

function macdFullLabel(v) { return v === 1 ? "Bullish" : v === -1 ? "Bearish" : "Flat"; }
function volFullLabel(v) { return v === 1 ? "Spike \u2191 (bullish)" : v === -1 ? "Spike \u2193 (bearish)" : "Normal"; }
function smaFullLabel(v) { return v === 1 ? "Uptrend (price > SMA50 > SMA200)" : v === -1 ? "Downtrend (price < SMA50 < SMA200)" : "Sideways / mixed"; }

async function openDetails(ticker) {
  detailsBackdrop.hidden = false;
  document.getElementById("details-ticker").textContent = ticker;
  document.getElementById("details-price").textContent = "\u2026";
  document.getElementById("details-pct").textContent = "";
  document.getElementById("details-verdict").textContent = "";
  ["details-trend", "details-rsi", "details-macd", "details-vol", "details-score"].forEach(id => {
    document.getElementById(id).textContent = "\u2026";
  });
  document.getElementById("details-chart-wrap").innerHTML = '<p class="empty-note">Loading&hellip;</p>';

  try {
    const data = await getJSON(`${EP.details}?ticker=${encodeURIComponent(ticker)}`);
    const q = data.quote;
    const t = data.technical;

    document.getElementById("details-price").textContent = q ? fmt(q.price) : "--";
    const pctEl = document.getElementById("details-pct");
    pctEl.textContent = q ? `${fmt(q.pct_change)}%` : "--";
    pctEl.className = "details-value " + (q ? pctClass(q.pct_change) : "");

    const verdictEl = document.getElementById("details-verdict");
    verdictEl.textContent = t ? t.verdict : "No data yet";
    verdictEl.className = "details-value " + (t ? verdictClass(t.verdict) : "");

    document.getElementById("details-trend").textContent = t ? smaFullLabel(t.sma_signal) : "--";
    document.getElementById("details-rsi").textContent = t && t.rsi_value !== null
      ? `${fmt(t.rsi_value)} (${t.rsi_signal === 1 ? "oversold" : t.rsi_signal === -1 ? "overbought" : "neutral range"})`
      : "--";
    document.getElementById("details-macd").textContent = t ? macdFullLabel(t.macd_signal) : "--";
    document.getElementById("details-vol").textContent = t ? volFullLabel(t.volume_signal) : "--";
    document.getElementById("details-score").textContent = t ? `${t.score}/4 bullish signals` : "--";

    renderPriceChart(data.history || []);
  } catch (err) {
    document.getElementById("details-chart-wrap").innerHTML =
      '<p class="empty-note">Could not load details for this ticker.</p>';
  }
}

function renderPriceChart(history, wrap) {
  wrap = wrap || document.getElementById("details-chart-wrap");
  const closes = history.map(h => h.close).filter(c => c !== null && c !== undefined);
  if (closes.length < 2) {
    wrap.innerHTML = '<p class="empty-note">Not enough history yet to chart.</p>';
    return;
  }
  const w = 400, h = 160, pad = 6;
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = (max - min) || 1;
  const points = closes.map((c, i) => {
    const x = pad + (i / (closes.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (c - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  const lineColor = up ? "var(--gain)" : "var(--loss)";
  wrap.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="details-chart-range">
      <span>${history[0].date}</span><span>${history[history.length - 1].date}</span>
    </div>`;
}

document.getElementById("details-modal-close").addEventListener("click", () => { detailsBackdrop.hidden = true; });
detailsBackdrop.addEventListener("click", (e) => { if (e.target === detailsBackdrop) detailsBackdrop.hidden = true; });

// ---------- sell modal ----------
const sellBackdrop = document.getElementById("sell-modal-backdrop");
const sellForm = document.getElementById("sell-form");
let sellTargetTicker = null;
document.getElementById("sell-modal-cancel").addEventListener("click", () => { sellBackdrop.hidden = true; });
sellForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    ticker: sellTargetTicker,
    quantity: parseFloat(fd.get("quantity")),
    sell_price: parseFloat(fd.get("sell_price")),
    sell_date: fd.get("sell_date"),
  };
  try {
    await getJSON(EP.sell, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    sellBackdrop.hidden = true;
    e.target.reset();
    loadPortfolio();
    loadPnl();
  } catch (err) {
    alert("Could not record sale \u2014 check the quantity doesn't exceed what you hold.");
  }
});

// ---------- add simulation (paper trade) modal ----------
const simulationBackdrop = document.getElementById("simulation-modal-backdrop");
document.getElementById("btn-add-simulation").addEventListener("click", () => { simulationBackdrop.hidden = false; });
document.getElementById("simulation-modal-cancel").addEventListener("click", () => { simulationBackdrop.hidden = true; });
document.getElementById("add-simulation-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    ticker: (() => {
      let t = fd.get("ticker").toUpperCase().trim();
      if (t && !t.endsWith(".BO") && !t.endsWith(".NS")) {
        t += currentExchange === "NSE" ? ".NS" : ".BO";
      }
      return t;
    })(),
    quantity: parseFloat(fd.get("quantity")),
    buy_price: parseFloat(fd.get("buy_price")),
    buy_date: fd.get("buy_date") || null,
  };
  try {
    await getJSON(EP.simulation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    simulationBackdrop.hidden = true;
    e.target.reset();
    loadSimulation();
  } catch (err) {
    alert("Could not add paper trade \u2014 check the ticker format (e.g. RELIANCE.BO or RELIANCE.NS)");
  }
});

// ---------- what-if form ----------
document.getElementById("whatif-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    ticker: (() => {
      let t = fd.get("ticker").toUpperCase().trim();
      if (t && !t.endsWith(".BO") && !t.endsWith(".NS")) {
        t += currentExchange === "NSE" ? ".NS" : ".BO";
      }
      return t;
    })(),
    quantity: parseFloat(fd.get("quantity")),
    as_of_date: fd.get("as_of_date"),
  };
  try {
    await getJSON(EP.whatif, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    e.target.reset();
    loadWhatifLog();
  } catch (err) {
    alert("Could not calculate \u2014 check the ticker and date (need stored history on or before that date).");
  }
});

// ---------- add/edit holding modal ----------
const backdrop = document.getElementById("modal-backdrop");
const holdingForm = document.getElementById("add-holding-form");
const holdingTickerInput = holdingForm.querySelector('[name="ticker"]');
const holdingModalTitle = document.getElementById("holding-modal-title");

let currentHoldingModalMode = "add";
const holdingModalNote = document.getElementById("holding-modal-note");

function setHoldingModalMode(mode, data) {
  currentHoldingModalMode = mode;
  if (mode === "edit") {
    holdingModalTitle.textContent = "Edit holding";
    holdingModalNote.hidden = true;
    holdingTickerInput.value = data.ticker;
    holdingTickerInput.readOnly = true;
    holdingForm.querySelector('[name="quantity"]').value = data.quantity;
    holdingForm.querySelector('[name="buy_price"]').value = data.buy_price;
  } else {
    holdingModalTitle.textContent = "Add holding";
    holdingModalNote.hidden = false;
    holdingTickerInput.readOnly = false;
    holdingForm.reset();
  }
}

document.getElementById("btn-add-holding").addEventListener("click", () => {
  setHoldingModalMode("add");
  backdrop.hidden = false;
});
document.getElementById("modal-cancel").addEventListener("click", () => { backdrop.hidden = true; });
document.getElementById("add-holding-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    ticker: (() => {
      let t = fd.get("ticker").toUpperCase().trim();
      if (t && !t.endsWith(".BO") && !t.endsWith(".NS")) {
        t += currentExchange === "NSE" ? ".NS" : ".BO";
      }
      return t;
    })(),
    quantity: parseFloat(fd.get("quantity")),
    buy_price: parseFloat(fd.get("buy_price")),
    mode: currentHoldingModalMode === "edit" ? "set" : "add",
  };
  try {
    await getJSON(EP.portfolio, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    backdrop.hidden = true;
    e.target.reset();
    loadPortfolio();
  } catch (err) {
    alert("Could not add holding \u2014 check the ticker format (e.g. RELIANCE.BO or RELIANCE.NS)");
  }
});

// ---------- add to watchlist modal ----------
const watchlistBackdrop = document.getElementById("watchlist-modal-backdrop");
document.getElementById("btn-add-watchlist").addEventListener("click", () => { watchlistBackdrop.hidden = false; });
document.getElementById("watchlist-modal-cancel").addEventListener("click", () => { watchlistBackdrop.hidden = true; });
document.getElementById("add-watchlist-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    ticker: (() => {
      let t = fd.get("ticker").toUpperCase().trim();
      if (t && !t.endsWith(".BO") && !t.endsWith(".NS")) {
        t += currentExchange === "NSE" ? ".NS" : ".BO";
      }
      return t;
    })(),
  };
  try {
    await getJSON(EP.watchlist, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    watchlistBackdrop.hidden = true;
    e.target.reset();
    loadWatchlist();
  } catch (err) {
    alert("Could not add to watchlist \u2014 check the ticker format (e.g. RELIANCE.BO or RELIANCE.NS)");
  }
});

// ---------- refresh loop ----------
async function refreshAll() {
  await refreshDynamicMonitorSet();
  loadTicker();
  loadPortfolio();
  loadMovers();
  loadScreener();
  loadOpportunity();
  loadWatchlist();
  loadPnl();
  loadSimulation();
  loadWhatifLog();
  loadSupport();
  loadDynamicFullscreen();
  loadAnalysis();
}
setupAutoscroll();
window.addEventListener("resize", () => { if (currentView === "dynamic") renderDynamicFullscreenPage(); });
refreshAll();
setInterval(refreshAll, REFRESH_MS);
