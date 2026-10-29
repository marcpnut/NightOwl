# Local demo

Run `pnpm demo` from the project folder, then open `http://127.0.0.1:8080/?demo=1` on this PC. The server binds to localhost and serves the production client build, fictional catalog data, original generated artwork, profiles, search, and progress in memory. The preview uses the TV-style top menu; arrow keys, Enter, and Escape simulate a directional remote. The demo does not connect to PostgreSQL, the Xtream provider, Proxmox, or either TV. Its data resets when the process stops.

The optional playback sample is the [MDN HTML video example clip](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video). Download it to `demo-assets/flower.mp4` before starting the demo; the file is ignored by Git and is not included in the webOS package. The local server serves it with byte-range support. If the file is absent, catalog and navigation still work but demo playback returns an error.

To stop the demo, terminate the `pnpm demo` process. The production server remains `pnpm --dir server start` with PostgreSQL and protected environment configuration.
