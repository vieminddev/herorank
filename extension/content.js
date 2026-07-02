/**
 * VieRank extension — content script. Overlays VieRank's (honestly-estimated) SEO data on Etsy
 * listing and search pages via a floating panel. All numbers are labeled "Est." — VieRank never
 * pretends an estimate is ground truth (the brand's whole positioning vs. competitors).
 */
(() => {
  const PANEL_ID = "vierank-panel";
  let lastUrl = "";

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => resolve(resp ?? { ok: false, error: "NO_RESPONSE" }));
      } catch {
        resolve({ ok: false, error: "NO_RESPONSE" });
      }
    });
  }

  function detectPage() {
    const url = location.href;
    let m = url.match(/etsy\.com\/listing\/(\d+)/);
    if (m) return { type: "listing", id: m[1] };
    if (/etsy\.com\/search\b/.test(url) || /[?&]q=/.test(url)) {
      const q = new URLSearchParams(location.search).get("q");
      if (q) return { type: "search", q: q.trim() };
    }
    m = url.match(/etsy\.com\/shop\/([^/?#]+)/);
    if (m) return { type: "shop", name: decodeURIComponent(m[1]) };
    return { type: "other" };
  }

  function ensurePanel() {
    let el = document.getElementById(PANEL_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = PANEL_ID;
    el.className = "vrk-panel";
    el.innerHTML = `
      <div class="vrk-head">
        <span class="vrk-brand"><span class="vrk-dot"></span> VieRank</span>
        <button class="vrk-close" title="Hide" aria-label="Hide">×</button>
      </div>
      <div class="vrk-body"></div>`;
    document.body.appendChild(el);
    el.querySelector(".vrk-close").addEventListener("click", () => el.remove());
    return el;
  }

  function row(label, value, est) {
    return `<div class="vrk-row"><span class="vrk-label">${label}</span><span class="vrk-val">${value}${
      est ? ' <span class="vrk-est">Est.</span>' : ""
    }</span></div>`;
  }

  function scoreColor(s) {
    return s >= 70 ? "#1e8e5a" : s >= 40 ? "#b07a00" : "#c0392b";
  }

  function setBody(html) {
    ensurePanel().querySelector(".vrk-body").innerHTML = html;
  }

  function notPaired() {
    setBody(
      `<p class="vrk-muted">Connect the extension to see VieRank data here.</p>
       <p class="vrk-muted vrk-sm">Open the VieRank icon → paste your token from <b>Settings → Browser Extension</b>.</p>`
    );
  }

  async function renderListing(id) {
    setBody(`<p class="vrk-muted">Loading listing SEO…</p>`);
    const r = await send({ type: "listing", id });
    if (r.status === 401 || r.error === "NOT_PAIRED") return notPaired();
    if (r.status === 404) return setBody(`<p class="vrk-muted">This listing isn't on Etsy anymore.</p>`);
    if (!r.ok || !r.body) return setBody(`<p class="vrk-muted">Couldn't load this listing.</p>`);
    const b = r.body;
    const sales = b.estSales != null ? Number(b.estSales).toLocaleString() : "—";
    const views = b.views != null ? Number(b.views).toLocaleString() : "—";
    const conv = b.estConversion != null ? String(b.estConversion) : "—";
    setBody(
      `<div class="vrk-score" style="--c:${scoreColor(b.score)}">
         <div class="vrk-score-num">${b.score}<span>/100</span></div>
         <div class="vrk-score-cap">SEO score <span class="vrk-est">Est.</span></div>
       </div>
       <div class="vrk-sales">
         <div class="vrk-sales-cell"><div class="vrk-sales-num">${sales}</div><div class="vrk-sales-cap">sales/mo <span class="vrk-est">Est.</span></div></div>
         <div class="vrk-sales-cell"><div class="vrk-sales-num">${b.estRevenue ?? "—"}</div><div class="vrk-sales-cap">revenue/mo <span class="vrk-est">Est.</span></div></div>
       </div>
       <div class="vrk-sales">
         <div class="vrk-sales-cell"><div class="vrk-sales-num">${views}</div><div class="vrk-sales-cap">views (lifetime)</div></div>
         <div class="vrk-sales-cell"><div class="vrk-sales-num">${conv}</div><div class="vrk-sales-cap">conversion <span class="vrk-est">Est.</span></div></div>
       </div>
       ${b.price ? row("Price", b.price, false) : ""}
       ${row("Tags", `${b.tagCount}/13`, false)}
       ${row("Favorites", (b.faves ?? 0).toLocaleString(), false)}
       ${row("Reviews", (b.reviews ?? 0).toLocaleString(), false)}
       <a class="vrk-cta" target="_blank" href="${apiBase}/tools/listing-analyzer?listing=${id}">Full analysis →</a>`
    );
  }

  async function renderSearch(q) {
    setBody(`<p class="vrk-muted">Checking "${q}"…</p>`);
    const r = await send({ type: "keyword", q });
    if (r.status === 401 || r.error === "NOT_PAIRED") return notPaired();
    if (!r.ok || !r.body) return setBody(`<p class="vrk-muted">Couldn't load competition.</p>`);
    const b = r.body;
    const comp = String(b.competition || "—");
    const compColor = comp === "low" ? "#1e8e5a" : comp === "medium" ? "#b07a00" : "#c0392b";
    const ids = extractSearchListingIds();
    const bulkBtn = ids.length
      ? `<button class="vrk-btn" id="vrk-bulk">Analyze ${ids.length} listing${ids.length === 1 ? "" : "s"}</button>`
      : "";
    setBody(
      `<div class="vrk-kw">“${q}”</div>
       ${row("Competition", `<b style="color:${compColor};text-transform:capitalize">${comp}</b>`, false)}
       ${row("Live listings", (b.listings ?? 0).toLocaleString(), false)}
       ${bulkBtn}
       <a class="vrk-cta" target="_blank" href="${apiBase}/tools/keyword-generator">Keyword research →</a>`
    );
    const btn = document.getElementById("vrk-bulk");
    if (btn) btn.addEventListener("click", () => bulkAnalyze(ids));
  }

  // --- Feature B: bulk-analyze table + CSV export --------------------------

  /** Pull listing ids from the search-results DOM (first run of digits in /listing/ links). */
  function extractSearchListingIds() {
    const ids = [];
    const seen = new Set();
    try {
      const anchors = document.querySelectorAll('a[href*="/listing/"]');
      for (const a of anchors) {
        const m = (a.getAttribute("href") || "").match(/\/listing\/(\d+)/);
        if (!m) continue;
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= 12) break;
      }
    } catch {
      /* DOM differs → no ids */
    }
    return ids;
  }

  let bulkRows = []; // last analyzed rows (for CSV export)
  let bulkSort = { col: "score", dir: "desc" };

  async function bulkAnalyze(ids) {
    const panel = ensurePanel();
    panel.classList.add("vrk-wide");
    bulkRows = [];
    let done = 0;
    setBody(`<p class="vrk-muted">Analyzing 0/${ids.length}…</p>`);
    // Small concurrency (3) with a shared cursor.
    let cursor = 0;
    async function worker() {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        const r = await send({ type: "listing", id });
        done++;
        setBody(`<p class="vrk-muted">Analyzing ${done}/${ids.length}…</p>`);
        if (r.status === 401 || r.error === "NOT_PAIRED") return "notpaired";
        if (r.status === 404 || !r.ok || !r.body) continue; // skip dead listings
        const b = r.body;
        bulkRows.push({
          id,
          title: b.title || `Listing ${id}`,
          score: typeof b.score === "number" ? b.score : null,
          sales: b.estSales != null ? Number(b.estSales) : null,
          faves: b.faves != null ? Number(b.faves) : 0,
        });
      }
      return null;
    }
    const results = await Promise.all([worker(), worker(), worker()]);
    if (results.includes("notpaired")) return notPaired();
    renderBulkTable();
  }

  function renderBulkTable() {
    if (!bulkRows.length) {
      setBody(`<p class="vrk-muted">No listings could be analyzed.</p>`);
      return;
    }
    const { col, dir } = bulkSort;
    const sorted = [...bulkRows].sort((a, b) => {
      let av, bv;
      if (col === "title") {
        av = (a.title || "").toLowerCase();
        bv = (b.title || "").toLowerCase();
      } else {
        av = a[col] == null ? -1 : a[col];
        bv = b[col] == null ? -1 : b[col];
      }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    const arrow = (c) => (col === c ? (dir === "asc" ? " ▲" : " ▼") : "");
    const trunc = (t) => (t.length > 40 ? t.slice(0, 39) + "…" : t);
    const esc = (t) =>
      String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    const rowsHtml = sorted
      .map(
        (r) =>
          `<tr><td title="${esc(r.title)}">${esc(trunc(r.title))}</td><td>${
            r.score == null ? "—" : r.score
          }</td><td>${r.sales == null ? "—" : r.sales.toLocaleString()}</td><td>${(
            r.faves ?? 0
          ).toLocaleString()}</td></tr>`
      )
      .join("");
    setBody(
      `<p class="vrk-muted vrk-sm">${bulkRows.length} listing${bulkRows.length === 1 ? "" : "s"} · scores &amp; sales <span class="vrk-est">Est.</span></p>
       <table class="vrk-table">
         <thead><tr>
           <th data-col="title">Title${arrow("title")}</th>
           <th data-col="score">SEO${arrow("score")}</th>
           <th data-col="sales">Sales/mo${arrow("sales")}</th>
           <th data-col="faves">Faves${arrow("faves")}</th>
         </tr></thead>
         <tbody>${rowsHtml}</tbody>
       </table>
       <button class="vrk-btn" id="vrk-csv">Export CSV</button>`
    );
    const body = ensurePanel().querySelector(".vrk-body");
    body.querySelectorAll("th[data-col]").forEach((th) => {
      th.addEventListener("click", () => {
        const c = th.getAttribute("data-col");
        if (bulkSort.col === c) bulkSort.dir = bulkSort.dir === "asc" ? "desc" : "asc";
        else bulkSort = { col: c, dir: c === "title" ? "asc" : "desc" };
        renderBulkTable();
      });
    });
    const csvBtn = document.getElementById("vrk-csv");
    if (csvBtn) csvBtn.addEventListener("click", exportBulkCsv);
  }

  function exportBulkCsv() {
    const head = ["listing_id", "title", "seo_score_est", "est_sales_per_mo", "faves"];
    const cell = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(",")];
    for (const r of bulkRows) {
      lines.push([r.id, cell(r.title), r.score ?? "", r.sales ?? "", r.faves ?? 0].map(cell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vierank-listings.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function renderShop(name) {
    const deepLink = `<a class="vrk-cta" target="_blank" href="${apiBase}/tools/shop-analyzer?shop=${encodeURIComponent(
      name
    )}">Analyze shop →</a>`;
    setBody(`<div class="vrk-kw">${name}</div><p class="vrk-muted">Loading shop stats…</p>`);
    const r = await send({ type: "shop", name });
    if (r.status === 401 || r.error === "NOT_PAIRED") return notPaired();
    if (!r.ok || !r.body) {
      return setBody(
        `<div class="vrk-kw">${name}</div>
         <p class="vrk-muted vrk-sm">Open this shop in VieRank's Shop Research for an estimated breakdown.</p>
         ${deepLink}`
      );
    }
    const b = r.body;
    if (b.found === false) {
      return setBody(
        `<div class="vrk-kw">${name}</div>
         <p class="vrk-muted vrk-sm">This shop wasn't found on Etsy.</p>
         ${deepLink}`
      );
    }
    const ratingEst = b.estimated && b.estimated.rating;
    setBody(
      `<div class="vrk-kw">${b.shopName || name}</div>
       ${row("Rating", `${b.rating ? Number(b.rating).toFixed(2) : "—"} ★`, !!ratingEst)}
       ${row("Reviews", (b.reviews ?? 0).toLocaleString(), false)}
       ${row("Active listings", (b.listings ?? 0).toLocaleString(), false)}
       ${deepLink}`
    );
  }

  let apiBase = "http://localhost:3001";

  async function run() {
    const page = detectPage();
    if (page.type === "other") {
      const el = document.getElementById(PANEL_ID);
      if (el) el.remove();
      return;
    }
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.classList.remove("vrk-wide");
    const cfg = await send({ type: "getConfig" });
    apiBase = (cfg && cfg.apiBase) || apiBase;
    if (page.type === "listing") return renderListing(page.id);
    if (page.type === "search") return renderSearch(page.q);
    if (page.type === "shop") return renderShop(page.name);
  }

  // --- Feature A: autocomplete competition annotation ----------------------
  // Annotate Etsy's search-suggestion dropdown with a small competition pill per suggestion.
  // Entirely defensive: any selector mismatch or error must NOT disturb Etsy's own UI.

  const compCache = new Map(); // suggestion text → 'low'|'medium'|'high'
  let acInFlight = 0;
  const AC_MAX_CONCURRENCY = 3;
  const acQueue = [];

  function compColorFor(c) {
    return c === "low" ? "#1e8e5a" : c === "medium" ? "#b07a00" : "#c0392b";
  }

  function pumpAcQueue() {
    while (acInFlight < AC_MAX_CONCURRENCY && acQueue.length) {
      const job = acQueue.shift();
      acInFlight++;
      job().finally(() => {
        acInFlight--;
        pumpAcQueue();
      });
    }
  }

  function fetchCompetition(text) {
    if (compCache.has(text)) return Promise.resolve(compCache.get(text));
    return new Promise((resolve) => {
      acQueue.push(async () => {
        if (compCache.has(text)) return resolve(compCache.get(text));
        const r = await send({ type: "keyword", q: text });
        const comp = r && r.ok && r.body ? r.body.competition : null;
        if (comp) compCache.set(text, comp);
        resolve(comp);
      });
      pumpAcQueue();
    });
  }

  function annotateOption(li, text) {
    try {
      if (li.querySelector(".vrk-pill")) return; // already annotated
      const pill = document.createElement("span");
      pill.className = "vrk-pill";
      pill.textContent = "…";
      li.appendChild(pill);
      fetchCompetition(text).then((comp) => {
        if (!comp) {
          pill.remove();
          return;
        }
        pill.textContent = comp;
        pill.style.background = compColorFor(comp);
        pill.setAttribute("data-comp", comp);
      });
    } catch {
      /* never break Etsy's dropdown */
    }
  }

  function scanSuggestions() {
    try {
      let options = document.querySelectorAll('ul[role="listbox"] li[role="option"]');
      if (!options.length) options = document.querySelectorAll("[data-search-suggestions] li");
      if (!options.length) return;
      let n = 0;
      for (const li of options) {
        if (n >= 6) break;
        // Skip hidden options.
        if (li.offsetParent === null) continue;
        const text = (li.textContent || "").trim();
        if (!text || text.length > 60) continue;
        n++;
        annotateOption(li, text);
      }
    } catch {
      /* fail silently */
    }
  }

  let acTimer = null;
  function scheduleScan() {
    clearTimeout(acTimer);
    acTimer = setTimeout(scanSuggestions, 250);
  }

  function initAutocompleteObserver() {
    try {
      const obs = new MutationObserver(scheduleScan);
      obs.observe(document.body, { childList: true, subtree: true });
      // Also rescan when the user types in a known search box.
      const onInput = (e) => {
        const t = e.target;
        if (
          t &&
          (t.id === "global-enhancements-search-query" ||
            (t.name && t.name === "search_query") ||
            (t.matches && t.matches('input[name="search_query"]')))
        ) {
          scheduleScan();
        }
      };
      document.addEventListener("input", onInput, true);
    } catch {
      /* observer unsupported / DOM differs → no autocomplete annotation */
    }
  }
  initAutocompleteObserver();

  // Initial + SPA navigation handling (Etsy mutates the URL without full reloads).
  function tick() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      run();
    }
  }
  tick();
  setInterval(tick, 1200);
})();
