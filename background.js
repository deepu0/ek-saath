importScripts("domain.js", "reorder.js");

let isReordering = false;
let debounceTimer = null;
const DEBOUNCE_MS = 800;
let dedupeTimer = null;

async function getSettings() {
  const defaults = {
    groupByRoot: true,
    autoReorder: false,
    scopeAllWindows: false,
    dedupeEnabled: false,
    dedupeWhitelist: []
  };
  const data = await chrome.storage.local.get(defaults);
  // ensure whitelist is array
  if (typeof data.dedupeWhitelist === "string") {
    data.dedupeWhitelist = data.dedupeWhitelist.split(",").map(s=>s.trim()).filter(Boolean);
  }
  return { ...defaults, ...data };
}

async function doReorder(trigger = "manual") {
  if (isReordering) return;
  isReordering = true;
  try {
    const s = await getSettings();
    let result;
    if (s.scopeAllWindows) {
      result = await reorderAllWindows({ groupByRoot: s.groupByRoot });
    } else {
      const win = await chrome.windows.getCurrent();
      if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
      result = await reorderWindow(win.id, { groupByRoot: s.groupByRoot });
      if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
    }
    if (result && result.groups) await chrome.storage.local.set({ lastGroups: result.groups });
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF3B1F" });
    setTimeout(()=> chrome.action.setBadgeText({text:""}), 1200);
  } catch(e) {
    console.error("reorder failed", e);
    chrome.action.setBadgeText({ text: "!" });
    setTimeout(()=> chrome.action.setBadgeText({text:""}), 1500);
  } finally {
    isReordering = false;
  }
}

async function doUndo() {
  const win = await chrome.windows.getCurrent();
  const res = await undoWindow(win.id);
  if (res.error) {
    chrome.action.setBadgeText({ text: "!" });
    setTimeout(()=> chrome.action.setBadgeText({text:""}), 1200);
  } else {
    chrome.action.setBadgeText({ text: "↩" });
    setTimeout(()=> chrome.action.setBadgeText({text:""}), 1200);
  }
}

// Dedupe: exact URL match, close new, focus old
async function handleDedupe(tabId, newUrl) {
  const s = await getSettings();
  if (!s.dedupeEnabled) return;
  if (!newUrl || isNeverDedupeUrl(newUrl, s.dedupeWhitelist)) return;
  // debounce per tab
  clearTimeout(dedupeTimer);
  dedupeTimer = setTimeout(async()=>{
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || tab.pinned) return;
      if (isNeverDedupeUrl(tab.url, s.dedupeWhitelist)) return;
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      const existing = tabs.find(t => t.id !== tabId && !t.pinned && t.url === tab.url && !isNeverDedupeUrl(t.url, s.dedupeWhitelist));
      if (existing) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.tabs.remove(tabId);
        chrome.action.setBadgeText({ text: "dup" });
        chrome.action.setBadgeBackgroundColor({ color: "#FF3B1F" });
        setTimeout(()=> chrome.action.setBadgeText({text:""}), 1500);
        // store for undo (10s)
        await chrome.storage.local.set({ lastDedupe: { url: tab.url, closedAt: Date.now(), windowId: tab.windowId } });
        setTimeout(async()=>{
          const d = await chrome.storage.local.get("lastDedupe");
          if (d.lastDedupe && Date.now() - d.lastDedupe.closedAt >= 10000) {
            await chrome.storage.local.remove("lastDedupe");
          }
        }, 10000);
      }
    } catch(e){ console.warn("dedupe failed", e); }
  }, 300);
}

async function undoDedupe(){
  const d = await chrome.storage.local.get("lastDedupe");
  if (!d.lastDedupe) return { error: "no dedupe" };
  await chrome.tabs.create({ url: d.lastDedupe.url, active: true });
  await chrome.storage.local.remove("lastDedupe");
  return { ok: true };
}

