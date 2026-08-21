// domain.js - root domain parser, no external deps
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk","org.uk","gov.uk","ac.uk",
  "co.jp","ne.jp","or.jp",
  "com.au","net.au","org.au",
  "co.nz","co.in","co.za","com.br",
  "com.cn","net.cn","org.cn"
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
  // Allow chrome://newtab to be reordered (group as "newtab"), block only system pages
  if (url.startsWith("chrome://newtab")) return false;
  return url.startsWith("chrome-extension://") ||
         url.startsWith("edge://") ||
         url.startsWith("about:") ||
         url.startsWith("chrome-search://") ||
         url.startsWith("devtools://") ||
         url.startsWith("chrome://extensions") ||
         url.startsWith("chrome://settings") ||
         url.startsWith("chrome://history");
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
  module.exports = { getRootDomain, getHostFromUrl, isProtectedUrl, stripPort };
}
