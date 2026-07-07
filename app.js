/* ============================================================
   DATASOURCES — the registry.  Mirrors stefaniabio23/datasources.
   ============================================================ */
const REPO = "stefaniabio23/datasources";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/generated`;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = { all: [], view: "table", sort: "priority", q: "", domains: new Set(), keyMeta: {} };
const PRIO = { high: 0, medium: 1, low: 2, "": 3, undefined: 3 };
const MCP = {
  "mcp-exists": "EXISTS", "mcp-needed-high-value": "NEEDED ↑", "mcp-needed-low-value": "NEEDED",
  "api-direct-sufficient": "API-DIRECT", "requires-scraping": "SCRAPING", "fragile-unofficial": "FRAGILE"
};

/* ---------- load ---------- */
async function load() {
  try {
    const [idx, keys] = await Promise.all([
      fetch(`${RAW}/index.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(`${RAW}/join-keys.csv`).then(r => r.ok ? r.text() : "").catch(() => "")
    ]);
    state.all = idx.map(normalize);
    state.keyMeta = parseKeyCsv(keys);
    $("#loading").hidden = true;
    computeStats();
    buildDomainFilters();
    render();
  } catch (e) {
    $("#loading").hidden = true;
    const el = $("#error"); el.hidden = false;
    el.textContent = "COULD NOT REACH THE REGISTRY (" + e.message + "). Try again shortly.";
  }
}
function normalize(e) {
  return {
    id: e.id, name: e.name, domain: e.domain || "—", kind: e.entry_kind || "—",
    desc: e.description || "", type: e.type || [], auth: e.auth_required || "—",
    cost: e.cost || "—", license: e.license || "—", jk: e.join_keys || [], pk: e.primary_keys || [],
    mcp: e.mcp_status || "—", mcpCmd: e.mcp_command || [], mcpPkg: e.mcp_package || [],
    home: e.homepage_url || "", docs: e.docs_url || "", ver: e.last_verified || "",
    prio: e.build_priority || "", uses: e.agent_use_cases || [], bulk: !!e.bulk_available,
    freq: e.frequency || "", geo: e.geography || [], pit: !!e.pit_reconstructable,
    rate: e.rate_limit || ""
  };
}
function parseKeyCsv(txt) {
  const out = {}; if (!txt) return out;
  const rows = txt.trim().split("\n"); const cols = rows.shift().split(",");
  for (const line of rows) {
    const m = line.match(/(".*?"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, "").replace(/^"|"$/g, ""));
    const o = {}; cols.forEach((c, i) => o[c] = m[i]); if (o.join_key) out[o.join_key] = o;
  }
  return out;
}

/* ---------- stats + filters ---------- */
function computeStats() {
  const keys = new Set(), doms = new Set();
  let built = "";
  state.all.forEach(e => { e.jk.forEach(k => keys.add(k)); doms.add(e.domain); if (e.ver > built) built = e.ver; });
  set("#s-sources", state.all.length, true); set("#s-keys", keys.size); set("#s-domains", doms.size);
  $("#s-built").textContent = "BUILT " + (built || "—");
  $("#f-count").textContent = state.all.length;
}
function set(sel, v, pop) { const el = $(sel); el.textContent = v; if (pop) el.classList.add("pop"); }

function buildDomainFilters() {
  const counts = {};
  state.all.forEach(e => counts[e.domain] = (counts[e.domain] || 0) + 1);
  const doms = Object.keys(counts).sort();
  const host = $("#domain-filters");
  host.innerHTML = `<button class="dfilter is-active" data-dom="__all">all <span class="n">${state.all.length}</span></button>` +
    doms.map(d => `<button class="dfilter" data-dom="${esc(d)}">${esc(d)} <span class="n">${counts[d]}</span></button>`).join("");
  $$(".dfilter", host).forEach(b => b.onclick = () => toggleDomain(b.dataset.dom));
}
function toggleDomain(d) {
  if (d === "__all") state.domains.clear();
  else { state.domains.has(d) ? state.domains.delete(d) : state.domains.add(d); }
  $$(".dfilter").forEach(b => {
    const on = b.dataset.dom === "__all" ? state.domains.size === 0 : state.domains.has(b.dataset.dom);
    b.classList.toggle("is-active", on);
  });
  render();
}

