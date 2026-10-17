// Runs on the alternative wikis (not on Wikiless). If the wiki shows its "this page has no text" notice,
// the background script is told, and sends the tab back to Wikipedia (when Altwiki put it here).
(function () {
  if (window.top !== window) return;
  const api = typeof browser !== "undefined" ? browser : chrome;
  let sent = false;
  function check() {
    if (sent) return;
    // MediaWiki marks a missing article with this block in every language
    if (document.querySelector(".noarticletext, #noarticletext, .mw-newarticletext")) {
      sent = true;
      try { api.runtime.sendMessage({ type: "missing" }); } catch (e) {}
    }
  }
  check();
  if (!sent && document.readyState !== "complete") window.addEventListener("load", check, { once: true });
})();
