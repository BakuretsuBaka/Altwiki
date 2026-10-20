// Runs on the alternative wikis (not on Wikiless). If the wiki shows its "this page has no text" notice,
// the background script is told, and sends the tab back to Wikipedia (when Altwiki put it here).
(function () {
  if (window.top !== window) return;
  const api = typeof browser !== "undefined" ? browser : chrome;
  let sent = false;
  // Grokipedia has its own page for unwritten articles: title "Article Not Found", a "Not yet written" label
  // and the sentence "doesn't have an article with this title yet".
  function grokMissing() {
    if (location.hostname !== "grokipedia.com") return false;
    if (/^Article Not Found/i.test(document.title)) return true;
    const main = document.querySelector("main");
    return !!main && /doesn.t have an article with this title yet/i.test(main.textContent || "");
  }
  function check() {
    if (sent) return;
    // MediaWiki marks a missing article with this block in every language
    if (document.querySelector(".noarticletext, #noarticletext, .mw-newarticletext") || grokMissing()) {
      sent = true;
      try { api.runtime.sendMessage({ type: "missing" }); } catch (e) {}
    }
  }
  check();
  if (!sent && document.readyState !== "complete") window.addEventListener("load", check, { once: true });
  // Grokipedia renders client-side parts late: keep watching for a few seconds
  if (!sent && location.hostname === "grokipedia.com") {
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setTimeout(() => obs.disconnect(), 8000);
  }
})();
