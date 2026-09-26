# EkSaath — Group Tabs by Domain

[![MIT License](https://img.shields.io/badge/license-MIT-green)](#license) [![Chrome](https://img.shields.io/badge/Chrome-MV3-blue)](manifest.json) [![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-live-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/eksaath-%E2%80%94-group-tabs-by-d/dmbddhflionebnjhlopafpggcegkkklo)

Stop hunting tabs. Same domain together, duplicates shown, extras closed in one click.

`1,2,3,4,1,3,4,2` → `1·1·1 — 2·2 — 3·3 — 4` — sab ek saath.

![Banner](screenshots/banner-1280x800.png)

> **Why I built this**
>
> I keep 50+ tabs open. I don't close them — I have affection for tabs, I might need them later. Many of us do.
>
> The problem: I open the same URL again without realizing. 4 copies of the same docs page, scattered. Now with EkSaath, same domain sits together. I see — "I already have 4 tabs for this" — so I don't open a fifth.

## Launch film

[![EkSaath launch film](launch-video/preview.gif)](launch-video/eksaath-launch-1920x1080.mp4)

32 s, real extension on real tabs. Click the GIF to open the MP4 with sound ([vertical 9:16](launch-video/eksaath-launch-1080x1920.mp4)). See [how it was made](launch-video/README.md).

## Screenshots

| Group by site | Close duplicates |
|---|---|
| ![Group by site](screenshots/store/2-group-by-site-1280x800.png) | ![Close duplicates](screenshots/store/3-close-duplicates-1280x800.png) |
| **Dedupe on open** | **Pinned tabs stay put** |
| ![Dedupe on open](screenshots/store/4-dedupe-on-open-1280x800.png) | ![Pinned](screenshots/store/5-pinned-stay-1280x800.png) |

Minimal, industrial UI. Reorder only — no tab groups clutter.

## Features

- **Reorder by root domain** — alphabetical, stable. `mail.google.com` = `google.com`
- **Dedupe on open** — exact URL, close new → focus old, 10s undo
- **Bulk close duplicates** — `CLOSE 5` keeps oldest, live count `2 groups · 5 extra`, undo 30s
- **Never dedupe:** pinned, `chrome://newtab`, `localhost`, whitelist
- **Minimal UI:** basic always, advanced collapsible. `Alt+Shift+R`

## Install

**Dev:** `chrome://extensions` → Developer mode → Load unpacked → select this folder

**Store:** [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/eksaath-%E2%80%94-group-tabs-by-d/dmbddhflionebnjhlopafpggcegkkklo) — live since Sep 2026 (3 users, 5.0/5 as of Sep 19, 2026)

## Privacy

No data leaves device. Only `tabs` + `storage`. See [PRIVACY.md](PRIVACY.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE)

---
*For tab hoarders, by one. Ek saath lao.*
