# NightOwl for LG webOS TV

Version 0.3.13 tries the original provider stream first for MKV and other remux-capable movie and episode formats. If the browser or TV reports a playback error, NightOwl requests a server remux; it can still fall back to the compatibility transcode when the remux cannot be decoded. The webOS player uses the LG media service for accurate seeking on C9.

The browser and webOS app use the same player and series behavior.

Install the package from the Homebrew catalog at `https://marcpnut.github.io/repo`, or use the webOS TV CLI after pairing the TV in Developer Mode:

```powershell
ares-install --device <your-device-name> .\NightOwl-webos-c9-0.3.13.ipk
```


Build command: `pnpm package:webos`.


