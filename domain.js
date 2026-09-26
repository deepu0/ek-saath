// domain.js - root domain parser, no external deps
// Public suffixes that are more than one label. Not the full Public Suffix List (kept tiny on purpose):
// the common country second levels, plus hosting platforms where every subdomain is a different owner
// (alice.github.io and bob.github.io must not be grouped as "github.io").
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk","org.uk","gov.uk","ac.uk","me.uk","ltd.uk","plc.uk",
  "co.jp","ne.jp","or.jp","ac.jp","go.jp",
  "com.au","net.au","org.au","edu.au","gov.au",
  "co.nz","org.nz","net.nz",
  "co.in","org.in","net.in","gov.in","ac.in","firm.in","gen.in",
  "co.za","org.za",
  "com.br","net.br","org.br","gov.br",
  "com.cn","net.cn","org.cn","gov.cn",
  "co.kr","or.kr","com.sg","com.my","com.hk","com.tw","co.id","co.th","com.ph","com.vn",
  "com.mx","com.ar","com.co","com.pe","com.tr","co.il","com.sa","com.eg","com.ng","com.pk","com.bd","com.ua",
  // hosting platforms
  "github.io","gitlab.io","vercel.app","netlify.app","pages.dev","workers.dev","web.app","firebaseapp.com",
  "herokuapp.com","onrender.com","fly.dev","appspot.com","azurewebsites.net","blogspot.com","wordpress.com",
  "substack.com","notion.site","readthedocs.io","glitch.me","replit.app","surge.sh","neocities.org"
]);

function stripPort(hostname) {
  // hostname from URL.hostname already strips port, but handle raw input
  if (!hostname) return "";
  return hostname.split(":")[0].toLowerCase().trim();
}

function isIp(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[?[a-f0-9:]+\]?$/i.test(host) && host.includes(":");
}

function getRootDomain(hostname) {
  const host = stripPort(hostname);
  if (!host) return "";
  if (host === "localhost" || isIp(host)) return host;
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  // check for known two-level suffix
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) {
    // e.g. example.co.uk -> return last 3
    if (parts.length >= 3) return parts.slice(-3).join(".");
    return host;
  }
  // default: last 2 labels = root domain
  return parts.slice(-2).join(".");
}

function getHostFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isProtectedUrl(url) {
  if (!url) return true;
  // The new tab page can be grouped ("newtab"); every other browser/system page keeps its place.
  if (url.startsWith("chrome://newtab")) return false;
  return /^(chrome|chrome-extension|chrome-search|chrome-untrusted|devtools|edge|brave|opera|vivaldi|about|view-source):/.test(url);
}

function getKeyForUrl(url, groupByRoot) {
  if (!url) return null;
  if (url.startsWith("chrome://newtab")) return "newtab";
  const host = getHostFromUrl(url);
  if (!host) {
    try { return new URL(url).protocol.replace(":",""); } catch { return null; }
  }
  return groupByRoot ? getRootDomain(host) : host;
}

// A tab showing one of these hasn't reached the page the user asked for yet.
function isBlankUrl(url) {
  if (!url) return true;
  return url === "about:blank" ||
         url.startsWith("chrome://newtab") ||
         url.startsWith("chrome-search://local-ntp") ||
         url.startsWith("edge://newtab");
}

function isNeverDedupeUrl(url, whitelist = []) {
  if (!url) return true;
  if (url.startsWith("chrome://newtab")) return true;
  const host = getHostFromUrl(url);
  if (host === "localhost" || host === "127.0.0.1") return true;
  const root = host ? getRootDomain(host) : "";
  for (const w of whitelist) {
    const ww = w.trim().toLowerCase();
    if (!ww) continue;
    if (host === ww || root === ww || url.toLowerCase().includes(ww)) return true;
  }
  return false;
}

// For testing in Node
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getRootDomain, getHostFromUrl, isProtectedUrl, stripPort, getKeyForUrl, isNeverDedupeUrl, isBlankUrl };
}
