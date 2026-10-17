const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const A = require("../shared.js");

test("parses plain article URLs", () => {
  const p = A.parseWikipediaUrl("https://en.wikipedia.org/wiki/Alan_Turing#Early_life");
  assert.deepStrictEqual({ ...p }, { lang: "en", rawLang: "en", title: "Alan_Turing", hash: "#Early_life" });
  assert.strictEqual(A.parseWikipediaUrl("https://de.m.wikipedia.org/wiki/K%C3%B6ln").title, "Köln");
  assert.strictEqual(A.parseWikipediaUrl("https://en.wikipedia.org/w/index.php?title=Foo%20bar").title, "Foo_bar");
  assert.strictEqual(A.parseWikipediaUrl("https://simple.wikipedia.org/wiki/Cat").lang, "en");
  assert.strictEqual(A.parseWikipediaUrl("https://zh.wikipedia.org/zh-cn/%E4%B8%AD%E5%9B%BD").title, "中国");
  assert.strictEqual(A.parseWikipediaUrl("https://en.wikipedia.org/wiki/Star_Trek:_Voyager").title, "Star_Trek:_Voyager");
});

test("leaves everything that is not an article view alone", () => {
  for (const u of [
    "https://en.wikipedia.org/wiki/Special:Search?search=x",
    "https://en.wikipedia.org/wiki/Talk:Cat",
    "https://de.wikipedia.org/wiki/Diskussion:Katze",
    "https://en.wikipedia.org/wiki/File:Cat.jpg",
    "https://en.wikipedia.org/w/index.php?title=Cat&action=edit",
    "https://en.wikipedia.org/w/index.php?title=Cat&oldid=123",
    "https://en.wikipedia.org/wiki/Cat?redirect=no",
    "https://en.wikipedia.org/wiki/Cat?altwiki=off",
    "https://en.wikipedia.org/wiki/Main_Page",
    "https://www.wikipedia.org/",
    "https://en.wikipedia.org/",
    "https://en.wikipedia.org/w/api.php?action=query",
    "https://example.org/wiki/Cat",
    "https://en.wikipedia.org.evil.example/wiki/Cat",
    "ftp://en.wikipedia.org/wiki/Cat"
  ]) assert.strictEqual(A.parseWikipediaUrl(u), null, u);
});

test("builds target URLs in the right scheme and language", () => {
  const p = A.parseWikipediaUrl("https://de.wikipedia.org/wiki/K%C3%B6ln");
  assert.deepStrictEqual(A.candidateUrls(A.getWiki("conservapedia"), p), []);
  assert.deepStrictEqual(A.candidateUrls(A.getWiki("justapedia"), p), []); // English only
  assert.deepStrictEqual(A.candidateUrls(A.getWiki("metapedia"), p), ["https://de.metapedia.org/wiki/K%C3%B6ln"]);
  const en = A.parseWikipediaUrl("https://en.wikipedia.org/wiki/Quantum_mechanics#History");
  assert.strictEqual(A.candidateUrls(A.getWiki("handwiki"), en)[0], "https://handwiki.org/wiki/Quantum_mechanics#History");
  assert.ok(A.candidateUrls(A.getWiki("handwiki"), en).includes("https://handwiki.org/wiki/Physics:Quantum_mechanics#History"));
  const zh = A.parseWikipediaUrl("https://zh.wikipedia.org/wiki/Python_(programming_language)");
  assert.strictEqual(A.candidateUrls(A.getWiki("baidubaike"), zh)[0], "https://baike.baidu.com/item/Python%20(programming%20language)");
  assert.strictEqual(A.wikilessUrl("https://wikiless.example/", p), "https://wikiless.example/wiki/K%C3%B6ln?lang=de");
});

test("settings are cleaned up", () => {
  const d = A.mergeSettings();
  assert.strictEqual(d.wiki, "wikiless");
  assert.strictEqual(d.mode, "single");
  assert.deepStrictEqual(A.wikiOrder(d), ["wikiless"]);
  assert.strictEqual(d.priority.length, A.WIKIS.length);
  const s = A.mergeSettings({ mode: "priority", wiki: "nope", priority: [{ id: "rationalwiki", on: true }, { id: "bogus", on: true }, { id: "justapedia", on: true }], customWikiless: ["http://plain.example", "wl.example.org/", "junk"] });
  assert.strictEqual(s.wiki, "wikiless");
  assert.deepStrictEqual(A.wikiOrder(s), ["rationalwiki", "justapedia"]);
  assert.strictEqual(s.priority.length, A.WIKIS.length);
  assert.deepStrictEqual(s.customWikiless, ["https://wl.example.org"]);
});

test("manifest permissions cover every wiki", () => {
  const m = JSON.parse(fs.readFileSync(__dirname + "/../manifest.json", "utf8"));
  assert.deepStrictEqual([...m.host_permissions].sort(), A.allOrigins().sort());
  for (const w of A.WIKIS) for (const c of A.candidateUrls(w, { lang: "en", rawLang: "en", title: "X", hash: "" })) {
    const u = new URL(c);
    assert.ok(m.host_permissions.some((p) => new RegExp("^" + p.replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$").test(u.origin + "/x")), c);
  }
  assert.ok(m.permissions.includes("webNavigation"));
  // the "no text" detector runs on every wiki except the Wikiless instances
  const cs = m.content_scripts[0].matches.sort();
  const want = [...new Set(A.WIKIS.filter((w) => !w.proxy).flatMap((w) => w.origins))].sort();
  assert.deepStrictEqual(cs, want);
});
