<p align="center"><img src="icons/icon-128.png" width="96" alt="Altwiki icon"></p>

<h1 align="center">Altwiki</h1>

A browser extension (Chrome and Firefox, Manifest V3) that opens Wikipedia articles on an alternative wiki instead. When you open a Wikipedia article, Altwiki checks whether your chosen wiki has an article on the same topic in the same language. If it does, you are sent there. If it does not, you stay on Wikipedia.

## What it does

- **Pick one wiki, or several with priorities.** The default is a single wiki. In priority mode the first ticked wiki is asked first, the second only if the first has no article, and so on.
- **Default: a random working Wikiless instance.** [Wikiless](https://github.com/Metastem/Wikiless) is a privacy front end for Wikipedia. Altwiki picks a random public instance, skips the ones that are down, and if none answers you stay on Wikipedia. You can add your own instances.
- **Same language.** `de.wikipedia.org` goes to the German edition of a wiki, never to an English article. Wikis that only exist in one language are skipped for the others.
- **Only real article views.** Edit, history, talk, special pages, files, categories and `?redirect=no` links are left alone. Add `?altwiki=off` to any Wikipedia link to skip the redirect.
- **Back button works.** After a redirect, Back takes you to the Wikipedia page once and does not send you away again.

## Wikis

| Wiki | Address | Languages | Main distinction |
| --- | --- | --- | --- |
| Wikiless (default) | various | all | Privacy front end for Wikipedia |
| Justapedia | justapedia.org | en | Broad encyclopedia intended as an alternative to Wikipedia's editorial approach |
| Citizendium | citizendium.org | en | General encyclopedia with expert involvement |
| RationalWiki | rationalwiki.org | en | Skepticism, pseudoscience, religion, politics and critical commentary |
| Conservapedia | conservapedia.com | en | Conservative Christian perspective |
| Metapedia | metapedia.org | many | Far-right, nationalist and ethnonationalist perspective |
| Grokipedia | grokipedia.com | en | AI-generated encyclopedia associated with xAI |
| HandWiki | handwiki.org | en | Science, mathematics, computing and other technical topics |
| Ruwiki | ru.ruwiki.ru | ru | Russian-language encyclopedia |
| Baidu Baike | baike.baidu.com | zh | Large Chinese-language encyclopedia |
| Baike.com | baike.com | zh | Chinese-language collaborative reference work |
| Everipedia | everipedia.io | en | Wikipedia-derived project; new address, article paths are unverified |

## Limits

- An article is only found when it has the same title as on Wikipedia. HandWiki titles carry a topic prefix (for example `Physics:`), so Altwiki also tries the common prefixes.
- A wiki is judged to have the article when the page answers normally and does not show the usual "no such page" text. Sites that handle missing pages in an unusual way (Grokipedia, Baidu Baike, Baike.com, Everipedia) are checked with extra rules that may need adjusting when the sites change.
- Altwiki asks the wikis for the page before redirecting, so a redirect can take a moment. Answers are remembered for a while.

## Privacy

Altwiki sends no data anywhere except the requests that check whether an alternative wiki has an article: the address of that article on that wiki (and, for Wikiless, on an instance). Settings are stored in the browser and never leave it. There is no analytics and no account.

## Install

### Firefox

Install the `-firefox.zip` from the [latest release](https://github.com/BakuretsuBaka/Altwiki/releases/latest) as a temporary add-on: open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and select the zip. Temporary add-ons are removed when Firefox closes. A listing on Firefox Add-ons is planned.

### Chrome, Edge, Brave and other Chromium browsers

Altwiki is not in the Chrome Web Store, so you install it by hand from the [latest release](https://github.com/BakuretsuBaka/Altwiki/releases/latest):

1. Download `Altwiki-<version>-chromium.zip` from the release page (under "Assets").
2. Unzip it into a folder you will keep, for example `Documents/Altwiki`. The browser reads the extension from that folder every time it starts, so do not delete it afterwards.
3. Open `chrome://extensions` (in Edge `edge://extensions`, in Brave `brave://extensions`) and switch on "Developer mode" in the top right.
4. Click "Load unpacked" and select the unzipped folder, the one that contains `manifest.json`.

The extension does not update itself this way. To update, download the new zip from the [releases page](https://github.com/BakuretsuBaka/Altwiki/releases), unzip it over the old folder and click the reload button on the extension's card in `chrome://extensions`.

### From source

Clone this repository and load the folder directly ("Load unpacked" in Chromium browsers, or `manifest.json` as a temporary add-on in Firefox), or build the packages yourself with `python3 tools/build.py`.

## Development

- `shared.js` holds the wiki list, the URL parsing and the settings logic. `background.js` does the redirecting and the existence checks. `options.*` and `popup.*` are the settings page and the toolbar popup.
- `npm test` runs the unit tests. `python3 tools/build.py` writes the Firefox and Chromium packages to `dist/`. `python3 tools/make_icons.py` redraws the icon.
- To add a wiki, add an entry to `WIKIS` in `shared.js` (address pattern, languages, `origins`) and run the tests: they check that `manifest.json` has the matching host permissions.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
