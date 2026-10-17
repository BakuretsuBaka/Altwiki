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