/* ---------- filter + sort ---------- */
function filtered() {
  const q = state.q.trim().toLowerCase();
  let r = state.all.filter(e => {
    if (state.domains.size && !state.domains.has(e.domain)) return false;
    if (!q) return true;
    return (e.name + " " + e.desc + " " + e.domain + " " + e.id + " " + e.jk.join(" ") + " " +
      e.pk.join(" ") + " " + e.mcp + " " + e.cost + " " + e.uses.join(" ") + " " + e.mcpCmd.join(" ")).toLowerCase().includes(q);
  });
  const s = state.sort;
  r.sort((a, b) => {
    if (s === "name") return a.name.localeCompare(b.name);
    if (s === "domain") return a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name);
    if (s === "verified") return (b.ver || "").localeCompare(a.ver || "");
    return (PRIO[a.prio] - PRIO[b.prio]) || a.name.localeCompare(b.name); // priority
  });
  return r;
}

/* ---------- render ---------- */
function render() {
  const rows = filtered();
  $("#result-count").textContent = rows.length + " RESULT" + (rows.length === 1 ? "" : "S");
  $("#q-count").textContent = state.q ? rows.length + " / " + state.all.length : "";
  $("#empty").hidden = rows.length > 0;
  $$(".view").forEach(v => v.classList.remove("is-active"));
  const v = state.view;
  $("#view-" + v).classList.add("is-active");
  if (v === "table") renderTable(rows);
  else if (v === "cards") renderCards(rows);
  else if (v === "joinmap") renderJoinMap(rows);
  else if (v === "schema") renderSchema(rows);
}

function chips(keys, max = 4) {
  const shown = keys.slice(0, max).map(k => `<span class="kc" data-k="${esc(k)}">${esc(k)}</span>`).join("");
  const more = keys.length > max ? `<span class="kc more">+${keys.length - max}</span>` : "";
  return `<div class="keychips">${shown}${more}</div>`;
}
function costCls(c) { return /free/.test(c) ? "free" : /paid/.test(c) ? "paid" : ""; }

function renderTable(rows) {
  const head = `<div class="trow head"><span>№</span><span>Name</span><span>Domain</span><span>Kind</span>
    <span>Access</span><span>Cost</span><span>Join keys</span><span>MCP</span><span>Verified</span></div>`;
  const body = rows.map((e, i) => `
    <div class="trow reveal" style="animation-delay:${Math.min(i * 14, 420)}ms" data-id="${esc(e.id)}">
      <span class="c-num">${String(i + 1).padStart(3, "0")}</span>
      <div class="c-name"><div class="nm">${esc(e.name)}</div><div class="ds">${esc(e.desc)}</div></div>
      <span class="c-dom">${esc(e.domain)}</span>
      <span class="c-kind">${esc(e.kind)}</span>
      <span class="c-access">${esc((e.type[0] || e.auth).replace(/-/g, " "))}${e.type.length > 1 ? " +" + (e.type.length - 1) : ""}</span>
      <span class="c-cost ${costCls(e.cost)}">${esc(e.cost.replace(/-/g, " "))}</span>
      <div class="keychips-wrap">${e.jk.length ? chips(e.jk) : '<span class="c-kind dim">—</span>'}</div>
      <span class="c-mcp">${esc(MCP[e.mcp] || e.mcp)}</span>
      <span class="c-ver">${esc(e.ver || "—")}${e.pit ? '<br><span class="pit">PIT</span>' : ""}</span>
    </div>`).join("");
  $("#view-table").innerHTML = `<div class="tbl">${head}${body}</div>`;
  wireRows($("#view-table"));
}

function renderCards(rows) {
  $("#view-cards").innerHTML = `<div class="cards">` + rows.map((e, i) => `
    <div class="card reveal" style="animation-delay:${Math.min(i * 12, 380)}ms" data-id="${esc(e.id)}">
      <div class="cnum">${String(i + 1).padStart(3, "0")} / ${esc(e.domain)}</div>
      <div class="cnm">${esc(e.name)}</div>
      <div class="cmeta">${esc(e.kind)} · <span class="${costCls(e.cost)==='free'?'':'acc'}">${esc(e.cost.replace(/-/g," "))}</span> · ${esc(MCP[e.mcp] || e.mcp)}</div>
      <div class="cds">${esc(e.desc)}</div>
      <div class="ckeys">${e.jk.length ? chips(e.jk, 6) : ""}</div>
    </div>`).join("") + `</div>`;
  wireRows($("#view-cards"));
}

function wireRows(root) {
  $$("[data-id]", root).forEach(el => el.onclick = (ev) => {
    if (ev.target.classList.contains("kc") && ev.target.dataset.k) { pickKey(ev.target.dataset.k); return; }
    openDrawer(el.dataset.id);
  });
  $$(".kc[data-k]", root).forEach(c => {
    c.onmouseenter = () => $$(`.kc[data-k="${CSS.escape(c.dataset.k)}"]`, root).forEach(x => x.classList.add("hot"));
    c.onmouseleave = () => $$(".kc.hot", root).forEach(x => x.classList.remove("hot"));
  });
}
function pickKey(k) { state.q = k; $("#q").value = k; render(); }

