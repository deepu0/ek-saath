// reorder.js - core sorting logic (shared between background and tests)
// expects domain.js loaded first (getRootDomain, getHostFromUrl, isProtectedUrl)

function buildReorderPlan(tabs, options = {}) {
  const { groupByRoot = true } = options;
  // tabs: array of {id, index, url, pinned}
  // returns { orderedIds, groups, movableTabs, skipped }
  const movable = [];
  const skipped = [];
  const indexMap = new Map();

  for (const t of tabs) {
    indexMap.set(t.id, t.index);
    if (t.pinned) { skipped.push(t); continue; }
    if (isProtectedUrl(t.url)) { skipped.push(t); continue; }
    const key = getKeyForUrl(t.url, groupByRoot);
    if (!key) { skipped.push(t); continue; }
    const host = getHostFromUrl(t.url) || key;
    movable.push({ ...t, host, key, origIndex: t.index });
  }

  // stable sort by key alphabetical, then origIndex
  movable.sort((a,b) => {
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return a.origIndex - b.origIndex;
  });

  // find pinned count - tabs that are pinned are at start; we keep their positions
  // For Chrome, pinned tabs are always at indices 0..pinnedCount-1
  // We keep skipped tabs at original indices, movable sorted fills gaps
  // Simpler: rebuild full order: pinned/skipped stay at original index, movable sorted fills sorted slots
  // But to avoid gaps, we compute: orderedMovableIds in sorted order
  // Then we will move them sequentially starting after last pinned index, preserving skipped positions where possible
  // Safer approach: create full ordered list:
  // - Determine the indices that are movable (all indices not occupied by skipped)
  // - Place sorted movable tabs into those indices in order

  // For simplicity V1: just return orderedMovableIds in sorted order
  // Background will move tabs sequentially to achieve grouped adjacency
  // It keeps pinned at front automatically if we start moving from pinnedCount
  const pinnedCount = tabs.filter(t=>t.pinned).length;
  // We keep protected/skipped tabs in place - they break contiguous groups but spec says leave them
  // Safer: just sort movable and move them after pinnedCount, skipping protected slots

  const groups = {};
  for (const m of movable) {
    groups[m.key] = (groups[m.key] || 0) + 1;
  }

  const orderedIds = movable.map(m=>m.id);

  return { orderedIds, groups, movableTabs: movable, skipped, pinnedCount };
}

async function reorderWindow(windowId, options = {}) {
  const allTabs = await chrome.tabs.query(windowId ? { windowId } : {});
  if (allTabs.length < 2) return { moved: 0, groups: {} };

  // sort by current index
  allTabs.sort((a,b)=>a.index - b.index);
  const lastOrder = allTabs.map(t=>t.id);
  await chrome.storage.local.set({ [`lastOrder_${windowId ?? 'all'}`]: lastOrder });

  const plan = buildReorderPlan(allTabs, options);
  if (plan.orderedIds.length < 2) return { moved: 0, groups: plan.groups, skipped: plan.skipped.length };

  // Fix: bulk move as contiguous block after pinned tabs.
  // Sequential index mapping caused drift (only first 2 correct for many tabs).
  // Bulk move preserves order and groups all same hosts together.
  const pinnedCount = plan.pinnedCount;
  try {
    // Chrome allows moving array of ids together preserving order in orderedIds
    await chrome.tabs.move(plan.orderedIds, { index: pinnedCount });
    if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
  } catch(err) {
    console.warn("bulk move failed, fallback sequential", err);
    const movableIndices = plan.movableTabs.map(t=>t.origIndex).sort((a,b)=>a-b);
    for (let i = plan.orderedIds.length - 1; i >= 0; i--) {
      try { await chrome.tabs.move(plan.orderedIds[i], { index: movableIndices[i] }); } catch(e){ console.warn(e); }
    }
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
  module.exports = { buildReorderPlan, reorderWindow, undoWindow };
}
