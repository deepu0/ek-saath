// Unit tests for the pure logic (node:test, no dependencies): node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../domain.js");
Object.assign(globalThis, domain);          // reorder.js expects domain.js globals, like importScripts
const { buildReorderPlan } = require("../reorder.js");
const { getRootDomain, getKeyForUrl, isNeverDedupeUrl, isBlankUrl, isProtectedUrl } = domain;

test("root domain: subdomains group under the registrable domain", () => {
  assert.equal(getRootDomain("mail.google.com"), "google.com");
  assert.equal(getRootDomain("docs.google.com"), "google.com");
  assert.equal(getRootDomain("example.com"), "example.com");
  assert.equal(getRootDomain("WWW.Example.COM"), "example.com");
  assert.equal(getRootDomain("localhost:3000"), "localhost");
  assert.equal(getRootDomain("192.168.1.4"), "192.168.1.4");
});

test("root domain: country second levels", () => {
  assert.equal(getRootDomain("www.bbc.co.uk"), "bbc.co.uk");
  assert.equal(getRootDomain("shop.flipkart.co.in"), "flipkart.co.in");
  assert.equal(getRootDomain("news.yahoo.co.jp"), "yahoo.co.jp");
  assert.equal(getRootDomain("www.abc.net.au"), "abc.net.au");
});

test("root domain: hosting platforms keep each site separate", () => {
  assert.equal(getRootDomain("alice.github.io"), "alice.github.io");
  assert.equal(getRootDomain("bob.github.io"), "bob.github.io");
  assert.equal(getRootDomain("my-app.vercel.app"), "my-app.vercel.app");
  assert.equal(getRootDomain("preview.my-app.vercel.app"), "my-app.vercel.app");
  assert.equal(getRootDomain("docs.netlify.app"), "docs.netlify.app");
  assert.equal(getRootDomain("github.io"), "github.io");
});

test("group key: root vs exact host, new tab page, protocols", () => {
  assert.equal(getKeyForUrl("https://mail.google.com/x", true), "google.com");
  assert.equal(getKeyForUrl("https://mail.google.com/x", false), "mail.google.com");
  assert.equal(getKeyForUrl("chrome://newtab/", true), "newtab");
  assert.equal(getKeyForUrl("file:///tmp/a.html", true), "file");
  assert.equal(getKeyForUrl("", true), null);
});

test("never dedupe: new tab, localhost, whitelist by host / root / substring", () => {
  assert.equal(isNeverDedupeUrl("chrome://newtab/"), true);
  assert.equal(isNeverDedupeUrl("http://localhost:3000/"), true);
  assert.equal(isNeverDedupeUrl("http://127.0.0.1:8080/"), true);
  assert.equal(isNeverDedupeUrl("https://github.com/a"), false);
  assert.equal(isNeverDedupeUrl("https://mail.google.com/u/0", ["mail.google.com"]), true);
  assert.equal(isNeverDedupeUrl("https://docs.google.com/d/1", ["google.com"]), true);
  assert.equal(isNeverDedupeUrl("https://github.com/a", [" ", ""]), false);
});

test("blank pages are not a destination yet", () => {
  for (const u of ["", "about:blank", "chrome://newtab/", "chrome-search://local-ntp/local-ntp.html"]) assert.equal(isBlankUrl(u), true, u);
  assert.equal(isBlankUrl("https://example.com/"), false);
});

test("protected pages", () => {
  assert.equal(isProtectedUrl("chrome://settings/"), true);
  assert.equal(isProtectedUrl("chrome-extension://abc/popup.html"), true);
  assert.equal(isProtectedUrl("chrome://newtab/"), false);
  assert.equal(isProtectedUrl("https://x.com/"), false);
});

const T = (id, url, extra = {}) => ({ id, url, pinned: false, ...extra });
const withIndex = tabs => tabs.map((t, index) => ({ ...t, index }));

test("reorder: groups alphabetically, stable inside a group", () => {
  const tabs = withIndex([
    T(1, "https://b.com/1"), T(2, "https://a.com/1"), T(3, "https://b.com/2"), T(4, "https://a.com/2"), T(5, "https://c.com/")
  ]);
  const plan = buildReorderPlan(tabs);
  assert.deepEqual(plan.finalIds, [2, 4, 1, 3, 5]);
  assert.deepEqual(plan.groups, { "a.com": 2, "b.com": 2, "c.com": 1 });
});

test("reorder: root grouping merges subdomains; host grouping doesn't", () => {
  const tabs = withIndex([T(1, "https://mail.google.com/"), T(2, "https://github.com/"), T(3, "https://docs.google.com/")]);
  assert.deepEqual(buildReorderPlan(tabs, { groupByRoot: true }).finalIds, [2, 1, 3]);
  assert.deepEqual(buildReorderPlan(tabs, { groupByRoot: false }).finalIds, [3, 2, 1]);
});

test("reorder: pinned tabs stay first and unmoved", () => {
  const tabs = withIndex([T(9, "https://z.com/", { pinned: true }), T(1, "https://b.com/"), T(2, "https://a.com/")]);
  const plan = buildReorderPlan(tabs);
  assert.equal(plan.pinnedCount, 1);
  assert.deepEqual(plan.finalIds, [9, 2, 1]);
  assert.ok(!plan.orderedIds.includes(9));
});

test("reorder: protected pages keep their slot", () => {
  const tabs = withIndex([
    T(1, "https://b.com/"), T(2, "chrome://settings/"), T(3, "https://a.com/"), T(4, "https://b.com/2"), T(5, "chrome://extensions/")
  ]);
  const plan = buildReorderPlan(tabs);
  assert.deepEqual(plan.finalIds, [3, 2, 1, 4, 5]);
  assert.deepEqual(plan.skipped.map(t => t.id), [2, 5]);
});

test("reorder: input order doesn't matter, only .index", () => {
  const tabs = withIndex([T(1, "https://b.com/"), T(2, "https://a.com/"), T(3, "https://b.com/2")]).reverse();
  assert.deepEqual(buildReorderPlan(tabs).finalIds, [2, 1, 3]);
});