/* ---------- JOIN MAP ---------- */
function renderJoinMap(rows) {
  const byKey = {};
  rows.forEach(e => e.jk.forEach(k => (byKey[k] ||= []).push(e)));
  const keys = Object.keys(byKey).sort((a, b) => byKey[b].length - byKey[a].length);
  const maxN = keys.length ? byKey[keys[0]].length : 1;
  if (!keys.length) { $("#view-joinmap").innerHTML = `<p class="jm-hint" style="padding:40px 0">No join keys in this selection.</p>`; return; }
  const list = keys.map((k, i) => `
    <div class="jm-key${i === 0 ? " sel" : ""}" data-k="${esc(k)}">
      <span class="jk">${esc(k)}</span><span class="jn">${byKey[k].length}</span>
      <span class="bar" style="width:${Math.round(byKey[k].length / maxN * 60)}px"></span>
    </div>`).join("");
  $("#view-joinmap").innerHTML = `<div class="jm"><div class="jm-keys">${list}</div>
    <div class="jm-stage" id="jm-stage"><svg class="jm-svg" id="jm-svg"></svg><div class="jm-hint" id="jm-hint"></div></div></div>`;
  $$(".jm-key").forEach(el => el.onclick = () => {
    $$(".jm-key").forEach(x => x.classList.remove("sel")); el.classList.add("sel"); drawKey(el.dataset.k, byKey[el.dataset.k]);
  });
  drawKey(keys[0], byKey[keys[0]]);
}
function drawKey(key, sources) {
  const stage = $("#jm-stage"); const svg = $("#jm-svg");
  const W = stage.clientWidth, H = Math.max(stage.clientHeight, 460);
  const cx = W / 2, cy = H / 2;
  const cap = W < 640 ? 12 : 16;
  const nodes = sources.slice(0, cap);
  const R = Math.min(W * 0.40, (cy - 46));
  const trunc = s => s.length > 17 ? s.slice(0, 16) + "…" : s;
  const pts = nodes.map((e, i) => {
    const ang = (-Math.PI / 2) + (i / nodes.length) * Math.PI * 2;
    return { e, x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R };
  });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = pts.map(p => `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="var(--join)" stroke-width="1" opacity="0.5"/>`).join("") +
    `<circle cx="${cx}" cy="${cy}" r="4" fill="var(--accent)"/>`;
  const html = `<div class="jm-center" style="left:${cx}px;top:${cy}px;transform:translate(-50%,-50%)">${esc(key)} · ${sources.length}</div>` +
    pts.map(p => `<a class="jm-node" style="left:${p.x}px;top:${p.y}px" href="#" data-id="${esc(p.e.id)}" title="${esc(p.e.name)}">${esc(trunc(p.e.name))}<span class="nd">${esc(p.e.domain)}</span></a>`).join("") +
    (sources.length > nodes.length ? `<div class="jm-hint" style="position:absolute;left:16px;bottom:12px">+${sources.length - nodes.length} MORE SOURCES SHARE ${esc(key)}</div>` : "");
  stage.querySelectorAll(".jm-center,.jm-node,.jm-hint").forEach(n => n.remove());
  stage.insertAdjacentHTML("beforeend", html);
  $$(".jm-node", stage).forEach(a => a.onclick = (ev) => { ev.preventDefault(); openDrawer(a.dataset.id); });
}

