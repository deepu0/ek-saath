# Changelog
## 1.2.2 - 2026-09-26
- Fix: **Dedupe on open no longer closes a tab you are browsing in.** Only a tab you just opened is checked, once, on its first real page (after redirects). Clicking links, typing a URL, back/forward and SPA route changes inside an existing tab never close it
- Fix: duplicates opened at the same moment are all caught (one shared 300 ms timer used to drop all but the last)
- Fix: the dedupe check ran twice per navigation (listener registered twice)
- Fix: tabs reopened by Undo are no longer deduped straight back; tabs brought back by session restore at browser start are left alone
- Fix: Undo bulk close puts every tab back in its own window at its old position (it used to append them all to the current window)
- Fix: undo windows (10 s dedupe, 30 s bulk) are enforced by the background, not only by the popup
- Fix: the popup shows the real result — "COULDN'T REORDER" instead of "GROUPED ✓" when reorder fails, "UNDO EXPIRED" when undo is too late. Undo follows the All-windows scope
- Fix: protected pages (chrome://settings, extensions, other chrome:// and about: pages) now keep their position during reorder, as documented; before they were pushed to the end
- Group by root: sites on hosting platforms (github.io, vercel.app, netlify.app, pages.dev, …) and more country domains (co.kr, com.sg, com.mx, …) are grouped per site, not lumped together
- Tests: unit tests for domain + reorder logic, end-to-end tests on the real extension in Chromium, GitHub Actions CI, `npm run pack` builds the store zip
## 1.2.1 - 2026-09-26
- Privacy: bundle Fraunces + JetBrains Mono (SIL OFL 1.1) in `fonts/` — the popup and options page no longer request fonts.googleapis.com
- Remove placeholder author email from manifest; real contact in PRIVACY.md
- Fix missing glyphs (→ ↩ ✓ ▾ rendered as boxes or emoji): JetBrains Mono is now a variable subset (real 400/600/700 weights) that includes → and ▾, plus a two-glyph Noto Sans Math fallback ("EkSaath Symbols") for ↩ and ✓
- Buttons, kbd and form controls inherit the bundled font instead of the system UI font
## 1.2.0 - 2026-08-21
- Bulk close duplicates (exact, keep oldest) + live count pill (groups + extra), follow Scope
- Bulk undo 30s, minimalist UI: basic always, advanced collapsible
- Fix: bulk move after pinned, allow newtab grouping
## 1.1.0 - 2026-08-21
- Add dedupe exact URL: close new tab if same URL exists, focus old, badge dup, 10s undo
- Never dedupe: pinned, chrome://newtab, localhost, whitelist
- Whitelist setting in Options, dedupe toggle in popup

## 1.0.0 - 2026-08-21
- Initial prod release
- Reorder only, alphabetical by root domain
- Manual + auto toggle, undo, shortcut Alt+Shift+R
- Pinned/protected handling, port stripping
