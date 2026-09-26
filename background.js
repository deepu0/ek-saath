importScripts("domain.js", "reorder.js");

let isReordering = false;
let debounceTimer = null;
const DEBOUNCE_MS = 800;
const DEDUPE_UNDO_MS = 10000;
const BULK_UNDO_MS = 30000;
const ACCENT = "#FF3B1F";

async function getSettings() {
  const defaults = {
    groupByRoot: true,
    autoReorder: false,
    scopeAllWindows: false,
    dedupeEnabled: false,
    dedupeWhitelist: []
  };
  const data = await chrome.storage.local.get(defaults);
  if (typeof data.dedupeWhitelist === "string") {
    data.dedupeWhitelist = data.dedupeWhitelist.split(",").map(s=>s.trim()).filter(Boolean);
  }
  return { ...defaults, ...data };
}

function flashBadge(text, ms = 1200) {
  chrome.action.setBadgeBackgroundColor({ color: ACCENT });
  chrome.action.setBadgeText({ text });
  setTimeout(()=> chrome.action.setBadgeText({ text: "" }), ms);
}

async function currentWindowId() {
  const win = await chrome.windows.getCurrent();
  return win.id;
}

async function doReorder(trigger = "manual") {
  if (isReordering) return { ok: false, busy: true };
  isReordering = true;
  try {
    const s = await getSettings();
    const result = s.scopeAllWindows
      ? await reorderAllWindows({ groupByRoot: s.groupByRoot })
      : await reorderWindow(await currentWindowId(), { groupByRoot: s.groupByRoot });
    if (result && result.groups) await chrome.storage.local.set({ lastGroups: result.groups });
    flashBadge("✓");
    return { ok: true, moved: result.moved, groups: result.groups };
  } catch (e) {
    console.error(`reorder (${trigger}) failed`, e);
    flashBadge("!", 1500);
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    isReordering = false;
  }
}

async function doUndo() {
  const s = await getSettings();
  try {
    const res = s.scopeAllWindows ? await undoAllWindows() : await undoWindow(await currentWindowId());
    if (res.error) { flashBadge("!"); return { ok: false, error: res.error }; }
    flashBadge("↩");
    return { ok: true, restored: res.restored };
  } catch (e) {
    flashBadge("!");
    return { ok: false, error: String(e && e.message || e) };
  }
}

// ---------- Dedupe on open
// Only a tab the user just OPENED is deduped, once, on its first real page load.
// Navigating inside an existing tab (links, typing a URL, back/forward, SPA route changes) never closes it.
// Pending new tabs live in storage.session so they survive a service-worker restart.
const PENDING_KEY = "dedupePending";
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
// Set synchronously in onCreated. Chromium can emit onUpdated before the async storage write finishes.
const knownNewTabs = new Set();

async function getPending() {
  const d = await chrome.storage.session.get(PENDING_KEY);
  return d[PENDING_KEY] || {};
}
let pendingLock = Promise.resolve();
function updatePending(fn) {   // serialise read-modify-write so concurrent events can't drop entries
  const run = pendingLock.then(async()=>{
    const p = await getPending();
    const out = await fn(p);
    await chrome.storage.session.set({ [PENDING_KEY]: p });
    return out;
  });
  pendingLock = run.catch(()=>{});
  return run;
}

// Tabs EkSaath itself reopens (undo) must not be deduped straight back.
const ownCreates = new Map();   // url -> expiry
function expectOwnCreate(url) { ownCreates.set(url, Date.now() + 5000); }
function isOwnCreate(tab) {
  const url = tab.pendingUrl || tab.url;
  const exp = ownCreates.get(url);
  if (exp && exp > Date.now()) { ownCreates.delete(url); return true; }
  return false;
}
const STARTUP_GRACE_MS = 20000;   // tabs brought back by session restore are not "just opened"