/* ---------- SCHEMA ---------- */
function renderSchema(rows) {
  const doms = {}, kinds = {}, keys = {};
  rows.forEach(e => { doms[e.domain] = (doms[e.domain] || 0) + 1; kinds[e.kind] = (kinds[e.kind] || 0) + 1; e.jk.forEach(k => keys[k] = (keys[k] || 0) + 1); });
  const col = (h, obj, fmt) => `<div class="sch-col"><div class="sch-h">${h}</div>` +
    Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="sch-row"><span>${esc(fmt ? fmt(k) : k)}</span><span class="sv">${v}</span></div>`).join("") + `</div>`;
  const keyRows = Object.entries(keys).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const m = state.keyMeta[k];
    return `<div class="sch-row"><span title="${esc(m ? m.description : "")}">${esc(k)}</span><span class="sv">${v}${m && m.entity_type ? " · " + esc(m.entity_type) : ""}</span></div>`;
  }).join("");
  $("#view-schema").innerHTML = `<div class="schema">
    ${col("DOMAINS", doms)}
    ${col("ENTRY KINDS", kinds)}
    <div class="sch-col"><div class="sch-h">CANONICAL JOIN KEYS</div>${keyRows}
      <p class="sch-note">Each entry answers four questions: can an agent <em>access</em> it, <em>trust</em> it, what it can <em>join</em> on, and whether there's a <em>tooling</em> path. The reverse index over join keys is what makes cross-source joins planable.</p></div>
  </div>`;
}

/* ---------- drawer ---------- */
function openDrawer(id) {
  const e = state.all.find(x => x.id === id); if (!e) return;
  const cell = (l, v) => `<div class="dr-cell"><span class="dl">${l}</span><span class="dv">${esc(v || "—")}</span></div>`;
  const p = $("#drawer-panel");
  p.innerHTML = `
    <button class="dr-close" data-close>CLOSE ✕</button>
    <div class="dr-vol">${esc(e.domain)} · ${esc(e.kind)}</div>
    <h3 class="dr-nm">${esc(e.name)}<span class="dot">.</span></h3>
    <p class="dr-desc">${esc(e.desc)}</p>
    <div class="dr-grid">
      ${cell("ACCESS", e.type.join(", ").replace(/-/g, " "))}
      ${cell("AUTH", e.auth.replace(/-/g, " "))}
      ${cell("COST", e.cost.replace(/-/g, " "))}
      ${cell("LICENSE", e.license)}
      ${cell("FREQUENCY", e.freq)}
      ${cell("VERIFIED", e.ver)}
      ${cell("MCP", MCP[e.mcp] || e.mcp)}
      ${cell("BULK", e.bulk ? "yes" : "no")}
    </div>
    ${e.jk.length ? `<div class="dr-sec"><h4>Join keys</h4>${chips(e.jk, 30)}</div>` : ""}
    ${e.pk.length ? `<div class="dr-sec"><h4>Primary keys</h4><div class="keychips">${e.pk.map(k => `<span class="kc">${esc(k)}</span>`).join("")}</div></div>` : ""}
    ${e.mcpCmd.length ? `<div class="dr-sec"><h4>Run the MCP</h4>${e.mcpCmd.map(c => `<div class="dr-cmd">${esc(c)}</div>`).join("")}</div>` : ""}
    ${e.uses.length ? `<div class="dr-sec"><h4>Agent use cases</h4><ul style="list-style:none;font-size:.86rem;line-height:1.7;color:var(--ink-soft)">${e.uses.map(u => `<li>— ${esc(u)}</li>`).join("")}</ul></div>` : ""}
    <div class="dr-links">${e.home ? `<a class="link mono" href="${esc(e.home)}" target="_blank" rel="noopener">HOMEPAGE ↗</a>` : ""}${e.docs ? `<a class="link mono" href="${esc(e.docs)}" target="_blank" rel="noopener">DOCS ↗</a>` : ""}</div>`;
  const dr = $("#drawer"); dr.hidden = false;
  $$("[data-close]", dr).forEach(b => b.onclick = closeDrawer);
  $$(".kc[data-k]", p).forEach(c => c.onclick = () => { closeDrawer(); pickKey(c.dataset.k); });
  document.addEventListener("keydown", escClose);
}
function closeDrawer() { $("#drawer").hidden = true; document.removeEventListener("keydown", escClose); }
function escClose(e) { if (e.key === "Escape") closeDrawer(); }

/* ---------- controls ---------- */
$("#q").addEventListener("input", e => { state.q = e.target.value; render(); });
$$(".chip-try").forEach(b => b.onclick = () => { state.q = b.dataset.q; $("#q").value = b.dataset.q; render(); });
$$(".view-btn").forEach(b => b.onclick = () => { $$(".view-btn").forEach(x => x.classList.remove("is-active")); b.classList.add("is-active"); state.view = b.dataset.view; render(); });
$$(".sort-btn").forEach(b => b.onclick = () => { $$(".sort-btn").forEach(x => x.classList.remove("is-active")); b.classList.add("is-active"); state.sort = b.dataset.sort; render(); });

/* theme */
const tt = $("#theme-toggle");
function syncTheme() { $("#theme-label").textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "DARK" : "LIGHT"; }
tt.onclick = () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("ds-theme", next); } catch (e) {}
  syncTheme();
  if (state.view === "joinmap") render();
};
syncTheme();
window.addEventListener("resize", () => { if (state.view === "joinmap") render(); });
load();
