const api = typeof browser !== "undefined" ? browser : chrome;
const A = Altwiki;
const $ = (id) => document.getElementById(id);
let settings = A.mergeSettings();

function save() {
  return api.storage.local.set({ settings });
}

function langLabel(w) {
  return w.langs === "*" ? "all languages" : w.langs.length > 6 ? w.langs.slice(0, 6).join(", ") + " and more" : w.langs.join(", ");
}

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const k of kids) e.append(k);
  return e;
}

function wikiMeta(w) {
  const link = el("a", { href: w.home, target: "_blank", rel: "noopener noreferrer", textContent: w.home.replace(/^https:\/\//, "").replace(/\/$/, "") });
  return el("div", { className: "meta" },
    el("b", { textContent: w.name }),
    el("span", { className: "tag", textContent: langLabel(w) }),
    el("br"),
    el("small", {}, w.note + " ", link));
}

function renderSingle() {
  const box = $("singleList");
  box.textContent = "";
  for (const w of A.WIKIS) {
    const input = el("input", { type: "radio", name: "wiki", value: w.id });
    input.checked = settings.wiki === w.id;
    input.addEventListener("change", () => { settings.wiki = w.id; save(); });
    box.appendChild(el("label", { className: "wiki" }, input, wikiMeta(w)));
  }
}

function renderPriority() {
  const ol = $("priorityList");
  ol.textContent = "";
  settings.priority.forEach((e, i) => {
    const w = A.getWiki(e.id);
    const box = el("input", { type: "checkbox", checked: e.on });
    const up = el("button", { type: "button", title: "Move up", textContent: "\u25B2", disabled: i === 0 });
    const down = el("button", { type: "button", title: "Move down", textContent: "\u25BC", disabled: i === settings.priority.length - 1 });
    box.addEventListener("change", () => { e.on = box.checked; save(); });
    up.addEventListener("click", () => move(i, -1));
    down.addEventListener("click", () => move(i, 1));
    ol.appendChild(el("li", { className: "wiki" }, box, wikiMeta(w), el("div", { className: "moves" }, up, down)));
  });
}

function move(i, d) {
  const list = settings.priority;
  [list[i], list[i + d]] = [list[i + d], list[i]];
  save();
  renderPriority();
}

function renderMode() {
  document.querySelectorAll("input[name=mode]").forEach((r) => { r.checked = r.value === settings.mode; });
  $("singleCard").hidden = settings.mode !== "single";
  $("priorityCard").hidden = settings.mode !== "priority";
}

async function checkPermission() {
  try {
    const ok = await api.permissions.contains({ origins: A.allOrigins() });
    $("perm").hidden = ok;
  } catch (e) { $("perm").hidden = true; }
}

$("grant").addEventListener("click", async () => {
  try { await api.permissions.request({ origins: A.allOrigins() }); } catch (e) {}
  checkPermission();
});

$("enabled").addEventListener("change", (e) => { settings.enabled = e.target.checked; save(); });
document.querySelectorAll("input[name=mode]").forEach((r) =>
  r.addEventListener("change", () => { settings.mode = r.value; save(); renderMode(); })
);

$("saveCustom").addEventListener("click", async () => {
  const lines = $("custom").value.split(/\s+/).filter(Boolean);
  const good = lines.map(A.normalizeInstance).filter(Boolean);
  const bad = lines.length - good.length;
  const unique = [...new Set(good)].filter((o) => !A.WIKILESS_INSTANCES.includes(o));
  let granted = true;
  if (unique.length) {
    try { granted = await api.permissions.request({ origins: unique.map((o) => o + "/*") }); } catch (e) { granted = false; }
  }
  settings.customWikiless = granted ? unique : [];
  await save();
  $("custom").value = settings.customWikiless.join("\n");
  $("customMsg").textContent = !granted ? "Access was not granted, so the instances were not saved." : bad ? `Saved. ${bad} line${bad === 1 ? "" : "s"} skipped (https addresses only).` : "Saved.";
});

$("probe").addEventListener("click", async () => {
  const list = $("probeList");
  list.textContent = "";
  list.appendChild(el("li", { textContent: "Checking..." }));
  let res = [];
  try { res = await api.runtime.sendMessage({ type: "probe" }); } catch (e) {}
  list.textContent = "";
  for (const r of res || []) {
    const li = document.createElement("li");
    li.className = r.ok ? "up" : "dn";
    li.textContent = `${r.ok ? "up" : "down"}: ${r.instance.replace("https://", "")} (${r.why}, ${r.ms} ms)`;
    list.appendChild(li);
  }
  if (!list.children.length) list.appendChild(el("li", { textContent: "No answer from the background script." }));
});

(async function init() {
  const res = await api.storage.local.get("settings");
  settings = A.mergeSettings(res && res.settings);
  $("enabled").checked = settings.enabled;
  $("custom").value = settings.customWikiless.join("\n");
  renderMode();
  renderSingle();
  renderPriority();
  checkPermission();
})();