function markNewTab(tab) {
  if (tab.pinned || isOwnCreate(tab)) return;
  knownNewTabs.add(tab.id);
  // enqueue synchronously so this always runs before the tab's first onUpdated check
  return updatePending(async p => {
    const s = await getSettings();
    if (!s.dedupeEnabled) return;
    const { startupAt = 0 } = await chrome.storage.session.get("startupAt");
    const now = Date.now();
    if (now - startupAt < STARTUP_GRACE_MS) return;
    for (const [id, at] of Object.entries(p)) if (now - at > PENDING_MAX_AGE_MS) delete p[id];
    p[tab.id] = now;
  });
}

async function checkNewTab(tabId) {
  // The in-memory mark covers the onCreated/onUpdated race. The session value covers a worker restart.
  const isNew = knownNewTabs.has(tabId) || await updatePending(p => !!p[tabId]);
  if (!isNew) return;
  // Read the tab now instead of trusting the event: events can carry a URL from before a redirect.
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return; }
  const url = tab.url;
  // Not loaded yet, or still on the new-tab page / about:blank — keep waiting for the real page.
  if (tab.status !== "complete" || isBlankUrl(url)) return;
  const pendingAt = await updatePending(p => { const at = p[tabId]; delete p[tabId]; return at; });
  knownNewTabs.delete(tabId);
  if (!pendingAt || Date.now() - pendingAt > PENDING_MAX_AGE_MS) return;
  const s = await getSettings();
  if (!s.dedupeEnabled || tab.pinned || isNeverDedupeUrl(url, s.dedupeWhitelist)) return;
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  const existing = tabs
    .filter(t => t.id !== tabId && !t.pinned && t.url === url)
    .sort((a, b) => a.index - b.index)[0];
  if (!existing) return;
  await chrome.tabs.update(existing.id, { active: true });
  await chrome.tabs.remove(tabId);
  flashBadge("dup", 1500);
  await chrome.storage.local.set({ lastDedupe: { url, closedAt: Date.now(), windowId: tab.windowId, index: tab.index } });
}

async function undoDedupe() {
  const d = await chrome.storage.local.get("lastDedupe");
  const last = d.lastDedupe;
  await chrome.storage.local.remove("lastDedupe");
  if (!last || Date.now() - last.closedAt > DEDUPE_UNDO_MS) return { error: "expired" };
  await createTabBack({ url: last.url, windowId: last.windowId, index: last.index }, true);
  return { ok: true };
}

// ---------- Bulk close duplicates
function dupScopeQuery(s, windowId) { return s.scopeAllWindows ? {} : { windowId }; }

function findDuplicates(tabs, whitelist) {
  // group by exact URL per window scope, keep the oldest (lowest window, then lowest index)
  const sorted = [...tabs].sort((a, b) => a.windowId - b.windowId || a.index - b.index);
  const seen = new Set();
  const extra = [];
  for (const t of sorted) {
    if (t.pinned || !t.url || isNeverDedupeUrl(t.url, whitelist)) continue;
    if (seen.has(t.url)) extra.push(t); else seen.add(t.url);
  }
  return extra;
}

async function bulkCloseDuplicates() {
  const s = await getSettings();
  const tabs = await chrome.tabs.query(dupScopeQuery(s, await currentWindowId()));
  const toClose = findDuplicates(tabs, s.dedupeWhitelist);
  if (toClose.length === 0) return { closed: 0, groups: 0 };
  // remember where each tab was so undo puts it back in the same window and position
  const closed = toClose.map(t => ({ url: t.url, windowId: t.windowId, index: t.index }));
  await chrome.tabs.remove(toClose.map(t => t.id));
  await chrome.storage.local.set({ lastBulkClosed: { tabs: closed, urls: closed.map(t => t.url), closedAt: Date.now() } });
  flashBadge(String(toClose.length), 2000);
  return { closed: toClose.length, groups: new Set(toClose.map(t => t.url)).size };
}

async function windowExists(windowId) {
  try { await chrome.windows.get(windowId); return true; } catch { return false; }
}

