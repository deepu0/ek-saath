// reorder.js - core sorting logic (shared between background and tests)
// expects domain.js loaded first (getRootDomain, getHostFromUrl, isProtectedUrl)

function buildReorderPlan(tabs, options = {}) {
  const { groupByRoot = true } = options;
  // tabs: [{id, index, url, pinned}] -> { orderedIds, groups, movableTabs, skipped, pinnedCount, finalIds }
  // Pinned tabs stay at the front. Protected pages (chrome://settings, extensions, about:, …) keep their index.
  // Every other tab is sorted by domain key (alphabetical) and fills the remaining slots; inside a group
  // tabs keep their original relative order (stable).
  const ordered = [...tabs].sort((a, b) => a.index - b.index);
  const movable = [];
  const skipped = [];
  for (const t of ordered) {
    if (t.pinned || isProtectedUrl(t.url)) { skipped.push(t); continue; }
    const key = getKeyForUrl(t.url, groupByRoot);
    if (!key) { skipped.push(t); continue; }
    movable.push({ ...t, host: getHostFromUrl(t.url) || key, key, origIndex: t.index });
  }
  movable.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.origIndex - b.origIndex));

  const groups = {};
  for (const m of movable) groups[m.key] = (groups[m.key] || 0) + 1;

  const pinnedCount = ordered.filter(t => t.pinned).length;
  // the full target order: skipped tabs keep their slot, sorted movable tabs fill the rest
  const skippedIds = new Set(skipped.map(t => t.id));
  const queue = movable.map(m => m.id);
  const finalIds = ordered.map(t => (skippedIds.has(t.id) ? t.id : queue.shift()));

  return { orderedIds: movable.map(m => m.id), groups, movableTabs: movable, skipped, pinnedCount, finalIds };
}

async function reorderWindow(windowId, options = {}) {
  const allTabs = await chrome.tabs.query({ windowId });
  if (allTabs.length < 2) return { moved: 0, groups: {} };
  allTabs.sort((a, b) => a.index - b.index);
  await chrome.storage.local.set({ [`lastOrder_${windowId}`]: allTabs.map(t => t.id) });

  const plan = buildReorderPlan(allTabs, options);
  if (plan.orderedIds.length < 2) return { moved: 0, groups: plan.groups, skipped: plan.skipped.length };

  // One bulk move puts the sorted block right after the pinned tabs (keeps order, no index drift)…
  await chrome.tabs.move(plan.orderedIds, { index: plan.pinnedCount });
  // …then each unpinned protected tab goes back to its own index. Ascending order makes every insert exact.
  const protectedTabs = plan.skipped.filter(t => !t.pinned).sort((a, b) => a.index - b.index);
  for (const t of protectedTabs) {
    try { await chrome.tabs.move(t.id, { index: t.index }); } catch (e) { console.warn("protected tab move failed", e); }
  }
  return { moved: plan.orderedIds.length, groups: plan.groups, pinnedCount: plan.pinnedCount };
}

async function reorderAllWindows(options) {
  const windows = await chrome.windows.getAll();
  let total = 0;
  let mergedGroups = {};
  for (const w of windows) {
    const r = await reorderWindow(w.id, options);
    total += r.moved;
    for (const [k,v] of Object.entries(r.groups||{})) mergedGroups[k]=(mergedGroups[k]||0)+v;
  }
  return { moved: total, groups: mergedGroups };
}

async function undoAllWindows() {
  const windows = await chrome.windows.getAll();
  let restored = 0, any = false;
  for (const w of windows) {
    const r = await undoWindow(w.id);
    if (!r.error) { any = true; restored += r.restored; }
  }
  return any ? { restored } : { restored: 0, error: "no undo data" };
}

async function undoWindow(windowId) {
  const key = `lastOrder_${windowId}`;
  const data = await chrome.storage.local.get(key);
  const order = data[key];
  if (!order || !order.length) return { restored: 0, error: "no undo data" };
  // Verify tabs still exist
  const tabs = await chrome.tabs.query({ windowId });
  const existing = new Set(tabs.map(t=>t.id));
  const toRestore = order.filter(id=>existing.has(id));
  for (let i=0; i < toRestore.length; i++) {
    try {
      await chrome.tabs.move(toRestore[i], { index: i });
    } catch(err) { console.warn("undo move failed", err); }
  }
  return { restored: toRestore.length };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildReorderPlan };
}
