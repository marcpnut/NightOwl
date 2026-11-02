# NightOwl for LG webOS TV

Version 0.3.30 adds Live TV favorites, channel surfing with remote Channel Up/Down keys, and centered playback error dialogs. Live TV scroll indicators align with the channel shelf. Provider-first playback and the existing shared profile features remain available.

The browser and webOS app use the same player and series behavior. The installed TV app asks for the server address on its sign-in screen.

Install the package from the Homebrew catalog at `https://marcpnut.github.io/repo`, or use the webOS TV CLI after pairing the TV in Developer Mode:

```powershell
ares-install --device <your-device-name> .\NightOwl-webos-c9-0.3.30.ipk
```


Build command: `pnpm package:webos`.