// Reopen a closed tab where it was. `recreated` maps a window that no longer exists to the window made
// for it during this undo: closing a window's last tab closes the window, so undo brings the window back.
async function createTabBack({ url, windowId, index }, active, recreated = new Map()) {
  expectOwnCreate(url);
  if (windowId != null && recreated.has(windowId)) {
    return await chrome.tabs.create({ url, windowId: recreated.get(windowId), active });
  }
  if (windowId != null && await windowExists(windowId)) {
    return await chrome.tabs.create({ url, windowId, index, active });
  }
  if (windowId != null) {
    const w = await chrome.windows.create({ url, focused: active });
    recreated.set(windowId, w.id);
    return w.tabs && w.tabs[0];
  }
  return await chrome.tabs.create({ url, active });
}

async function undoBulkClose() {
  const d = await chrome.storage.local.get("lastBulkClosed");
  const last = d.lastBulkClosed;
  await chrome.storage.local.remove("lastBulkClosed");
  if (!last || Date.now() - last.closedAt > BULK_UNDO_MS) return { error: "expired" };
  const items = last.tabs || last.urls.map(url => ({ url }));   // `urls` = data saved by 1.2.x
  // ascending index per window: each insert lands exactly where the tab used to be
  const ordered = [...items].sort((a, b) => (a.windowId ?? 0) - (b.windowId ?? 0) || (a.index ?? 0) - (b.index ?? 0));
  const recreated = new Map();
  for (const t of ordered) await createTabBack(t, false, recreated);
  return { ok: true, restored: ordered.length };
}

async function getDupCount() {
  const s = await getSettings();
  const tabs = await chrome.tabs.query(dupScopeQuery(s, await currentWindowId()));
  const extra = findDuplicates(tabs, s.dedupeWhitelist);
  return { extra: extra.length, groups: new Set(extra.map(t => t.url)).size, total: tabs.length };
}

// ---------- wiring
const HANDLERS = {
  reorder: () => doReorder("popup"),
  undo: () => doUndo(),
  undoDedupe: () => undoDedupe(),
  bulkClose: () => bulkCloseDuplicates(),
  undoBulk: () => undoBulkClose(),
  getDupCount: () => getDupCount(),
  getSettings: () => getSettings()
};
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = HANDLERS[msg && msg.action];
  if (!h) return false;
  h().then(sendResponse, e => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "reorder-tabs") doReorder("shortcut");
});

async function maybeAutoReorder() {
  const s = await getSettings();
  if (!s.autoReorder) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => doReorder("auto"), DEBOUNCE_MS);
}

chrome.runtime.onStartup.addListener(() => { chrome.storage.session.set({ startupAt: Date.now() }); });
chrome.tabs.onCreated.addListener((tab) => {
  markNewTab(tab)?.catch(e => console.warn("dedupe mark failed", e));
  maybeAutoReorder();
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url) maybeAutoReorder();
  // Any load/URL/title change of a newly opened tab: checkNewTab re-reads the tab and acts only once the
  // real page (after redirects) has finished loading. It consumes the tab's mark, so it acts once per tab.
  if (info.status === "complete" || info.url || info.title) checkNewTab(tabId).catch(e => console.warn("dedupe failed", e));
});
chrome.tabs.onRemoved.addListener((tabId) => { knownNewTabs.delete(tabId); updatePending(p => { delete p[tabId]; }); });

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["groupByRoot","autoReorder","scopeAllWindows","dedupeEnabled","dedupeWhitelist"], (v) => {
    if (v.groupByRoot === undefined) chrome.storage.local.set({ groupByRoot: true });
    if (v.autoReorder === undefined) chrome.storage.local.set({ autoReorder: false });
    if (v.scopeAllWindows === undefined) chrome.storage.local.set({ scopeAllWindows: false });
    if (v.dedupeEnabled === undefined) chrome.storage.local.set({ dedupeEnabled: false });
    if (v.dedupeWhitelist === undefined) chrome.storage.local.set({ dedupeWhitelist: [] });
  });
});
