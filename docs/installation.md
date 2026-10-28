# Installation and rollout

No Proxmox container or TV application was created or installed during development. The Proxmox host rejected key-only SSH and no host login was supplied. Container ID 190 and address 10.42.0.86 have **not** been confirmed available.

## Before provisioning

1. Obtain one consolidated owner approval for creating the new LXC and installing the **new** `com.streamcinema.iptv` development app. The existing `com.nextflix.iptv` package has a different ID and is left untouched.
2. On Proxmox, inspect `pct list`, `qm list`, storage, bridge, DNS, firewall, and existing address assignments. Verify ID 190 and 10.42.0.86 with both Proxmox inventory and the network's address reservation/DHCP records. Ping alone is insufficient. Choose and record alternatives if occupied.
3. Inspect the available Debian 13 template and supported container configuration. Prefer an unprivileged LXC with 2 vCPU, 4 GB RAM, 32 GB root, auto start, gateway 10.42.0.1, DNS 10.42.0.10. Do not alter host networking or existing guests.
4. Confirm whether Docker Compose is supported in this LXC setup before using the supplied Compose deployment. If nested Docker is unsuitable, run Node.js and PostgreSQL as separate native services inside the LXC; preserve the same environment variables and private database binding.

## Server configuration

The Compose file is in `deployment/`. Copy `env.example` to an untracked `.env` in that directory. Generate independent random values for PostgreSQL password, API token, and 32-byte base64 credential key. Protect the file with owner-only permissions. Use a URL-safe hex PostgreSQL password because it appears in `DATABASE_URL`.

Set `BIND_IP` to the verified LXC LAN address only after firewall review. The default is loopback. Set the three Xtream values for first boot; the server encrypts them in PostgreSQL. Remove the plaintext Xtream values from the protected env file after successful bootstrap and restart. Keep `CREDENTIAL_KEY` securely backed up; it is required to decrypt the provider settings. Do not commit `.env`.

From the deployment directory, use `docker compose up --build -d` only after the container and Docker support are verified. Check `/api/v1/health` from a LAN client and inspect `/api/v1/sync/status` with the bearer token and a TV UUID header. `MOCK_CATALOG=1` seeds synthetic metadata for an isolated development instance; turn it off before real provider sync. The database volume is persistent. Snapshot it before upgrades.

The API is HTTP in the sample Compose file. Production use should add an internal TLS endpoint whose certificate the TVs trust, or keep the service on a tightly controlled private LAN while accepting the token transport limitation. Do not forward the port on the router.

## TV package

Run `pnpm install`, `pnpm build`, then `pnpm package:webos` in the project folder. The client package ID is `com.streamcinema.iptv`; installing it will not replace the existing app. Before a development install, confirm the Nano's currently installed packages, save its relevant app data, verify the webOS package manager and a working removal/rollback path, and obtain the owner approval above. Do not deploy to the C9 until its connection details and authorization are supplied.

On first launch, enter the LAN server URL and TV access token. The client creates a per-TV identifier and a Default profile. Test Home, category pages, details, episodes, live, playback, subtitles, audio, Back, and progress on the Nano before considering the C9. If any stream fails, inspect its format and TV codec support without modifying the Netflix installation.
