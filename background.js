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
    return { ok: res.ok, status: res.status, url: res.url, text, challenge: res.headers.get("cf-mitigated") === "challenge" };
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
  if (hit && Date.now() - hit.at < (hit.ok ? HIT_TTL : MISS_TTL)) return hit;
  let ok = false, why = "";
  try {
    const r = await fetchLimited(url, FETCH_TIMEOUT, 65536);
    const chk = wiki.check || {};
    ok = r.ok && sameSite(r.url, url);
    // only a clear "not found" counts as missing; a site that blocks the check or answers oddly is given the benefit of the doubt
    if (!r.ok) {
      const gone = r.status === 404 || r.status === 410;
      ok = !gone;
      why = gone ? "HTTP " + r.status + " (no such article)" : (r.challenge ? "bot check page" : "HTTP " + r.status) + ", could not check, redirecting anyway";
    } else if (!ok) { ok = true; why = "redirected to another site (" + hostOf(r.url) + "), could not check, redirecting anyway"; }
    if (ok && chk.missingUrl && chk.missingUrl.test(r.url)) { ok = false; why = "no such article (redirected to " + r.url + ")"; }
    if (ok && chk.missingBody && chk.missingBody.test(r.text)) { ok = false; why = "page says the article does not exist"; }
    if (ok && !wiki.check && A.MW_MISSING.test(r.text)) { ok = false; why = "page says the article does not exist"; }
    if (ok && !why) why = "found";
  } catch (e) {
    ok = true;
    why = "request failed (" + ((e && e.name) || "error") + ": " + ((e && e.message) || "") + "), could not check, redirecting anyway";
  }
  const res = { at: Date.now(), ok, why };
  cache.set(url, res);
  return res;
}

async function findInWiki(wiki, parsed, trace) {
  const urls = A.candidateUrls(wiki, parsed);
  if (!urls.length) return null;
  const results = await Promise.all(urls.map((u) => pageExists(wiki, u)));
  if (trace) urls.forEach((u, k) => trace.push(wiki.name + " " + u + ": " + results[k].why));
  const i = results.findIndex((r) => r.ok);
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

const CHALLENGE = /just a moment|attention required|checking your browser|anubis|making sure you.re not a bot/i;

// { ok, why }. A bot-check page counts as reachable: a real browser tab solves it, a background fetch cannot.
async function instanceWorks(instance, parsed) {
  try {
    const r = await fetchLimited(A.wikilessUrl(instance, parsed), PROBE_TIMEOUT, 16384);
    if (r.challenge || CHALLENGE.test(r.text)) return { ok: true, why: "bot check (the browser will handle it)" };
    if (!r.ok) return { ok: false, why: "HTTP " + r.status };
    if (!/<html/i.test(r.text)) return { ok: false, why: "no page in the answer" };
    return { ok: true, why: "ok" };
  } catch (e) {
    return { ok: false, why: e && e.name === "AbortError" ? "timeout" : "no connection (blocked or down)" };
  }
}

async function findWikiless(parsed, trace) {
  const now = Date.now();
  const all = instances();
  const skipped = all.filter((i) => down.get(i) > now);
  if (skipped.length) trace.push("recently down, skipped: " + skipped.map(hostOf).join(", "));
  const candidates = shuffle(all.filter((i) => !(down.get(i) > now)));
  // an instance that answered a moment ago: go straight there
  const known = candidates.find((i) => good.get(i) > now);
  if (known) { trace.push(hostOf(known) + ": answered recently"); return A.wikilessUrl(known, parsed); }
  // ask a few at a time (the first answer wins), so one slow instance does not hold the page up
  for (let i = 0; i < candidates.length; i += 3) {
    const batch = candidates.slice(i, i + 3);
    const results = await Promise.all(batch.map((inst) => instanceWorks(inst, parsed)));
    let winner = null;
    batch.forEach((inst, k) => {
      trace.push(hostOf(inst) + ": " + results[k].why);
      if (results[k].ok) { if (!winner) winner = inst; good.set(inst, Date.now() + GOOD_TTL); }
      else down.set(inst, Date.now() + DOWN_TTL);
    });
    if (winner) return A.wikilessUrl(winner, parsed);
  }
  return null; // nothing is up: stay on Wikipedia
}

function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return u; } }

// ---------- resolving ----------

async function resolveTarget(parsed, trace) {
  for (const id of A.wikiOrder(settings)) {
    const wiki = A.getWiki(id);
    if (!wiki) continue;
    if (!wiki.proxy && !A.candidateUrls(wiki, parsed).length) { trace.push(wiki.name + ": does not cover language " + parsed.lang); continue; }
    let url;
    if (wiki.proxy) url = await findWikiless(parsed, trace);
    else if (settings.mode !== "priority") url = A.candidateUrls(wiki, parsed)[0] || null; // one wiki: go straight there
    else url = await findInWiki(wiki, parsed, trace);
    trace.push(wiki.name + ": " + (url ? "found" : wiki.proxy ? "no instance answered" : "no such article"));
    if (url) return url;
  }
  return null;
}

// ---------- log (shown in the popup, helps when a redirect does not happen) ----------

async function log(entry) {
  try {
    const res = await api.storage.local.get("log");
    const list = ((res && res.log) || []).slice(-19);
    list.push(Object.assign({ t: new Date().toISOString() }, entry));
    await api.storage.local.set({ log: list });
  } catch (e) {}
}

