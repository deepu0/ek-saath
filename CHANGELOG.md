# Changelog
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
