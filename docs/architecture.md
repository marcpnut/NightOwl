# StreamCinema architecture

StreamCinema is a standalone LG webOS IPTV client and a central catalog server. It does not import or package the existing NextFlix application. The original repository was inspected as a compatibility reference only.

```text
Xtream provider → scheduled server sync → PostgreSQL catalog → authenticated /api/v1 → LG TVs
                     metadata only                              ↘ direct provider playback URL
```

## Server

- Node.js/TypeScript, Fastify, PostgreSQL, Zod. PostgreSQL is bound only to the private Compose network.
- Provider username/password are encrypted with AES-256-GCM in `provider_config`. The key comes from a protected environment variable. No provider administration API is exposed.
- The worker fetches live, VOD, and series category/list endpoints; then resumes series detail/episode imports from a checkpoint. Series details are refreshed when new or older than seven days. It retries transient failures, uses a PostgreSQL advisory lock to avoid overlapping jobs, and only marks missing catalog records unavailable after a successful nonempty list refresh.
- Catalog upserts operate in 100-item batches. Movie/series/live listing endpoints limit pages to 20 items. Episode browsing uses a separate 20-item page per season.
- Cached catalog data remains available while sync runs. Favorites and progress are stored in separate tables, so catalog refreshes preserve them.
- The server stores stream IDs and metadata, never media files. Playback resolution returns a provider URL to the authenticated TV. The TV streams directly from the provider.

## Client

- Standalone `com.streamcinema.iptv` webOS web app. A single Chrome 53-targeted package is intended for Nano and C9, but only compilation has been verified.
- The client keeps a server URL, TV API token, device ID, and selected profile ID locally. Profiles, favorites, and progress are scoped by device ID. It fetches one home payload and 20-item catalog pages on demand. Artwork is lazy-loaded.
- D-pad and Magic Remote pointer interactions use ordinary focusable buttons. Back closes playback, then details, then returns Home. The client saves progress centrally every 15 seconds and on exit.
- Playback uses the HTML video element, with available native text/audio tracks. Stream format and codec support require device testing.

## Security and current limitation

API requests require a bearer token and device ID except health. Fastify redacts the Authorization header, and stream URLs are never logged by application code. The API and database are not automatically exposed to the internet. The provided Compose file binds the API to loopback until a LAN address is deliberately configured. The shared bearer token means device ID separation prevents accidental profile mixing but does not provide cryptographic isolation between TVs.

Direct Xtream playback embeds provider credentials in the URL delivered to the TV. A nominal short-lived API response cannot revoke a provider URL, so this implementation does **not** claim short-lived playback access. Hiding those credentials would require a video proxy or provider-issued temporary tokens. The TV token is also stored in app-local storage and would traverse HTTP if the LAN API is configured without TLS. Internal TLS and physical-TV trust compatibility should be resolved before production deployment.
