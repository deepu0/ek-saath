async function load(){
  const d = await chrome.storage.local.get({groupByRoot:true, autoReorder:false, scopeAllWindows:false, dedupeEnabled:false, dedupeWhitelist:[]});
  document.getElementById("groupByRoot").classList.toggle("on", d.groupByRoot);
  document.getElementById("autoReorder").classList.toggle("on", d.autoReorder);
  document.getElementById("scopeAllWindows").classList.toggle("on", d.scopeAllWindows);
  document.getElementById("dedupeEnabled").classList.toggle("on", d.dedupeEnabled);
  const wl = Array.isArray(d.dedupeWhitelist) ? d.dedupeWhitelist.join(", ") : (d.dedupeWhitelist||"");
  document.getElementById("whitelist").value = wl;
}
function bind(id, key){
  document.getElementById(id).onclick = async()=>{
    const el = document.getElementById(id);
    const on = el.classList.toggle("on");
    await chrome.storage.local.set({[key]: on});
  };
}
bind("groupByRoot","groupByRoot");
bind("autoReorder","autoReorder");
bind("scopeAllWindows","scopeAllWindows");
bind("dedupeEnabled","dedupeEnabled");

document.getElementById("saveWl").onclick = async()=>{
  const raw = document.getElementById("whitelist").value;
  const arr = raw.split(",").map(s=>s.trim()).filter(Boolean);
  await chrome.storage.local.set({dedupeWhitelist: arr});
  document.getElementById("wlStatus").textContent = "Saved ✓";
  setTimeout(()=> document.getElementById("wlStatus").textContent="", 1500);
};
load();
