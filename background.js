// Altwiki: sends Wikipedia article visits to an alternative wiki when that wiki has the same article.
if (typeof importScripts === "function" && typeof Altwiki === "undefined") importScripts("shared.js"); // Chromium service worker; Firefox lists shared.js in the manifest

const api = typeof browser !== "undefined" ? browser : chrome;
const A = Altwiki;

const FETCH_TIMEOUT = 6000;
const PROBE_TIMEOUT = 4000;
const HIT_TTL = 60 * 60 * 1000;
const MISS_TTL = 10 * 60 * 1000;
const DOWN_TTL = 10 * 60 * 1000;
const GOOD_TTL = 3 * 60 * 1000;

let settings = A.mergeSettings();
const ready = api.storage.local.get("settings").then((res) => { settings = A.mergeSettings(res && res.settings); });
api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) settings = A.mergeSettings(changes.settings.newValue);
});

// ---------- fetching ----------

async function fetchLimited(url, timeout, limit) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { redirect: "follow", credentials: "omit", signal: ctl.signal, headers: { Accept: "text/html" } });
    let text = "";
    if (limit && res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let got = 0;
      while (got < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        text += dec.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    } else if (res.body && res.body.cancel) {
      res.body.cancel().catch(() => {});
    }
    return { ok: res.ok, status: res.status, url: res.url, text };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- does the wiki have the article? ----------

const cache = new Map(); // url -> { at, ok }

function sameSite(a, b) {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, "");
    const hb = new URL(b).hostname.replace(/^www\./, "");
    return ha === hb || ha.endsWith("." + hb) || hb.endsWith("." + ha);
  } catch (e) { return false; }
}

async function pageExists(wiki, url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < (hit.ok ? HIT_TTL : MISS_TTL)) return hit.ok;
  let ok = false;
  try {
    const r = await fetchLimited(url, FETCH_TIMEOUT, 65536);
    const chk = wiki.check || {};
    ok = r.ok && sameSite(r.url, url);
    if (ok && chk.missingUrl && chk.missingUrl.test(r.url)) ok = false;
    if (ok && chk.missingBody && chk.missingBody.test(r.text)) ok = false;
    if (ok && !wiki.check && A.MW_MISSING.test(r.text)) ok = false;
  } catch (e) {
    ok = false;
  }
  cache.set(url, { at: Date.now(), ok });
  return ok;
}

async function findInWiki(wiki, parsed) {
  const urls = A.candidateUrls(wiki, parsed);
  if (!urls.length) return null;
  const results = await Promise.all(urls.map((u) => pageExists(wiki, u)));
  const i = results.indexOf(true);
  return i >= 0 ? urls[i] : null;
}

// ---------- Wikiless ----------

const down = new Map(); // instance -> until
const good = new Map(); // instance -> until

function instances() {
  const all = A.WIKILESS_INSTANCES.concat(settings.customWikiless);
  return [...new Set(all)];
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function instanceWorks(instance, parsed) {
  try {
    const r = await fetchLimited(A.wikilessUrl(instance, parsed), PROBE_TIMEOUT, 16384);
    return r.ok && /<html/i.test(r.text) && !/just a moment|attention required|checking your browser/i.test(r.text);
  } catch (e) {
    return false;
  }
}

async function findWikiless(parsed) {
  const now = Date.now();
  const candidates = shuffle(instances().filter((i) => !(down.get(i) > now)));
  // an instance that answered a moment ago: go straight there
  const known = candidates.find((i) => good.get(i) > now);
  if (known) return A.wikilessUrl(known, parsed);
  for (const inst of candidates.slice(0, 4)) {
    if (await instanceWorks(inst, parsed)) {
      good.set(inst, Date.now() + GOOD_TTL);
      return A.wikilessUrl(inst, parsed);
    }
    down.set(inst, Date.now() + DOWN_TTL);
  }
  return null; // nothing is up: stay on Wikipedia
}

// ---------- resolving ----------

async function resolveTarget(parsed) {
  for (const id of A.wikiOrder(settings)) {
    const wiki = A.getWiki(id);
    if (!wiki) continue;
    const url = wiki.proxy ? await findWikiless(parsed) : await findInWiki(wiki, parsed);
    if (url) return url;
  }
  return null;
}

// ---------- navigation ----------

const seq = new Map(); // tabId -> counter, so a newer navigation cancels an older answer
const backForward = new Map(); // tabId -> url the user reached with Back/Forward
const redirected = new Map(); // tabId -> { from, target }: the last redirect in that tab

const stripHash = (u) => String(u).replace(/#.*$/, "");

api.webNavigation.onCommitted.addListener(
  (d) => {
    if (d.frameId !== 0) return;
    if ((d.transitionQualifiers || []).includes("forward_back")) backForward.set(d.tabId, d.url);
  },
  { url: [{ hostSuffix: "wikipedia.org" }] }
);

api.webNavigation.onBeforeNavigate.addListener(
  async (d) => {
    if (d.frameId !== 0) return;
    const n = (seq.get(d.tabId) || 0) + 1;
    seq.set(d.tabId, n);
    await ready;
    if (!settings.enabled) return;
    const parsed = A.parseWikipediaUrl(d.url);
    if (!parsed) return;
    // Coming from the alternative page we sent this tab to, back to the Wikipedia article it replaced
    // (Back button, or a link on that page): let the user have Wikipedia this once.
    const rec = redirected.get(d.tabId);
    if (rec && stripHash(d.url) === rec.from) {
      try {
        const tab = await api.tabs.get(d.tabId);
        if (tab.url && stripHash(tab.url) === stripHash(rec.target)) { redirected.delete(d.tabId); return; }
      } catch (e) {}
    }
    const target = await resolveTarget(parsed);
    if (!target) return;
    if (seq.get(d.tabId) !== n) return; // the user went somewhere else meanwhile
    if (backForward.get(d.tabId) === d.url) { // Back to an article we redirected away from: let it be
      backForward.delete(d.tabId);
      return;
    }
    redirected.set(d.tabId, { from: stripHash(d.url), target });
    api.tabs.update(d.tabId, { url: target }).catch(() => {});
  },
  { url: [{ hostSuffix: "wikipedia.org" }] }
);

api.tabs.onRemoved.addListener((id) => { seq.delete(id); backForward.delete(id); redirected.delete(id); });

// ---------- messages from the settings page ----------

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "probe") {
    (async () => {
      await ready;
      const sample = { lang: "en", rawLang: "en", title: "Wikipedia", hash: "" };
      const out = await Promise.all(instances().map(async (instance) => {
        const t0 = Date.now();
        const ok = await instanceWorks(instance, sample);
        if (ok) { good.set(instance, Date.now() + GOOD_TTL); down.delete(instance); } else down.set(instance, Date.now() + DOWN_TTL);
        return { instance, ok, ms: Date.now() - t0 };
      }));
      sendResponse(out);
    })();
    return true;
  }
});
