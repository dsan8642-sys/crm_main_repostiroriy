# IBM Plex font provenance

- Upstream: `https://github.com/IBM/plex`
- Retrieved: `2026-07-29`
- License: SIL Open Font License 1.1; bundled as `OFL-1.1.txt`
- Package dependency: none; the files are source-controlled UI assets.

| File | Official source | SHA-256 |
|---|---|---|
| `IBMPlexSans-Regular.woff2` | `https://raw.githubusercontent.com/IBM/plex/master/packages/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2` | `BA711A3085FF9F27440B6B9C4550CFC47C97BF36591D5DA958B975BB3ADD8C1A` |
| `IBMPlexSans-SemiBold.woff2` | `https://raw.githubusercontent.com/IBM/plex/master/packages/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2` | `F78048030EAB62E860EFA39A0DF79E2E5581BF122EB95B9BC42C0B8A4988D205` |
| `IBMPlexMono-Regular.woff2` | `https://raw.githubusercontent.com/IBM/plex/master/packages/plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2` | `BA204497F16B6D334CEE9D1E963A831B73E3A56E1D6300A8489D18DF7214B350` |
| `OFL-1.1.txt` | `https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt` | `7E6B2818EDBD8F6A01AE80641CC8F16A51080D08FB4E532BE3A0B6F74ADB07DA` |

The complete WOFF2 files are used so one face covers the RU Cyrillic and the
PL/EN Latin character sets. The UI retains system fallbacks and
`font-display: swap`.
