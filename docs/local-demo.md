# Local demo

Run `pnpm demo` from the project folder, then open `http://127.0.0.1:8080/?demo=1` on this PC. The server binds to localhost and serves the production client build, fictional catalog data, original generated artwork, profiles, search, and progress in memory. The preview uses the TV-style top menu; arrow keys, Enter, and Escape simulate a directional remote. The demo does not connect to PostgreSQL, the Xtream provider, Proxmox, or either TV. Its data resets when the process stops.

The optional playback sample is the [MDN HTML video example clip](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video). Download it to `demo-assets/flower.mp4` before starting the demo; the file is ignored by Git and is not included in the webOS package. The local server serves it with byte-range support. If the file is absent, catalog and navigation still work but demo playback returns an error.

## Connect Xtream

Open Settings → Xtream provider in the local app. The current provider URL and username are prefilled. Enter the password in the form and select **Connect and sync**. The server validates the login, then fetches live, movie, and series categories and catalog lists in sequence. Series episodes are fetched when opening a series. The password stays in the local server process memory and must be entered again after restarting it. Catalog records also currently live in memory. Playback resolves directly to the provider stream in the browser. Use the provider's HTTPS URL if it supports one; the supplied HTTP address does not encrypt credentials or video traffic.

The first sync can take time for a large account. The page reports its status and item count. The provider login request uses Xtream's `player_api.php`; the returned credentials never go to the app client except the username used for status display.

Movies, Shows, and Live TV pages expose their Xtream categories as horizontal remote-friendly filters. Selecting a category filters and paginates the server-side catalog; the TV does not load the full catalog to filter it.

To stop the demo, terminate the `pnpm demo` process. The production server remains `pnpm --dir server start` with PostgreSQL and protected environment configuration.
