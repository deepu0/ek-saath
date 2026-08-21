const $ = id => document.getElementById(id);
let settings = {};

async function load() {
  settings = await chrome.storage.local.get({autoReorder:false, scopeAllWindows:false, groupByRoot:true, dedupeEnabled:false});
  updateUI();
  const win = await chrome.windows.getCurrent();
  const data = await chrome.storage.local.get(`lastOrder_${win.id}`);
  $("undo").disabled = !data[`lastOrder_${win.id}`];
  const last = await chrome.storage.local.get("lastGroups");
  if (last.lastGroups) renderGroups(last.lastGroups);
  refreshDupCount();
  checkUndos();
}

function renderGroups(groups){
  const keys = Object.keys(groups);
  if (!keys.length) { $("count").textContent = "—"; return; }
  $("count").textContent = keys.length + " hosts";
}

function renderDupCount(r){
  if (!r) { $("dupCount").textContent = "—"; return; }
  if (r.extra === 0) {
    $("dupCount").textContent = "0 extra";
    $("bulkClose").classList.remove("hasdup");
    $("bulkClose").textContent = "NO DUPS";
    $("bulkClose").disabled = true;
  } else {
    $("dupCount").textContent = `${r.groups} groups · ${r.extra} extra`;
    $("bulkClose").classList.add("hasdup");
    $("bulkClose").textContent = `CLOSE ${r.extra}`;
    $("bulkClose").disabled = false;
  }
}

async function refreshDupCount(){
  try {
    const r = await chrome.runtime.sendMessage({action:"getDupCount"});
    renderDupCount(r);
  } catch(e){
    // fallback local calc if background not ready
    $("dupCount").textContent = "—";
  }
}

function updateUI(){
  $("auto").querySelector(".switch").classList.toggle("on", !!settings.autoReorder);
  $("scope").querySelector(".switch").classList.toggle("on", !!settings.scopeAllWindows);
  $("groupByRoot").querySelector(".switch").classList.toggle("on", !!settings.groupByRoot);
  $("dedupe").querySelector(".switch").classList.toggle("on", !!settings.dedupeEnabled);
  $("scopeLabel").textContent = settings.scopeAllWindows ? "All windows" : "Current window";
}

async function save(patch){
  settings = {...settings, ...patch};
  await chrome.storage.local.set(patch);
  updateUI();
  refreshDupCount();
}

async function checkUndos(){
  const d = await chrome.storage.local.get(["lastDedupe","lastBulkClosed"]);
  if (d.lastDedupe && Date.now() - d.lastDedupe.closedAt < 10000) {
    $("dedupeUndo").classList.add("show");
    $("dedupeUndo").textContent = `↩ Undo dup: ${d.lastDedupe.url.slice(0,28)}`;
  } else $("dedupeUndo").classList.remove("show");
  if (d.lastBulkClosed && Date.now() - d.lastBulkClosed.closedAt < 30000) {
    $("bulkUndo").classList.add("show");
    $("bulkUndo").textContent = `↩ Undo bulk (${d.lastBulkClosed.urls.length})`;
  } else $("bulkUndo").classList.remove("show");
}

$("reorder").onclick = async()=>{
  $("status").textContent = "REORDERING…";
  await chrome.runtime.sendMessage({action:"reorder"});
  setTimeout(async()=>{
    const d = await chrome.storage.local.get("lastGroups");
    if (d.lastGroups) renderGroups(d.lastGroups);
    refreshDupCount();
    $("status").textContent = "GROUPED ✓";
    setTimeout(()=> $("status").textContent="",1400);
    const win = await chrome.windows.getCurrent();
    const data = await chrome.storage.local.get(`lastOrder_${win.id}`);
    $("undo").disabled = !data[`lastOrder_${win.id}`];
  }, 400);
};

$("undo").onclick = async()=>{
  $("status").textContent = "RESTORING…";
  await chrome.runtime.sendMessage({action:"undo"});
  $("status").textContent = "RESTORED ↩";
  setTimeout(()=> $("status").textContent="",1400);
};

$("bulkClose").onclick = async()=>{
  $("status").textContent = "CLOSING DUPS…";
  const r = await chrome.runtime.sendMessage({action:"bulkClose"});
  $("status").textContent = r.closed ? `CLOSED ${r.closed} in ${r.groups} groups ✓` : "NO DUPS";
  refreshDupCount();
  checkUndos();
  setTimeout(()=> $("status").textContent="",1800);
};

$("bulkUndo").onclick = async()=>{
  await chrome.runtime.sendMessage({action:"undoBulk"});
  $("bulkUndo").classList.remove("show");
  $("status").textContent = "BULK RESTORED ↩";
  refreshDupCount();
};

$("dedupeUndo").onclick = async()=>{
  await chrome.runtime.sendMessage({action:"undoDedupe"});
  $("dedupeUndo").classList.remove("show");
  $("status").textContent = "DUP RESTORED ↩";
};

$("auto").onclick = ()=> save({autoReorder: !settings.autoReorder});
$("scope").onclick = ()=> save({scopeAllWindows: !settings.scopeAllWindows});
$("groupByRoot").onclick = ()=> save({groupByRoot: !settings.groupByRoot});
$("dedupe").onclick = ()=> save({dedupeEnabled: !settings.dedupeEnabled});

load();
chrome.storage.onChanged.addListener((changes)=>{
  if (changes.lastGroups) renderGroups(changes.lastGroups.newValue);
  if (changes.lastDedupe || changes.lastBulkClosed) checkUndos();
});
setInterval(checkUndos, 1000);
