# EkSaath — Group Tabs by Domain

[![MIT License](https://img.shields.io/badge/license-MIT-green)](#license) [![Chrome](https://img.shields.io/badge/Chrome-MV3-blue)](manifest.json)

Sab tabs ek saath. `1,2,3,4,1,3,4,2` → `1·1·1 — 2·2 — 3·3 — 4`

![Banner](screenshots/banner-1280x800.png)

> **Why I built this**
>
> I keep 50+ tabs open. I don't close them — I have affection for tabs, I might need them later. Many of us do.
>
> The problem: I open the same URL again without realizing. 4 copies of the same docs page, scattered. Now with EkSaath, same domain sits together. I see — "I already have 4 tabs for this" — so I don't open a fifth.

## Screenshots (Chrome DevTools)

| Popup (real Chrome) | Before → After |
|---|---|
| ![Popup Chrome](screenshots/store-1-popup-chrome-1280x800.png) | ![Before After](screenshots/store-2-before-after-1280x800.png) |

Minimal, industrial UI. Reorder only — no tab groups clutter.

## Features

- **Reorder by root domain** — alphabetical, stable. `mail.google.com` = `google.com`
- **Dedupe on open** — exact URL, close new → focus old, 10s undo
- **Bulk close duplicates** — `CLOSE 5` keeps oldest, live count `2 groups · 5 extra`, undo 30s
- **Never dedupe:** pinned, `chrome://newtab`, `localhost`, whitelist
- **Minimal UI:** basic always, advanced collapsible. `Alt+Shift+R`

## Install

**Dev:** `chrome://extensions` → Developer mode → Load unpacked → select this folder

**Store:** Upload `EkSaath-v1.2.0.zip` to [Chrome Web Store Console](https://chrome.google.com/webstore/devconsole)

## Privacy

No data leaves device. Only `tabs` + `storage`. See [PRIVACY.md](PRIVACY.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE)

---
*For tab hoarders, by one. Ek saath lao.*
