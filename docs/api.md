# REST API

Base path: `/api/v1`. Except `GET /health`, send `Authorization: Bearer <API_TOKEN>` and `X-Device-Id: <TV UUID>`. Profiles and their data are scoped to that device ID. Responses use JSON. Validation failures use `400` with `{ "error": { "code", "message", "details" } }`. Unauthorized requests use `401`. Catalog pages are capped at 20.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Database-backed health check |
| GET | `/home?profileId=<uuid>` | Featured title and small home rows |
| GET | `/movies?page=1&limit=20&category=<id>` | Paged movies |
| GET | `/movies/:id` | Movie details |
| GET | `/series?page=1&limit=20&category=<id>` | Paged series |
| GET | `/series/:id` | Series details |
| GET | `/series/:id/seasons` | Season numbers and episode counts |
| GET | `/series/:id/seasons/:season/episodes?page=1&limit=20` | Paged episodes |
| GET | `/live?page=1&limit=20&category=<id>` | Paged live channels |
| GET | `/live/categories` | Live categories |
| GET | `/search?q=<text>&page=1&limit=20` | Search movies and series |
| GET/POST | `/profiles` | List/create profiles |
| GET | `/profiles/:id/continue-watching` | Recent unfinished items |
| GET/POST | `/profiles/:id/my-list` | List/update favorites |
| POST | `/profiles/:id/progress` | Save watch position |
| POST | `/playback/resolve` | Resolve `{kind,id,format?}` to direct stream URL |
| GET | `/sync/status` | Last sync attempt, success, cursor, and count |

Example progress body: `{ "kind": "movie", "id": "55", "positionSeconds": 120, "durationSeconds": 5400, "completed": false }`.

Example favorite body: `{ "kind": "movie", "id": "55", "saved": true }`.

The playback response contains a credential-bearing provider URL and must never be cached, shared, or included in diagnostics.
