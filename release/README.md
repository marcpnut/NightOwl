# NightOwl for LG webOS TV

Version 0.3.11 adds Netflix-style next-episode playback: during the final 10 seconds of an episode, a Play Next Episode prompt appears with a progress fill. It plays the next episode when the fill completes. The Back and My List controls on detail views now have clear margins and remain above nearby content. Scroll indicators no longer receive remote or keyboard focus.

The browser and webOS app use the same player and series behavior.

Install the package from the Homebrew catalog at `https://marcpnut.github.io/repo`, or use the webOS TV CLI after pairing the TV in Developer Mode:

```powershell
ares-install --device <your-device-name> .\NightOwl-webos-c9-0.3.11.ipk
```

NightOwl continues to connect to `https://[redacted]`. Catalog and viewing data remain on the existing server.

Build command: `pnpm package:webos`.
