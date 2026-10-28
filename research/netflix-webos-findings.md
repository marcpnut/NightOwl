# LG Nano and Netflix public metadata findings

Inspection date: 28 October 2026. Source: read-only SSH session with the owner-authorized LG Nano TV. No Netflix executable, bundle, DRM component, protected asset, or application data was copied.

## Device

| Field | Observed value |
|---|---|
| Model | LG 55NANO886PB |
| Firmware | 03.53.45 |
| webOS SDK / OS release | 6.5.3 |
| Kernel architecture | ARMv7 (`armv7l`), 32-bit userspace |
| UHD flag | `true` |
| Installed NextFlix reference app | `com.nextflix.iptv` 2.0.0, type `web`, 1920×1080 app resolution |

## Netflix public application manifest

| Field | Observed value |
|---|---|
| Application ID | `netflix` |
| Version | 1.4.5 |
| Runtime type | `native` |
| Launch target | Native binary declared in the public manifest; the binary was not opened or copied |
| Declared app resolution | 1920×1080 |
| Input mode | Virtual touch support with horizontal threshold 15 |
| Lifecycle | Native lifecycle interface version 2; relaunch and quick start supported |
| Trust / packaging | Trusted, internal installation, squashfs, non-inspectable |

The manifest does not enumerate the complete permissions or codec support. The LG Nano reports UHD capability, but actual output resolution, supported codecs, HLS behavior, subtitle APIs, and remote event codes still need runtime probes in an authorized development build. The LG C9 compatibility notes in the existing project report webOS 4.10.0 and Chromium 53, but this inspection did not connect to that TV.

## UI behavior and design guidance

There was no authorized screen capture or remote observation channel in this session. Home rows, hero artwork, detail transitions, episode browsing, player controls, Back behavior, and performance therefore **were not directly observed** on the installed Netflix app. No screenshots are included.

The standalone StreamCinema client independently implements a TV-style hero, horizontal artwork rows, persistent navigation rail, explicit focus highlight, directional remote navigation, details, seasons, search, My List, profiles, Continue Watching, and playback controls. These are common TV interface patterns, not findings about Netflix's protected implementation. Physical TV observation and usability testing remain necessary.

## Limits

The Netflix app is native and trusted. A third-party webOS app cannot assume its privileged runtime, quick-start behavior, or DRM integration. StreamCinema uses an independently built web app and the public HTML media element. It does not attempt to mimic protected internals or play Netflix content.