async function hasPermission() {
  try { return await api.permissions.contains({ origins: A.allOrigins() }); } catch (e) { return null; }
}

// ---------- navigation ----------

const seq = new Map(); // tabId -> counter, so a newer navigation cancels an older answer
const backForward = new Map(); // tabId -> url the user reached with Back/Forward
const redirected = new Map(); // tabId -> { from, full, target }: the last redirect in that tab
const sessionStore = api.storage.session || null; // survives the background script being unloaded

function setRec(tabId, rec) {
  redirected.set(tabId, rec);
  if (sessionStore) sessionStore.set({ ["rec" + tabId]: rec }).catch(() => {});
}
async function getRec(tabId) {
  if (redirected.has(tabId)) return redirected.get(tabId);
  if (!sessionStore) return null;
  try { const r = await sessionStore.get("rec" + tabId); return (r && r["rec" + tabId]) || null; } catch (e) { return null; }
}
function dropRec(tabId) {
  redirected.delete(tabId);
  if (sessionStore) sessionStore.remove("rec" + tabId).catch(() => {});
}

const stripHash = (u) => String(u).replace(/#.*$/, "");

const lastSeen = new Map(); // tabId -> { url, at }: navigations onBeforeNavigate already looked at

async function handleNavigation(d) {
  const n = (seq.get(d.tabId) || 0) + 1;
  seq.set(d.tabId, n);
  await ready;
  if (!settings.enabled) return;
  const parsed = A.parseWikipediaUrl(d.url);
  if (!parsed) return;
  // Coming from the alternative page we sent this tab to, back to the Wikipedia article it replaced
  // (Back button, or a link on that page): let the user have Wikipedia this once.
  const rec = await getRec(d.tabId);
  if (rec && rec.fellBack && stripHash(d.url) === rec.from) { dropRec(d.tabId); return; } // the way back from a wiki without the article
  if (rec && stripHash(d.url) === rec.from) {
    try {
      const tab = await api.tabs.get(d.tabId);
      if (tab.url && stripHash(tab.url) === stripHash(rec.target)) { dropRec(d.tabId); return; }
    } catch (e) {}
  }
  const trace = [];
  const target = await resolveTarget(parsed, trace);
  if (!target) {
    if (trace.length && (await hasPermission()) === false) trace.unshift("access to the wikis is not granted (open the settings page and click Grant access)");
    log({ page: d.url, result: "stayed on Wikipedia", trace });
    return;
  }
  if (seq.get(d.tabId) !== n) return; // the user went somewhere else meanwhile
  if (backForward.get(d.tabId) === d.url) { // Back to an article we redirected away from: let it be
    backForward.delete(d.tabId);
    return;
  }
  setRec(d.tabId, { from: stripHash(d.url), full: d.url, target });
  log({ page: d.url, result: "redirected to " + target, trace });
  api.tabs.update(d.tabId, { url: target }).catch(() => {});
}

const WIKIPEDIA_FILTER = { url: [{ hostSuffix: "wikipedia.org" }] };

api.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId !== 0) return;
  lastSeen.set(d.tabId, { url: d.url, at: Date.now() });
  return handleNavigation(d);
}, WIKIPEDIA_FILTER);

// A page reached through an HTTP redirect (a search engine's tracking link, a short link) never shows up in
// onBeforeNavigate with its final address, only here. Pages onBeforeNavigate already handled are skipped.
api.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  const q = d.transitionQualifiers || [];
  if (q.includes("forward_back")) { backForward.set(d.tabId, d.url); return; }
  const seen = lastSeen.get(d.tabId);
  if (seen && seen.url === d.url && Date.now() - seen.at < 30000) return;
  return handleNavigation(d);
}, WIKIPEDIA_FILTER);

api.tabs.onRemoved.addListener((id) => { seq.delete(id); backForward.delete(id); dropRec(id); lastSeen.delete(id); });

// ---------- messages from the settings page ----------

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "missing" && sender && sender.tab) {
    (async () => {
      const tab = sender.tab;
      const rec = await getRec(tab.id);
      // only for a page Altwiki sent this tab to, and only once
      if (!rec || rec.fellBack || !sameSite(tab.url, rec.target)) return;
      // the wiki has no article: back to the Wikipedia article this tab was sent away from
      setRec(tab.id, Object.assign({}, rec, { fellBack: true }));
      log({ page: rec.full, result: "the wiki has no article, back to Wikipedia", trace: [rec.target] });
      api.tabs.update(tab.id, { url: rec.full }).catch(() => {});
    })();
    return;
  }
  if (msg && msg.type === "probe") {
    (async () => {
      await ready;
      const sample = { lang: "en", rawLang: "en", title: "Wikipedia", hash: "" };
      const out = await Promise.all(instances().map(async (instance) => {
        const t0 = Date.now();
        const r = await instanceWorks(instance, sample);
        if (r.ok) { good.set(instance, Date.now() + GOOD_TTL); down.delete(instance); } else down.set(instance, Date.now() + DOWN_TTL);
        return { instance, ok: r.ok, why: r.why, ms: Date.now() - t0 };
      }));
      sendResponse(out);
    })();
    return true;
  }
});

// Firefox does not grant the wikis' addresses on install, and without them the existence check cannot run:
// send the user to the settings page, which has the button for it.
if (api.runtime.onInstalled) api.runtime.onInstalled.addListener(async (d) => {
  if (d.reason !== "install" && d.reason !== "update") return;
  if ((await hasPermission()) === false) api.runtime.openOptionsPage();
});
