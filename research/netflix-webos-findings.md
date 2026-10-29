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

## Public 2025–2026 TV interface references

No authorized screen capture or remote observation channel was available for the installed LG Netflix app. Its precise on-device interface and frame rate were **not directly observed**. The owner directed us to public images of the current layout. Netflix's [TV experience announcement](https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience), [Tudum walkthrough](https://www.netflix.com/tudum/articles/netflix-new-tv-layout), and [Help Center navigation guide](https://help.netflix.com/en/node/321880164349028) show a top shortcut menu, a large featured visual with title details and actions, and landscape recommendations. Back on the remote can return to the top menu. The public guide notes that interface availability varies by device.

The original StreamCinema draft used a fixed left rail and portrait tiles. That differed visibly from these references. The revised client uses an independently built top menu, cinematic featured backdrop, wide title cards, a full-screen detail view, and a My Cinema area for Continue Watching and My List. The demo artwork is original. Netflix's logo, title imagery, code, and streams are not used. The local browser check verified directional focus through the first row, opening details, Back returning to the prior card, and sample playback; it does not establish visual or performance equivalence on an LG TV.

## REA repository assessment

The owner supplied [morluto/rea](https://github.com/morluto/rea). It is a general reverse-engineering toolkit rather than a Netflix application implementation or a catalog of its UI screens. Its [desktop application guide](https://github.com/morluto/rea/blob/main/docs/desktop-applications.md) describes bounded inspection of files and metadata. The LG manifest already establishes that this Netflix installation is a native, trusted, non-inspectable package. No Netflix binary or protected material was copied to run REA; REA was not used to infer protected implementation behavior. Its CLI setup on this PC also failed because a package build script was blocked by the package manager. Public UI references and permitted manifest facts were sufficient for the independent client redesign.

## Limits

The Netflix app is native and trusted. A third-party webOS app cannot assume its privileged runtime, quick-start behavior, DRM integration, or identical animation performance. StreamCinema uses an independently built web app and the public HTML media element. It does not attempt to mimic protected internals or play Netflix content.
