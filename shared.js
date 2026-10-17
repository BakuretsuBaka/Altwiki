// Shared by the background script, the settings page, the popup and the tests.
(function (root) {
  "use strict";

  // Wikiless is a privacy front end for Wikipedia. These public instances come and go,
  // so the background script checks them before it sends you anywhere.
  const WIKILESS_INSTANCES = [
    "https://wikiless.com",
    "https://wikiless.org",
    "https://wikiless.tiekoetter.com",
    "https://wikiless.whateveritworks.org",
    "https://wikiless.v4nt.com",
    "https://wiki.nerdvpn.de"
  ];

  const METAPEDIA_LANGS = ["en", "de", "fr", "es", "it", "pt", "ru", "sv", "da", "no", "fi", "nl", "hu", "ro", "bg", "hr", "el", "et", "pl", "ca", "cs", "sk", "sl", "sr", "tr", "uk", "lv", "lt"];

  const MW_MISSING = /noarticletext|mw-newarticletext|"wgArticleId":0[,}]/;

  // url(lang, title): where the article would live. langs: the Wikipedia language codes the wiki covers.
  // check: how to tell that the page exists. "mediawiki" = HTTP status plus the usual "no such page" markers.
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
      id: "scholarpedia",
      name: "Scholarpedia",
      home: "https://www.scholarpedia.org/",
      langs: ["en"],
      note: "Expert-authored, peer-reviewed scientific articles.",
      url: (l, t) => `https://www.scholarpedia.org/article/${t}`,
      origins: ["https://www.scholarpedia.org/*", "https://scholarpedia.org/*"]
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
      id: "infogalactic",
      name: "Infogalactic",
      home: "https://infogalactic.com/",
      langs: ["en"],
      note: "Alternative encyclopedia project associated with criticism of Wikipedia.",
      url: (l, t) => `https://infogalactic.com/info/${t}`,
      origins: ["https://infogalactic.com/*"]
    },
    {
      id: "grokipedia",
      name: "Grokipedia",
      home: "https://grokipedia.com/",
      langs: ["en"],
      note: "AI-generated encyclopedia associated with xAI.",
      url: (l, t) => `https://grokipedia.com/page/${t}`,
      check: { missingBody: /<title>[^<]*(not found|404)/i },
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
      id: "pluspedia",
      name: "PlusPedia",
      home: "https://pluspedia.org/",
      langs: ["de"],
      note: "German-language general-purpose alternative.",
      url: (l, t) => `https://pluspedia.org/wiki/${t}`,
      origins: ["https://pluspedia.org/*"]
    },
    {
      id: "ecured",
      name: "EcuRed",
      home: "https://www.ecured.cu/",
      langs: ["es"],
      note: "Spanish-language encyclopedia associated with Cuba.",
      url: (l, t) => `https://www.ecured.cu/${t}`,
      origins: ["https://www.ecured.cu/*", "https://ecured.cu/*"]
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
      check: { missingBody: /尚未收录词条|词条不存在/, missingUrl: /\/search\/none|wappass|captcha/i },
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
      check: { missingBody: /暂无词条|词条不存在|没有找到.{0,6}词条/ },
      origins: ["https://www.baike.com/*", "https://baike.com/*"]
    },
    {
      id: "everipedia",
      name: "Everipedia",
      home: "https://everipedia.org/",
      langs: ["en"],
      note: "Wikipedia-derived project. The site has moved around, so articles may not resolve.",
      url: (l, t) => `https://everipedia.org/wiki/lang_en/${t}`,
      origins: ["https://everipedia.org/*"]
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

  const api = { WIKIS, WIKILESS_INSTANCES, DEFAULTS, MW_MISSING, parseWikipediaUrl, encodeTitle, getWiki, supportsLang, candidateUrls, wikilessUrl, mergeSettings, normalizeInstance, wikiOrder, allOrigins };
  root.Altwiki = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
