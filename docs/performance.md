# Performance status

Engineering targets: health under 100 ms; cached catalog under 200 ms; home under 500 ms; usable TV interface under 3 seconds; cached details under 300 ms.

Local build measurements on 28 October 2026:

| Operation | Observed result | Scope |
|---|---:|---|
| Client production bundle | 21.32 kB JavaScript, 7.38 kB gzip | Build output, not TV memory use |
| Vite production compilation | 129 ms | Windows development PC |
| API authentication rejection | 3.61 ms | Fastify in-process test; no network or database |
| API input validation rejection | 2.88 ms | Fastify in-process test; no network or database |

PostgreSQL, provider sync, LAN API latency, image loading, TV startup, focus response, and actual playback latency were not measurable because the Proxmox container and TV development build were not deployed. These targets are not claimed as met.

Implementation controls: database indexes, batch upserts, last-known catalog serving, API page limits, at most 20 episode rows per request, lazy artwork, request cancellation when supported, no full catalog download to the TV. A large catalog load test and Nano/C9 timing traces are required after deployment.
