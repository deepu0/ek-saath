// End-to-end checks on the real unpacked extension in Chromium (Playwright). Run: npm run test:e2e
// A tiny local site is served on 127.0.0.2 (127.0.0.1 and localhost are "never dedupe" by design).
// Harness note: headless Chromium has no focused window, so chrome.windows.getCurrent is pointed at the test window.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.2", PORT = 8765, B = `http://${HOST}:${PORT}`;
const server = http.createServer((req, res) => {
  if (req.url === "/redir") { res.writeHead(302, { location: "/docs" }); return res.end(); }
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html><title>${req.url}</title><a id="blank" target="_blank" href="/docs">docs</a>
<script>window.spa = p => history.pushState({}, "", p)</script><h1>${req.url}</h1>`);
});
await new Promise(r => server.listen(PORT, HOST, r));

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "eksaath-e2e-")), {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-sandbox"]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
const home = ctx.pages()[0] || await ctx.newPage();
await home.goto(B + "/home");
const win = await sw.evaluate(async () => (await chrome.tabs.query({}))[0].windowId);
await sw.evaluate(async (w) => {
  chrome.windows.getCurrent = async () => ({ id: w, focused: true });
  await chrome.storage.session.remove("startupAt");
}, win);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const tabs = () => sw.evaluate(async w => (await chrome.tabs.query({ windowId: w })).sort((a, b) => a.index - b.index)
  .map(t => ({ id: t.id, url: t.url.replace(/^http:\/\/127\.0\.0\.2:8765/, ""), active: t.active, pinned: t.pinned })), win);
const urls = async () => (await tabs()).map(t => t.url);
const count = async u => (await urls()).filter(x => x === u).length;
async function until(fn, ms = 4000) { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await sleep(100); } return v; }
const setDedupe = on => sw.evaluate(on => chrome.storage.local.set({ dedupeEnabled: on }), on);
const createTab = (u, active = true) => sw.evaluate(async ([u, a]) => (await chrome.tabs.create({ url: u, active: a })).id, [B + u, active]);
async function reset() {   // keep only the first tab on /home
  await sw.evaluate(async w => { const t = (await chrome.tabs.query({ windowId: w })).sort((a, b) => a.index - b.index);
    await chrome.tabs.update(t[0].id, { url: "http://127.0.0.2:8765/home", pinned: false });
    if (t.length > 1) await chrome.tabs.remove(t.slice(1).map(x => x.id));
    await chrome.storage.local.remove(["lastDedupe", "lastBulkClosed"]); }, win);
  await sleep(300);
}

let failed = 0;
const ONLY = process.env.ONLY;   // run a subset: ONLY="blank tab" npm run test:e2e
async function check(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  await reset();
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

await setDedupe(true);

await check("dedupe: a newly opened duplicate tab is closed and the old one focused", async () => {
  await createTab("/docs"); await sleep(600);
  const id = await createTab("/docs");
  await until(async () => {
    const t = await tabs();
    return t.filter(x => x.url === "/docs").length === 1 && t.find(x => x.url === "/docs").active;
  }, 10000);
  eq(await count("/docs"), 1, "copies of /docs");
  const t = await tabs(); eq(t.find(x => x.url === "/docs").active, true, "old tab active");
  eq(t.some(x => x.id === id), false, "new tab closed");
  eq(await sw.evaluate(() => chrome.action.getBadgeText({})), "dup", "badge");
});

await check("dedupe: target=_blank link to an open page", async () => {
  await createTab("/docs"); await sleep(600);
  await home.bringToFront(); await home.click("#blank");
  await sleep(1500);
  eq(await count("/docs"), 1, "copies of /docs");
});

await check("dedupe: uses the final URL after a redirect", async () => {
  await createTab("/docs"); await sleep(600);
  await createTab("/redir");
  await until(async () => (await count("/docs")) === 1 && !(await urls()).includes("/redir"), 10000);
  eq(await count("/docs"), 1, "copies of /docs");
});

await check("dedupe: new blank tab, then typing an open URL", async () => {
  await createTab("/docs"); await sleep(600);
  const p = await ctx.newPage();            // opens an about:blank tab, like Ctrl+T
  await sleep(600);
  await p.goto(B + "/docs").catch(() => {});   // then the user types the URL
  await until(async () => (await count("/docs")) === 1);
  eq(await count("/docs"), 1, "copies of /docs");
});

await check("dedupe: two duplicates opened at once are both closed", async () => {
  await createTab("/docs"); await sleep(600);
  await Promise.all([createTab("/docs", false), createTab("/docs", false)]);
  await until(async () => (await count("/docs")) === 1);
  await sleep(500);
  eq(await count("/docs"), 1, "copies of /docs");
});

await check("never closes a tab the user navigates (link / typed URL / back-forward)", async () => {
  await createTab("/docs"); await sleep(600);
  const p = await ctx.newPage(); await p.goto(B + "/work"); await p.goto(B + "/work2"); await sleep(600);
  await p.goto(B + "/docs"); await sleep(1500);
  eq(await count("/docs"), 2, "both /docs tabs still open");
  await p.goBack(); await p.goForward(); await sleep(1200);
  eq(await count("/docs"), 2, "after back/forward");
});

await check("never closes a tab on an SPA route change", async () => {
  await createTab("/docs"); await sleep(600);
  const p = await ctx.newPage(); await p.goto(B + "/app"); await sleep(800);
  await p.evaluate(() => window.spa("/docs")); await sleep(1500);
  eq(await count("/docs"), 2, "both /docs tabs still open");
});

await check("dedupe off: nothing is closed", async () => {
  await setDedupe(false);
  try {
    await createTab("/docs"); await sleep(400); await createTab("/docs"); await sleep(1500);
    eq(await count("/docs"), 2, "copies of /docs");
  } finally { await setDedupe(true); }
});

await check("undo dedupe: the tab comes back in place and is not deduped again", async () => {
  await createTab("/a"); await createTab("/docs"); await createTab("/b"); await sleep(800);
  await createTab("/docs");
  await until(async () => (await count("/docs")) === 1);
  const before = await urls();
  eq(await sw.evaluate(() => undoDedupe()), { ok: true }, "undo result");
  await sleep(1800);
  const after = await urls();
  eq(after.filter(u => u === "/docs").length, 2, "restored copy stays open");
  eq(after.length, before.length + 1, "one tab restored");
});

await check("bulk close + undo restores every tab to its old position", async () => {
  await setDedupe(false);
  try {
    for (const u of ["/q", "/r", "/q", "/s", "/r", "/q"]) await createTab(u, false);
    await sleep(1500);
    const before = await urls();
    eq(await sw.evaluate(() => getDupCount()), { extra: 3, groups: 2, total: 7 }, "dup count");
    eq(await sw.evaluate(() => bulkCloseDuplicates()), { closed: 3, groups: 2 }, "close result");
    eq(await urls(), ["/home", "/q", "/r", "/s"], "after close (oldest kept)");
    eq(await sw.evaluate(() => undoBulkClose()), { ok: true, restored: 3 }, "undo result");
    await sleep(800);
    eq(await urls(), before, "same order as before");
  } finally { await setDedupe(true); }
});

await check("all-windows bulk close + undo brings back a window whose only tab was a duplicate", async () => {
  await setDedupe(false);
  await sw.evaluate(() => chrome.storage.local.set({ scopeAllWindows: true }));
  try {
    await createTab("/x", false);
    const other = await sw.evaluate(async u => (await chrome.windows.create({ url: u, focused: false })).id, B + "/x");
    await sleep(1200);
    const r = await sw.evaluate(() => bulkCloseDuplicates());
    eq(r, { closed: 1, groups: 1 }, "close result");
    await sleep(500);
    const gone = await sw.evaluate(async id => { try { await chrome.windows.get(id); return false; } catch { return true; } }, other);
    eq(gone, true, "window with only the duplicate closed");
    eq(await sw.evaluate(() => undoBulkClose()), { ok: true, restored: 1 }, "undo result");
    await sleep(1000);
    const wins = await sw.evaluate(async main => (await chrome.windows.getAll({ populate: true }))
      .filter(w => w.id !== main).map(w => w.tabs.map(t => t.url.replace(/^http:\/\/127\.0\.0\.2:8765/, ""))), win);
    eq(wins, [["/x"]], "the tab is back in its own window");
    eq(await urls(), ["/home", "/x"], "main window unchanged");
    await sw.evaluate(async main => { for (const w of await chrome.windows.getAll()) if (w.id !== main) await chrome.windows.remove(w.id); }, win);
  } finally {
    await sw.evaluate(() => chrome.storage.local.set({ scopeAllWindows: false }));
    await setDedupe(true);
  }
});

await check("bulk undo is refused after 30 s (checked in the background)", async () => {
  await sw.evaluate(() => chrome.storage.local.set({ lastBulkClosed: { tabs: [{ url: "https://example.com/", windowId: 1, index: 1 }], urls: ["https://example.com/"], closedAt: Date.now() - 31000 } }));
  eq(await sw.evaluate(() => undoBulkClose()), { error: "expired" }, "expired undo");
  eq((await urls()).length, 1, "nothing reopened");
});

await check("reorder: groups by site, pinned stays first, reports success, undo restores", async () => {
  await sw.evaluate(async w => { const [t] = await chrome.tabs.query({ windowId: w }); await chrome.tabs.update(t.id, { pinned: true }); }, win);
  for (const u of ["https://b.example/1", "https://a.example/1", "https://b.example/2", "https://a.example/2"])
    await sw.evaluate(u => chrome.tabs.create({ url: u, active: false }), u);
  await sleep(500);
  const before = await urls();
  const r = await sw.evaluate(() => doReorder("test"));
  eq(r.ok, true, "reorder ok");
  const after = await urls();
  eq(after[0], "/home", "pinned first");
  eq(after.slice(1).map(u => u.replace(/^https:\/\/|\/$/g, "")), ["a.example/1", "a.example/2", "b.example/1", "b.example/2"], "grouped");
  eq((await sw.evaluate(() => doUndo())).ok, true, "undo ok");
  eq(await urls(), before, "order restored");
});

await check("reorder: a protected page keeps its position", async () => {
  await createTab("/z", false);
  const made = await sw.evaluate(async () => { try { await chrome.tabs.create({ url: "chrome://version/", active: false }); return true; } catch { return false; } });
  if (!made) throw new Error("could not open a chrome:// page in this Chromium");
  await createTab("/a", false); await sleep(800);
  const before = await urls();
  const pi = before.findIndex(u => u.startsWith("chrome://"));
  eq(isProtected(before[pi]), true, "is protected");
  await sw.evaluate(() => doReorder("test"));
  const after = await urls();
  eq(after.findIndex(u => u.startsWith("chrome://")), pi, "protected index unchanged");
});
function isProtected(u) { return u.startsWith("chrome://"); }

await check("popup: buttons report the real result", async () => {
  await setDedupe(false);
  try {
    for (const u of ["/q", "/r", "/q"]) await createTab(u, false);
    await sleep(800);
    const extId = new URL(sw.url()).host;
    await ctx.addInitScript({ content: `if (location.protocol === "chrome-extension:") chrome.windows.getCurrent = async () => ({ id: ${win}, focused: true });` });
    const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${extId}/popup.html`);
    await until(async () => (await pop.textContent("#bulkClose")) === "CLOSE 1");
    eq(await pop.textContent("#dupCount"), "1 groups · 1 extra", "dup pill");
    await pop.click("#reorder");
    await until(async () => (await pop.textContent("#status")) === "GROUPED ✓");
    eq(await pop.textContent("#status"), "GROUPED ✓", "reorder status");
    await pop.click("#bulkClose");
    await until(async () => (await pop.textContent("#status")).startsWith("CLOSED"));
    eq(await pop.textContent("#status"), "CLOSED 1 in 1 groups ✓", "close status");
    await until(async () => (await pop.isVisible("#bulkUndo")));
    await pop.click("#bulkUndo");
    await until(async () => (await pop.textContent("#status")) === "BULK RESTORED ↩");
    eq(await count("/q"), 2, "restored");
    await pop.close();
  } finally { await setDedupe(true); }
});

await ctx.close();
server.close();
console.log(failed ? `\n${failed} failed` : "\nall e2e checks passed");
process.exit(failed ? 1 : 0);
