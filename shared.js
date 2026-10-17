// Shared by the background script, the settings page, the popup and the tests.
(function (root) {
  "use strict";

  // Wikiless is a privacy front end for Wikipedia. These public instances come and go,
  // so the background script checks which one is up before it sends you anywhere.
  const WIKILESS_INSTANCES = [
    "https://wikiless.com",
    "https://wikiless.org",
    "https://wikiless.tiekoetter.com",
    "https://wikiless.whateveritworks.org",
    "https://wikiless.v4nt.com",
    "https://wiki.nerdvpn.de"
  ];

  const METAPEDIA_LANGS = ["en", "de", "fr", "es", "it", "pt", "ru", "sv", "da", "no", "fi", "nl", "hu", "ro", "bg", "hr", "el", "et", "pl", "ca", "cs", "sk", "sl", "sr", "tr", "uk", "lv", "lt"];

  // url(lang, title): where the article would live. langs: the Wikipedia language codes the wiki covers.
  const WIKIS = [
    {
      id: "wikiless",
      name: "Wikiless (random working instance)",
      short: "Wikiless",
      home: "https://wikiless.com/",
      langs: "*",
      note: "Privacy front end for Wikipedia. Picks a random public instance that is up; if none answers you stay on Wikipedia.",
      proxy: true,
      origins: WIKILESS_INSTANCES.map((i) => i + "/*")
    },
    {
      id: "justapedia",
      name: "Justapedia",
      home: "https://justapedia.org/",
      langs: ["en"],
      note: "Broad encyclopedia intended as an alternative to Wikipedia's editorial approach.",
      url: (l, t) => `https://justapedia.org/wiki/${t}`,
      origins: ["https://justapedia.org/*"]
    },
    {
      id: "citizendium",
      name: "Citizendium",
      home: "https://citizendium.org/",
      langs: ["en"],
      note: "General encyclopedia with expert involvement.",
      url: (l, t) => `https://citizendium.org/wiki/${t}`,
      origins: ["https://citizendium.org/*", "https://www.citizendium.org/*"]
    },
    {
      id: "rationalwiki",
      name: "RationalWiki",
      home: "https://rationalwiki.org/",
      langs: ["en"],
      note: "Skepticism, pseudoscience, religion, politics and critical commentary.",
      url: (l, t) => `https://rationalwiki.org/wiki/${t}`,
      origins: ["https://rationalwiki.org/*"]
    },
    {
      id: "conservapedia",
      name: "Conservapedia",
      home: "https://www.conservapedia.com/",
      langs: ["en"],
      note: "Conservative Christian perspective.",
      url: (l, t) => `https://www.conservapedia.com/${t}`,
      origins: ["https://www.conservapedia.com/*", "https://conservapedia.com/*"]
    },
    {
      id: "metapedia",
      name: "Metapedia",
      home: "https://en.metapedia.org/",
      langs: METAPEDIA_LANGS,
      note: "Far-right, nationalist and ethnonationalist perspective. Has its own language editions.",
      url: (l, t) => `https://${l}.metapedia.org/wiki/${t}`,
      origins: ["https://*.metapedia.org/*"]
    },
    {
      id: "grokipedia",
      name: "Grokipedia",
      home: "https://grokipedia.com/",
      langs: ["en"],
      note: "AI-generated encyclopedia associated with xAI.",
      url: (l, t) => `https://grokipedia.com/page/${t}`,
      origins: ["https://grokipedia.com/*"]
    },
    {
      id: "handwiki",
      name: "HandWiki",
      home: "https://handwiki.org/",
      langs: ["en"],
      note: "Science, mathematics, computing and other technical topics. Its titles carry a topic prefix, so Altwiki also tries the common prefixes.",
      url: (l, t) => `https://handwiki.org/wiki/${t}`,
      prefixes: ["Physics:", "Chemistry:", "Biology:", "Astronomy:", "Engineering:", "Software:", "Earth:", "Medicine:", "Philosophy:", "Social:", "Biography:", "Company:", "Organization:", "Place:"],
      origins: ["https://handwiki.org/*"]
    },
    {
      id: "ruwiki",
      name: "Ruwiki",
      home: "https://ru.ruwiki.ru/",
      langs: ["ru"],
      note: "Russian-language encyclopedia.",
      url: (l, t) => `https://ru.ruwiki.ru/wiki/${t}`,
      origins: ["https://ru.ruwiki.ru/*"]
    },
    {
      id: "baidubaike",
      name: "Baidu Baike",
      home: "https://baike.baidu.com/",
      langs: ["zh"],
      note: "Large Chinese-language encyclopedia.",
      titleStyle: "space",
      url: (l, t) => `https://baike.baidu.com/item/${t}`,
      origins: ["https://baike.baidu.com/*"]
    },
    {
      id: "baikecom",
      name: "Baike.com",
      home: "https://www.baike.com/",
      langs: ["zh"],
      note: "Chinese-language collaborative reference work.",
      titleStyle: "space",
      url: (l, t) => `https://www.baike.com/wiki/${t}`,
      origins: ["https://www.baike.com/*", "https://baike.com/*"]
    }
  ];

  const DEFAULTS = {
    enabled: true,
    mode: "single", // "single" | "priority"
    wiki: "wikiless",
    priority: WIKIS.map((w) => ({ id: w.id, on: w.id === "wikiless" })),
    customWikiless: [] // extra instance origins the user added
  };

  // Names of the non-article namespaces on the bigger Wikipedias. Titles with such a prefix are left alone.
  const NAMESPACES = new Set(
    ("special talk user user_talk wikipedia wikipedia_talk file file_talk mediawiki mediawiki_talk template template_talk help help_talk category category_talk portal portal_talk draft draft_talk module module_talk timedtext topic " +
      "spezial diskussion benutzer benutzer_diskussion wikipedia_diskussion datei datei_diskussion vorlage vorlage_diskussion hilfe hilfe_diskussion kategorie kategorie_diskussion portal_diskussion " +
      "spécial discussion utilisateur discussion_utilisateur projet fichier modèle aide catégorie " +
      "especial discusión usuario usuario_discusión wikipedia_discusión archivo plantilla ayuda categoría " +
      "speciale discussioni utente discussioni_utente aiuto categoria " +
      "служебная обсуждение участник обсуждение_участника википедия файл шаблон справка категория " +
      "特殊 讨论 討論 用户 用戶 维基百科 維基百科 文件 檔案 模板 帮助 幫助 分类 分類 " +
      "especial discussão usuário utilizador ficheiro predefinição ajuda categoria").split(" ")
  );

  function normalizeLang(code) {
    code = String(code || "").toLowerCase();
    if (code === "simple") return "en";
    return code;
  }

  // Wikipedia article URL -> { lang, rawLang, title, hash } or null for anything that is not a plain article view.
  function parseWikipediaUrl(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const m = /^([a-z][a-z0-9-]*?)(?:\.m)?\.wikipedia\.org$/i.exec(u.hostname);
    if (!m) return null;
    const rawLang = m[1].toLowerCase();
    if (rawLang === "www" || !/^[a-z]{2,3}(-[a-z]+)*$|^simple$/.test(rawLang)) return null;

    const q = u.searchParams;
    for (const k of ["action", "oldid", "diff", "veaction", "printable", "curid", "altwiki"]) {
      if (q.has(k) && !(k === "action" && q.get("action") === "view")) return null;
    }
    if (q.get("redirect") === "no") return null;

    let title = null;
    let path = u.pathname;
    const variant = /^\/(zh(?:-[a-z]+)?)\/(.+)$/.exec(path); // zh.wikipedia.org/zh-cn/Title
    if (variant) path = "/wiki/" + variant[2];
    if (path.startsWith("/wiki/")) {
      title = path.slice(6);
    } else if (path === "/w/index.php" || path === "/index.php") {
      title = q.get("title");
      if (title === null) return null;
    } else {
      return null;
    }
    try { title = decodeURIComponent(title); } catch (e) { return null; }
    title = title.replace(/ /g, "_").trim();
    if (!title || title === "Main_Page") return null;
    const colon = title.indexOf(":");
    if (colon > 0 && NAMESPACES.has(title.slice(0, colon).toLowerCase())) return null;
    return { lang: normalizeLang(rawLang), rawLang, title, hash: u.hash || "" };
  }

  function encodeTitle(title, style) {
    let t = style === "space" ? title.replace(/_/g, " ") : title;
    return encodeURIComponent(t).replace(/%3A/gi, ":").replace(/%2F/gi, "/");
  }

  // ---------- reading a page the user is on (Wikipedia or one of the alternative wikis) ----------

  function escapeRe(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // One regular expression per wiki, built from its own address pattern, so there is a single source of truth.
  const MARK_L = "\u0001", MARK_T = "\u0002";
  function wikiPattern(wiki) {
    const tpl = wiki.url(MARK_L, MARK_T).replace("//www.", "//");
    const [head, rest] = tpl.split(MARK_T);
    const re = escapeRe(head).replace(MARK_L, "([a-z-]+)") + "([^?#]+)" + escapeRe(rest || "");
    return new RegExp("^" + re + "$", "i");
  }

  // Article address on Wikipedia, on one of the wikis in the list, or on a Wikiless instance
  // -> { lang, rawLang, title, hash, source } where source is "wikipedia" or the wiki id. null otherwise.
  function parseArticleUrl(href, extraInstances) {
    const wp = parseWikipediaUrl(href);
    if (wp) return Object.assign(wp, { source: "wikipedia" });
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.protocol !== "https:") return null;
    const bare = (u.origin + u.pathname).replace("//www.", "//");
    for (const w of WIKIS) {
      if (!w.url) continue;
      const m = wikiPattern(w).exec(bare);
      if (!m) continue;
      const hasLang = hasLangSlot(w);
      const lang = hasLang ? m[1].toLowerCase() : w.langs[0];
      let title = hasLang ? m[2] : m[1];
      try { title = decodeURIComponent(title); } catch (e) { return null; }
      title = title.replace(/ /g, "_").trim();
      for (const p of w.prefixes || []) if (title.startsWith(p)) { title = title.slice(p.length); break; }
      if (!title || !supportsLang(w, lang)) return null;
      return { lang, rawLang: lang, title, hash: u.hash || "", source: w.id };
    }
    for (const inst of WIKILESS_INSTANCES.concat(extraInstances || [])) {
      if (u.origin !== inst.replace(/\/+$/, "") || !u.pathname.startsWith("/wiki/")) continue;
      let title = u.pathname.slice(6);
      try { title = decodeURIComponent(title); } catch (e) { return null; }
      title = title.replace(/ /g, "_").trim();
      if (!title) return null;
      const rawLang = (u.searchParams.get("lang") || "en").toLowerCase();
      return { lang: normalizeLang(rawLang), rawLang, title, hash: u.hash || "", source: "wikiless" };
    }
    return null;
  }

  function hasLangSlot(w) { return w.url(MARK_L, MARK_T).includes(MARK_L); }

  // Where the article could be read instead: Wikipedia (when the page is on a wiki) and every wiki that covers the
  // language, except the one the page is on. { id, name, url } -- url is null for Wikiless (needs a working instance).
  function viewTargets(parsed) {
    const out = [];
    if (parsed.source !== "wikipedia") {
      const raw = parsed.rawLang && /^[a-z]{2,3}(-[a-z]+)*$|^simple$/.test(parsed.rawLang) ? parsed.rawLang : parsed.lang;
      out.push({ id: "wikipedia", name: "Wikipedia", url: `https://${raw}.wikipedia.org/wiki/${encodeTitle(parsed.title)}${parsed.hash}` });
    }
    for (const w of WIKIS) {
      if (w.id === parsed.source) continue;
      if (w.proxy) { out.push({ id: w.id, name: w.short || w.name, url: null }); continue; }
      const urls = candidateUrls(w, parsed);
      if (urls.length) out.push({ id: w.id, name: w.name, url: urls[0] });
    }
    return out;
  }

  function getWiki(id) {
    return WIKIS.find((w) => w.id === id) || null;
  }

  function supportsLang(wiki, lang) {
    return wiki.langs === "*" || wiki.langs.includes(lang);
  }

  // Every URL where this wiki might have the article, most likely first. [] when the language is not covered.
  function candidateUrls(wiki, parsed) {
    if (!wiki.url || !supportsLang(wiki, parsed.lang)) return [];
    const titles = [parsed.title];
    for (const p of wiki.prefixes || []) titles.push(p + parsed.title);
    return titles.map((t) => wiki.url(parsed.lang, encodeTitle(t, wiki.titleStyle)) + parsed.hash);
  }

  function wikilessUrl(instance, parsed) {
    return `${instance.replace(/\/+$/, "")}/wiki/${encodeTitle(parsed.title)}?lang=${encodeURIComponent(parsed.rawLang)}${parsed.hash}`;
  }

  // Normalises stored settings: unknown ids dropped, new wikis appended, bad values replaced by defaults.
  function mergeSettings(stored) {
    const s = Object.assign({}, DEFAULTS, stored || {});
    s.enabled = s.enabled !== false;
    s.mode = s.mode === "priority" ? "priority" : "single";
    if (!getWiki(s.wiki)) s.wiki = DEFAULTS.wiki;
    const seen = new Set();
    const list = [];
    for (const e of Array.isArray(s.priority) ? s.priority : []) {
      if (e && getWiki(e.id) && !seen.has(e.id)) { seen.add(e.id); list.push({ id: e.id, on: !!e.on }); }
    }
    for (const w of WIKIS) if (!seen.has(w.id)) list.push({ id: w.id, on: false });
    s.priority = list;
    s.customWikiless = (Array.isArray(s.customWikiless) ? s.customWikiless : []).map(normalizeInstance).filter(Boolean);
    return s;
  }

  // "https://wiki.example.org/" -> "https://wiki.example.org"; anything that is not a plain https origin -> null
  function normalizeInstance(text) {
    try {
      const u = new URL(String(text).trim().includes("://") ? String(text).trim() : "https://" + String(text).trim());
      if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
      return u.origin;
    } catch (e) { return null; }
  }

  // Wikis to ask, in order, for the current settings.
  function wikiOrder(settings) {
    if (settings.mode === "priority") return settings.priority.filter((e) => e.on).map((e) => e.id);
    return [settings.wiki];
  }

  function allOrigins() {
    const set = new Set(["*://*.wikipedia.org/*"]);
    for (const w of WIKIS) for (const o of w.origins) set.add(o);
    return [...set];
  }

  const api = { WIKIS, WIKILESS_INSTANCES, DEFAULTS, parseWikipediaUrl, parseArticleUrl, viewTargets, encodeTitle, getWiki, supportsLang, candidateUrls, wikilessUrl, mergeSettings, normalizeInstance, wikiOrder, allOrigins };
  root.Altwiki = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
