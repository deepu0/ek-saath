# Domain Grouper — Group Tabs by Domain

[![MIT License](https://img.shields.io/badge/license-MIT-green)](#license) [![Chrome](https://img.shields.io/badge/Chrome-MV3-blue)](manifest.json)

Fix scattered tabs. `1,2,3,4,1,3,4,2` → `1·1·1 — 2·2 — 3·3 — 4`

Minimal, industrial UI. Reorder only — no tab groups clutter.

![Banner](screenshots/banner-1280x800.png)

## Features

- **Reorder by root domain** — alphabetical, stable inside group. `mail.google.com` = `google.com`
- **Dedupe on open** — exact URL match, close new → focus old, 10s undo
- **Bulk close duplicates** — scan current/all windows, keep oldest, show count, bulk undo 30s
- **Live counts** — groups + `extra` duplicates in popup
- **Never dedupe:** pinned, `chrome://newtab`, `localhost`, whitelist
- **Minimal UI:** basic always, advanced collapsible. Shortcut `Alt+Shift+R`

![Popup](screenshots/popup-360x520.png) ![Options](screenshots/options-1280x800.png)

## Install

**Dev:**
1. `chrome://extensions` → Developer mode → Load unpacked → select this folder

**Store:** Upload `Domain-Grouper-v1.2.0.zip` to [Chrome Web Store Console](https://chrome.google.com/webstore/devconsole)

## Privacy

No data leaves device. Only `tabs` + `storage` permissions. See [PRIVACY.md](PRIVACY.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE)
