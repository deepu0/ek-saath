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
  if (d.lastBulkClosed && Date.now() - d.lastBulkClosed.closedAt < 30000 && d.lastBulkClosed.urls) {
    $("bulkUndo").classList.add("show");
    $("bulkUndo").textContent = `↩ Undo bulk (${d.lastBulkClosed.urls.length})`;
  } else $("bulkUndo").classList.remove("show");
}

let statusTimer = null;
function flash(text, ms = 1600){
  $("status").textContent = text;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(()=> $("status").textContent = "", ms);
}
async function send(action){
  try { return await chrome.runtime.sendMessage({action}) || {ok:false, error:"no response"}; }
  catch(e){ return {ok:false, error:String(e && e.message || e)}; }
}

$("reorder").onclick = async()=>{
  flash("REORDERING…", 0);
  const r = await send("reorder");
  if (r.busy) return flash("ALREADY REORDERING…");
  if (!r.ok) return flash("COULDN’T REORDER — TRY AGAIN", 2400);
  if (r.groups) renderGroups(r.groups);
  refreshDupCount();
  flash("GROUPED ✓", 1400);
  const win = await chrome.windows.getCurrent();
  const data = await chrome.storage.local.get(`lastOrder_${win.id}`);
  $("undo").disabled = !data[`lastOrder_${win.id}`];
};

$("undo").onclick = async()=>{
  flash("RESTORING…", 0);
  const r = await send("undo");
  flash(r.ok ? "RESTORED ↩" : "NOTHING TO UNDO", 1400);
};

$("bulkClose").onclick = async()=>{
  flash("CLOSING DUPS…", 0);
  const r = await send("bulkClose");
  if (r.error) flash("COULDN’T CLOSE — TRY AGAIN", 2400);
  else flash(r.closed ? `CLOSED ${r.closed} in ${r.groups} groups ✓` : "NO DUPS", 1800);
  refreshDupCount();
  checkUndos();
};

$("bulkUndo").onclick = async()=>{
  const r = await send("undoBulk");
  $("bulkUndo").classList.remove("show");
  flash(r.ok ? "BULK RESTORED ↩" : "UNDO EXPIRED", 1600);
  refreshDupCount();
};

$("dedupeUndo").onclick = async()=>{
  const r = await send("undoDedupe");
  $("dedupeUndo").classList.remove("show");
  flash(r.ok ? "DUP RESTORED ↩" : "UNDO EXPIRED", 1600);
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