async function bulkCloseDuplicates(){
  const s = await getSettings();
  const query = s.scopeAllWindows ? {} : { windowId: (await chrome.windows.getCurrent()).id };
  const tabs = await chrome.tabs.query(query);
  // group by exact URL, keep oldest (lowest index)
  const seen = new Map();
  const toClose = [];
  // sort by window then index to keep oldest
  tabs.sort((a,b)=> a.windowId - b.windowId || a.index - b.index);
  for (const t of tabs) {
    if (t.pinned) continue;
    if (!t.url || isNeverDedupeUrl(t.url, s.dedupeWhitelist)) continue;
    if (seen.has(t.url)) {
      toClose.push(t);
    } else {
      seen.set(t.url, t);
    }
  }
  if (toClose.length === 0) return { closed: 0, groups: 0 };
  const ids = toClose.map(t=>t.id);
  const urls = toClose.map(t=>t.url);
  await chrome.tabs.remove(ids);
  // store for bulk undo 30s
  await chrome.storage.local.set({ lastBulkClosed: { urls, closedAt: Date.now() } });
  setTimeout(async()=>{
    const d = await chrome.storage.local.get("lastBulkClosed");
    if (d.lastBulkClosed && Date.now() - d.lastBulkClosed.closedAt >= 30000) {
      await chrome.storage.local.remove("lastBulkClosed");
    }
  }, 30000);
  chrome.action.setBadgeText({ text: String(toClose.length) });
  chrome.action.setBadgeBackgroundColor({ color: "#FF3B1F" });
  setTimeout(()=> chrome.action.setBadgeText({text:""}), 2000);
  const dupGroups = [...seen.values()].filter(v => tabs.filter(t=>t.url===v.url).length >1).length;
  // actual dup groups with extra copies
  const groupsWithDup = new Set(toClose.map(t=>t.url)).size;
  return { closed: toClose.length, groups: groupsWithDup };
}

async function undoBulkClose(){
  const d = await chrome.storage.local.get("lastBulkClosed");
  if (!d.lastBulkClosed) return { error: "no bulk" };
  for (const url of d.lastBulkClosed.urls) {
    await chrome.tabs.create({ url, active: false });
  }
  await chrome.storage.local.remove("lastBulkClosed");
  return { ok: true, restored: d.lastBulkClosed.urls.length };
}

async function getDupCount(){
  const s = await getSettings();
  const query = s.scopeAllWindows ? {} : { windowId: (await chrome.windows.getCurrent()).id };
  const tabs = await chrome.tabs.query(query);
  const map = new Map();
  for (const t of tabs) {
    if (t.pinned || !t.url || isNeverDedupeUrl(t.url, s.dedupeWhitelist)) continue;
    map.set(t.url, (map.get(t.url)||0)+1);
  }
  let extra = 0, groups = 0;
  for (const c of map.values()) if (c>1){ extra += c-1; groups+=1; }
  return { extra, groups, total: tabs.length };
}

// Messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async()=>{
    if (msg.action === "reorder") { await doReorder("popup"); sendResponse({ok:true}); }
    if (msg.action === "undo") { await doUndo(); sendResponse({ok:true}); }
    if (msg.action === "undoDedupe") { const r = await undoDedupe(); sendResponse(r); }
    if (msg.action === "bulkClose") { const r = await bulkCloseDuplicates(); sendResponse(r); }
    if (msg.action === "undoBulk") { const r = await undoBulkClose(); sendResponse(r); }
    if (msg.action === "getDupCount") { const r = await getDupCount(); sendResponse(r); }
    if (msg.action === "getSettings") { sendResponse(await getSettings()); }
  })();
  return true;
});

chrome.commands.onCommand.addListener((command)=>{
  if (command === "reorder-tabs") doReorder("shortcut");
});

async function maybeAutoReorder() {
  const s = await getSettings();
  if (!s.autoReorder) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(()=> doReorder("auto"), DEBOUNCE_MS);
}

chrome.tabs.onCreated.addListener(maybeAutoReorder);
chrome.tabs.onUpdated.addListener((id, change)=> {
  if (change.url) {
    maybeAutoReorder();
    handleDedupe(id, change.url);
  }
});
// also handle dedupe for updated url via onUpdated, and for created tab that already has url
chrome.tabs.onUpdated.addListener((id, info, tab)=>{
  if (info.url) handleDedupe(id, info.url);
});

chrome.runtime.onInstalled.addListener(()=>{
  chrome.storage.local.get(["groupByRoot","autoReorder","scopeAllWindows","dedupeEnabled","dedupeWhitelist"], (v)=>{
    if (v.groupByRoot === undefined) chrome.storage.local.set({groupByRoot:true});
    if (v.autoReorder === undefined) chrome.storage.local.set({autoReorder:false});
    if (v.scopeAllWindows === undefined) chrome.storage.local.set({scopeAllWindows:false});
    if (v.dedupeEnabled === undefined) chrome.storage.local.set({dedupeEnabled:false});
    if (v.dedupeWhitelist === undefined) chrome.storage.local.set({dedupeWhitelist:[]});
  });
});
