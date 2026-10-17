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
  loadViews();
});
$("options").addEventListener("click", () => { api.runtime.openOptionsPage(); window.close(); });

api.storage.local.get("settings").then((res) => {
  settings = A.mergeSettings(res && res.settings);
  $("enabled").checked = settings.enabled;
  summary();
  loadViews();
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

async function showPermission() {
  try { $("perm").hidden = await api.permissions.contains({ origins: A.allOrigins() }); } catch (e) {}
}
$("grant").addEventListener("click", async () => {
  try { await api.permissions.request({ origins: A.allOrigins() }); } catch (e) {}
  showPermission();
});
showPermission();

// With the redirect off: offer the article on the other wikis that cover the page's language.
async function loadViews() {
  $("views").hidden = true;
  if (settings.enabled) return;
  let tab;
  try { [tab] = await api.tabs.query({ active: true, currentWindow: true }); } catch (e) { return; }
  if (tab && tab.url) renderViews(tab.url, tab.id);
}

function renderViews(url, tabId) {
  const parsed = A.parseArticleUrl(url, settings.customWikiless);
  const box = $("views"), list = $("viewlist");
  list.textContent = "";
  const targets = parsed ? A.viewTargets(parsed) : [];
  box.hidden = !targets.length;
  for (const t of targets) {
    const b = el("button", { type: "button", textContent: "View article on " + t.name });
    b.addEventListener("click", async () => {
      let target = t.url;
      if (!target) { // Wikiless: the background script picks an instance that is up
        b.textContent = "Looking for a working instance...";
        try { target = await api.runtime.sendMessage({ type: "wikilessUrl", page: url }); } catch (e) {}
        if (!target) { b.textContent = "No Wikiless instance answered"; return; }
      }
      api.tabs.update(tabId, { url: target });
      window.close();
    });
    list.appendChild(b);
  }
}
