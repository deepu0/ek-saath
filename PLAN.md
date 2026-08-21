# Plan: Chrome Extension - Group Tabs by Root Domain

## 1. Summary
Rearange scattered tabs so same website host is together in one block.

Before: `1,2,3,4,1,3,4,2,1,1,2` (mixed)
After:  `1,1,1,1,2,2,2,3,3,4` (grouped alphabetical)

No Tab Groups color. Only reorder. Works on current window by default, all windows as option.

## 2. User Decisions (Grilled)
* Platform: Chrome extension (Manifest V3)
* Domain = root domain (eTLD+1). `mail.google.com` and `docs.google.com` -> `google.com`. Port stripped. `localhost:3000` == `localhost`.
* Method: Reorder tabs only, move tabs so same host is adjacent.
* Sort: Groups ordered alphabetical by root domain. Tabs inside group keep original relative order (stable sort).
* Trigger: Manual button click + optional Auto toggle (on tab create/update).
* Scope: Current window default. Advanced option: all windows.
* Protected: Do not move pinned tabs, `chrome://`, `chrome-extension://`, `edge://`, `about:`.
* Undo: One-click undo restores last order per window.
* Controls: Toolbar button + popup (Reorder / Undo / Auto toggle / Options) + keyboard shortcut Alt+Shift+R.

## 3. Architecture
```
popup (popup.html/js)  ──> background service worker (background.js)
                              ├── chrome.tabs.query
                              ├── chrome.tabs.move
                              ├── chrome.storage.local (settings + lastOrder)
                              └── chrome.commands (shortcut)
options page (options.html) ──> chrome.storage.local
```

### Permissions (manifest.json)
* `tabs`
* `storage`
* `activeTab` optional
* Host: `<all_urls>` to read hostnames

No `tabGroups` permission needed (reorder only).

### Data Flow
1. Get tabs in target window(s): `chrome.tabs.query({windowId})`
2. Filter: remove pinned + protected URLs
3. Map: `tab -> {id, index, rootDomain}` via `getRootDomain(hostname)` using PSL list (or `psl` npm).
4. Stable sort by `rootDomain` alphabetical. Keep `originalIndex` for tie break.
5. Compute minimal moves: build array of tabIds in new order, call `chrome.tabs.move` in sequence or one call with `index`.
6. Before move, save `lastOrder = tabs.map(t=>t.id)` to storage for undo.

## 4. Core Logic - `getRootDomain(hostname)`
* Use `psl` lib (publicsuffixlist) or small baked list.
* Lowercase, trim.
* If hostname is IP or localhost -> return as-is (without port).
* Else `psl.parse(hostname).domain || hostname`
* Cache results.

## 5. UI
### Toolbar Button
* Click = reorder current window immediately.
* Badge shows status (e.g., "4 groups") for 1s.

### Popup (300px)
* [Reorder Now] button
* [Undo] button (enabled if lastOrder exists)
* Toggle: Auto Group ON/OFF
* Toggle: Scope = Current window / All windows
* Link: Options

### Options Page
* Radio: Group by root domain vs exact host
* Checkbox: Ignore pinned vs move pinned
* Checkbox: Auto on startup
* Debounce for auto: 800ms after tab create/update

### Commands
* `reorder-tabs` -> Alt+Shift+R

## 6. Implementation Steps
1. Scaffold: `manifest.json` V3, icons, background service worker, popup, options.
2. Implement `domain.js`: getRootDomain, getHostFromUrl, isProtectedUrl.
3. Implement `reorder.js`: query, filter, sort, move, save undo.
4. Wire popup: buttons, storage sync, show group count.
5. Wire background: onInstalled, onCommand, onTabsCreated (if auto), debounce.
6. Undo: `undo.js` restores via stored order with `chrome.tabs.move`.
7. Test with 5, 50, 100 tabs. Measure move time.
8. Build zip for Chrome Web Store. Add `key` for dev.

## 7. File List
```
manifest.json
background.js
domain.js
reorder.js
undo.js
popup.html / popup.js / popup.css
options.html / options.js
icons/16,48,128
```

## 8. Edge Cases
* Pinned tabs at start: keep fixed, sort only unpinned segment after them.
* Single tab per domain: no move needed.
* Protected URLs mixed in: leave at original index, sort around them.
* Tab moves during reorder: debounce, lock flag `isReordering`.
* Window with <2 tabs: skip.
* Undo after tabs closed/new tabs added: undo only tabs that still exist.
* localhost with port: strip port before grouping.
* IDN domains: lowercase, punycode handled by URL.

## 9. Verification
* Manual test: open 12 tabs: `1,2,3,4,1,3,4,2,1,1,2` as in spec. Click reorder. Verify `1,1,1,1,2,2,2,3,3,4`.
* Test with google subdomains: `mail.google.com`, `docs.google.com`, `google.com` -> one group.
* Test pinned: 2 pinned + 8 normal. Pinned stay 0,1. Normal sorted from 2.
* Test undo: reorder then undo -> original order restored.
* Test auto: enable auto, open 3 new tabs of mixed host, verify auto sort after 800ms.
* Test all-windows option.

## 10. Non-Goals (V1)
* No colored Tab Groups
* No auto-close duplicates
* No tab search/filter
* No sync across devices

## 11. Risks
* `chrome.tabs.move` may be slow for 100+ tabs -> batch moves, show progress.
* PSL lib size -> use lightweight list or CDN; keep background small.
* User drag during auto -> lock and skip if user active (last 2s).

## 12. Next Action
If you approve plan, I build V1 in one session: scaffold + logic + popup + tests.

Confirm: proceed to build?
