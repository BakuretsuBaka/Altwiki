const api = typeof browser !== "undefined" ? browser : chrome;
const A = Altwiki;
const $ = (id) => document.getElementById(id);
let settings = A.mergeSettings();

function summary() {
  const names = A.wikiOrder(settings).map((id) => (A.getWiki(id) || {}).short || (A.getWiki(id) || {}).name).filter(Boolean);
  $("summary").textContent = !names.length ? "No wiki selected." : settings.mode === "priority" ? "In this order: " + names.join(", then ") : "Wiki: " + names[0];
}

$("enabled").addEventListener("change", (e) => {
  settings.enabled = e.target.checked;
  api.storage.local.set({ settings });
});
$("options").addEventListener("click", () => { api.runtime.openOptionsPage(); window.close(); });

api.storage.local.get("settings").then((res) => {
  settings = A.mergeSettings(res && res.settings);
  $("enabled").checked = settings.enabled;
  summary();
});

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const k of kids) e.append(k);
  return e;
}

function short(u) { try { const x = new URL(u); return x.hostname + x.pathname; } catch (e) { return u; } }

async function loadLog() {
  const res = await api.storage.local.get("log");
  const list = ((res && res.log) || []).slice().reverse();
  const ul = $("events");
  ul.textContent = "";
  if (!list.length) ul.appendChild(el("li", { textContent: "Nothing yet. Open a Wikipedia article." }));
  for (const e of list.slice(0, 8)) {
    const li = el("li", { textContent: short(e.page) + ": " + e.result.replace(/^redirected to (\S+)$/, (m, u) => "redirected to " + short(u)) });
    for (const t of e.trace || []) li.appendChild(el("span", { textContent: t }));
    ul.appendChild(li);
  }
}
loadLog();

$("debug").addEventListener("click", async () => {
  const res = await api.storage.local.get("log");
  let perm = null;
  try { perm = await api.permissions.contains({ origins: A.allOrigins() }); } catch (e) {}
  const info = { version: api.runtime.getManifest().version, browser: navigator.userAgent, wikiAccessGranted: perm, settings, log: (res && res.log) || [] };
  try {
    await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    $("debug").textContent = "Copied to clipboard";
  } catch (e) {
    $("debug").textContent = "Copy failed";
  }
});
