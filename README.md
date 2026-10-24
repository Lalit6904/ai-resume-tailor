# AI Resume Tailor

Evidence-based resume tailoring for DOCX files. Upload a resume, paste a job
description, review concrete suggestions, and export a copy of the DOCX with
only the approved changes applied. The original file and its formatting are
never modified.

> **What this is not:** it does not invent experience, skills, metrics,
> employers, dates, degrees, certifications, or contact details, and it does not
> promise interview calls, ATS scores, or hiring outcomes. Suggestions are
> derived from text already present in your resume and are validated on the
> server before they are shown.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [AI providers](#ai-providers)
- [DOCX editing and safety model](#docx-editing-and-safety-model)
- [Review and export workflow](#review-and-export-workflow)
- [API](#api)
- [Testing](#testing)
- [Docker deployment](#docker-deployment)
- [Render + MongoDB Atlas](#render--mongodb-atlas)
- [Production checklist](#production-checklist)
- [Privacy and security](#privacy-and-security)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)

---

## Features

- **DOCX upload and parsing** with a real structural parser
  (`@xmldom/xmldom` + JSZip), not a plain-text round trip.
- **Job-description analysis** that extracts requirements, skills, tools,
  responsibilities, and terminology, then maps each requirement to resume
  evidence.
- **Evidence-based suggestions** with original text, proposed text, reason,
  risk level, formatting warnings, and the exact paragraph they target.
- **Anti-fabrication validation** on the server: new numbers, dates, degrees,
  certifications, guarantees, contact details, and unsupported requirement
  keywords are rejected rather than displayed.
- **Review workflow** with `pending`, `approved`, `rejected`, and `modified`
  states; accept, reject, edit, reset, accept-all, reject-all, filters, and
  optimistic concurrency.
- **Approved-only export** to a new DOCX. Pending and rejected suggestions are
  excluded, and the output is re-parsed and validated.
- **Package preservation**: untouched zip parts remain byte-for-byte identical;
  only the changed XML part is re-serialized.
- **Read-only safety** for headers, footers, headings, hyperlinks, fields,
  images/drawings, tracked changes, content controls, tabs/manual breaks, and
  other structures that cannot be edited safely.
- **Final preview**: PDF via LibreOffice when available; otherwise an explicitly
  labeled HTML *content* preview. Download always returns the validated DOCX.
- **Private storage** (`local` or S3-compatible), ownership checks on every
  resume, export, session, and preview route.
- **Retention and cleanup** with configurable expiry, plus recovery of
  interrupted analysis jobs on startup.
- **Rate limiting, Helmet, CORS allow-list, origin checks, Zod validation,
  centralized errors, and request IDs.**

**Stack:** React 19 + Vite 6 + Tailwind CSS, Express 4, MongoDB + Mongoose,
Zod, Multer, JSZip, Mammoth, Helmet, Vitest + Supertest.

---

## How it works

```text
Browser
  │  upload DOCX / paste JD
  ▼
Express API ── Multer (memory) ── DOCX security + parser
  │                                  │
  │                                  ├─ document.xml / headers / footers
  │                                  ├─ styles, numbering, relationships
  │                                  └─ editable vs. read-only paragraphs
  ▼
Job queue (in-process) ── AI provider ── deterministic validation
  │                       (heuristic | OpenAI-compatible | Anthropic)
  ▼
MongoDB: sessions, requirements, suggestions, decisions, exports
  │
  ▼
Review UI ── accept / reject / edit
  │
  ▼
Export job ── apply approved edits to a copy ── re-parse + validate
  │
  ├─ DOCX download
  └─ preview (PDF if LibreOffice, else HTML content preview)
```

The analysis and export jobs are persisted in MongoDB. Work runs in-process in
this build, so a server restart marks interrupted jobs as failed with a
retryable error instead of leaving them "processing" forever.

---

## Quick start

### Requirements

- Node.js **20+** (tested on Node 24.22.1)
- MongoDB **6+** reachable at `mongodb://127.0.0.1:27017` (or set
  `MONGODB_URI`)
- Optional: LibreOffice for PDF previews

### Install and run in development

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run dev
```

- API: <http://localhost:4000>
- UI: <http://localhost:5173> (Vite proxies `/api` to port 4000)

The default `AI_PROVIDER=heuristic` is a deterministic local analyzer. It makes
no external API calls and is clearly labeled as non-LLM in the UI and health
endpoint. To use an LLM, see [AI providers](#ai-providers).

### Run as a single production-style server

```bash
npm run build                 # builds client/dist
npm start                     # serves API + SPA on http://localhost:4000
```

`createApp()` serves `client/dist` and falls back to `index.html` for client-side
routes when the build exists. The default `CLIENT_ORIGIN` allows both the Vite
dev origin (5173) and the single-server origin (4000); if you change `PORT`, add
the new origin to `CLIENT_ORIGIN`.

### Tests

```bash
npm test                      # 34 Vitest/Supertest tests
node scripts/smoke-test.mjs   # live HTTP test; server must be running
```

---

## Configuration

Copy `.env.example` to `.env`. The server validates every value with Zod at
startup and refuses unsafe production combinations.

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `4000` | HTTP port |
| `CLIENT_ORIGIN` | `http://localhost:5173,http://localhost:4000` | Comma-separated allowed browser origins. Use the public UI origin in production. |
| `JWT_SECRET` | dev-only value | Required to be unique and ≥ 32 chars in production |
| `JWT_EXPIRES_IN` | `7d` | JWT lifetime |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `TRUST_PROXY` | `false` | Set `true` behind one trusted reverse proxy |
| `MONGODB_URI` | local | MongoDB connection string |
| `AI_PROVIDER` | `heuristic` | `heuristic`, `openai`, or `anthropic` |
| `AI_API_KEY` | empty | Required for LLM providers |
| `AI_MODEL` | `gpt-4.1-mini` | Set the correct model for your provider |
| `AI_BASE_URL` | empty | OpenAI-compatible gateway or proxy base URL |
| `AI_TIMEOUT_MS` | `60000` | Per-attempt timeout |
| `AI_MAX_RETRIES` | `2` | Retries for transient failures |
| `AI_MAX_OUTPUT_TOKENS` | `4000` | Output token cap |
| `AI_MAX_RESUME_CHARS` | `14000` | Resume content sent to the provider |
| `AI_MAX_JD_CHARS` | `14000` | Job-description content sent to the provider |
| `MAX_UPLOAD_MB` | `10` | Maximum DOCX size |
| `STORAGE_DIR` | `./storage` | Private local storage root |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | empty | Required when `STORAGE_DRIVER=s3`; endpoint supports S3-compatible providers |
| `LIBREOFFICE_PATH` | empty | Explicit `soffice` path; otherwise auto-detected |
| `RETENTION_DAYS` | `30` | `0` disables expiry |
| `CLEANUP_INTERVAL_MINUTES` | `60` | `0` disables the scheduled cleanup |
| `RATE_LIMIT_MAX` | `300` | Requests per IP per 15 minutes |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `LOG_AI_METADATA` | `false` | Logs token counts/timing only, never resume text |
| `VITE_API_BASE_URL` | empty | Optional client API origin; empty uses same-origin/Vite proxy |

Production validation also rejects wildcard CORS origins, a default/weak JWT
secret, missing AI keys for LLM providers, and incomplete S3 configuration.

---

## AI providers

### `heuristic` (default)

A deterministic local analyzer. It can:

- score requirement coverage against resume text,
- propose reordering or equivalent verb changes that preserve the original
  claims,
- flag gaps without inventing content.

It is intentionally conservative and is **not an LLM**. The UI and `/api/health`
report `aiProvider: "heuristic"`.

### OpenAI-compatible (`openai`)

```env
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4.1-mini
# Optional, for Azure/OpenAI-compatible gateways:
AI_BASE_URL=https://your-gateway.example/v1
```

Uses the `/chat/completions` API with JSON output. If a gateway rejects
`response_format`, the client retries once without it.

### Anthropic (`anthropic`)

```env
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-...
# Optional proxy base URL:
AI_BASE_URL=https://api.anthropic.com/v1
```

All providers are wrapped with timeouts, bounded retries with backoff, JSON
extraction, Zod schema validation, and the same deterministic suggestion
validator. Evidence is redacted for contact details before content is sent to an
external provider.

---

## DOCX editing and safety model

### What is editable

Safe body and table paragraphs with plain text runs, no unsupported structures,
and at most 4,000 characters. Formatting is preserved by replacing text inside
existing runs using a common-prefix/suffix strategy:

- paragraph style, numbering, alignment, and section properties stay in place,
- unchanged prefix/suffix runs keep their original formatting,
- the new middle text uses the first replaced run's inline formatting.

### What is read-only

The parser marks these as read-only and the API refuses to edit them:

- headers and footers,
- headings and title-styled paragraphs,
- hyperlinks (to keep links intact),
- fields, page numbers, and cross-references,
- images, drawings, text boxes, and embedded objects,
- tracked changes, comments, and content controls,
- paragraphs containing tabs or manual line breaks,
- empty or over-long paragraphs,
- other unsupported/nested content.

Read-only content is still preserved in the exported package.

### Package integrity

- The uploaded original is stored privately and never mutated.
- Export loads a fresh copy, re-parses it, and verifies that each target's
  original text still matches before writing.
- Duplicate edits to one location, stale locations, stale source text, read-only
  targets, invalid replacement text, and document-hash mismatches are rejected.
- Untouched zip entries are copied as-is. Only XML parts with changed text are
  serialized again.
- The output is re-parsed and checked for package integrity, structure counts,
  formatting properties, paragraph count, expected text at every location, and
  inclusion of approved edits only.

Each exported document records SHA-256 hashes, validation checks, applied IDs,
excluded counts, and warnings. The download filename is generated from the
original name and date.

---

## Review and export workflow

1. **Upload** a `.docx` file (max `MAX_UPLOAD_MB`).
2. **Paste a job description** (50–50,000 characters) and start analysis.
3. **Review suggestions** in three tabs:
   - *Suggestions* — accept, reject, edit, reset, filter by section/risk, bulk
     actions.
   - *Job match* — requirement-by-requirement evidence coverage.
   - *Preview & export* — export, poll status, preview, download.
4. **Decisions are versioned.** Every change increments the session's
   `editVersion`; stale writes return `409 STALE_REVIEW_VERSION`.
5. **Export** applies only `approved` and `modified` suggestions. If nothing is
   approved, the API returns `422 NO_APPROVED_EDITS` rather than producing an
   identical file.
6. **An export becomes stale** when review decisions change after it was
   generated. The UI shows this and lets you request a fresh export.
7. **Preview** is a PDF render when LibreOffice is available; otherwise it is an
   HTML content preview with an explicit note that Word pagination may differ.
8. **Download** the validated DOCX and review it in Word before submitting it.

---

## API

All routes are under `/api`. Authentication uses an httpOnly `art_session`
cookie (JWT); a Bearer token is also accepted. Errors use a consistent shape:

```json
{
  "success": false,
  "error": {
    "code": "STALE_REVIEW_VERSION",
    "message": "This suggestion was changed in another action.",
    "details": { "currentVersion": 3 },
    "requestId": "..."
  }
}
```

See [docs/API.md](docs/API.md) for request/response details and status codes.

Quick reference:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Database, storage, renderer, AI provider, active jobs |
| `POST` | `/api/auth/register` | Create account and set cookie |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Clear cookie |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/resumes` | Upload DOCX (multipart field `resume`) |
| `GET` | `/api/resumes` | List own resumes |
| `GET` | `/api/resumes/:id` | Resume detail + latest session/export |
| `DELETE` | `/api/resumes/:id` | Delete resume and artifacts |
| `POST` | `/api/resumes/:id/analyze` | Queue analysis |
| `GET` | `/api/resumes/:id/analysis` | Latest session |
| `GET` | `/api/resumes/:id/sessions` | Session history |
| `GET` | `/api/sessions/:sessionId` | Session status/requirements |
| `POST` | `/api/sessions/:sessionId/retry` | Retry a failed analysis |
| `GET` | `/api/resumes/:id/edits?sessionId=` | Suggestions + summary |
| `PATCH` | `/api/resumes/:id/edits/:editId` | accept/reject/modify/reset |
| `POST` | `/api/resumes/:id/edits/bulk-review` | accept_all/reject_all/reset_all |
| `POST` | `/api/resumes/:id/export` | Queue approved-only export |
| `GET` | `/api/resumes/:id/export-status` | Export status, stale flag |
| `GET` | `/api/resumes/:id/download` | Download validated DOCX |
| `GET` | `/api/resumes/:id/preview` | PDF URL or HTML content preview |
| `GET` | `/api/resumes/:id/preview/pdf` | PDF bytes (when available) |

---

## Testing

The repository has two layers of verification.

### Automated suite

```bash
npm test
```

Latest actual result on this machine (Node 24.22.1, Windows, local MongoDB):

```text
Test Files  7 passed (7)
     Tests  34 passed (34)
  Duration  ~30s
```

Coverage includes:

- auth cookie hardening, bearer auth, duplicate/wrong-password paths, origin
  allow-list enforcement,
- upload validation, DOCX parsing metadata, ownership isolation, delete,
- DOCX parse/edit/re-parse, XML-sensitive characters, stale targets,
  read-only targets, line-break/control-character rejection,
- suggestion validation against fabricated numbers, credentials, guarantees,
  contact information, weak/unrelated evidence, duplicates, expansion,
- full workflow: queue → poll → review → concurrency → export → validate →
  download → preview → bulk actions → modify → stale detection → retry,
- startup recovery: interrupted analyses and exports are marked failed and
  retryable rather than left processing,
- module graph: every server source module is imported so broken relative paths
  fail in CI instead of at startup.

The suite uses an isolated test database (`ai_resume_tailor_test`) and temporary
storage. It does not call any AI provider.

### Live smoke test

Start the server, then in another terminal:

```bash
npm start
node scripts/smoke-test.mjs
```

Latest actual result: **26/26 live checks passed**, including registration,
DOCX upload, analysis polling, accepting a suggestion, export validation,
download/re-parse, HTML preview fallback, SPA shell/deep-link serving, and
deletion.

### Client build

```bash
npm run build
```

Vite production build completes successfully (1,670 modules transformed).

---

## Docker deployment

### Compose (app + MongoDB)

1. Create `.env` from `.env.example` and set **strong** values:

   ```env
   JWT_SECRET=<at-least-32-random-characters>
   MONGO_ROOT_USERNAME=art
   MONGO_ROOT_PASSWORD=<strong-database-password>
   CLIENT_ORIGIN=http://localhost:4000
   COOKIE_SECURE=false          # true behind HTTPS
   ```

   Use a URL-safe Mongo password, or URL-encode it in `MONGODB_URI`.

2. Build and start:

   ```bash
   docker compose up --build -d
   docker compose logs -f app
   ```

3. Open <http://localhost:4000>. The SPA and API are served by the same origin.

MongoDB data and private resume storage are kept in named volumes
(`mongo-data`, `art-storage`). Compose requires `MONGO_ROOT_PASSWORD` and
`JWT_SECRET`; it will not start with empty values.

### Standalone image

```bash
docker build -t ai-resume-tailor .
docker run --rm -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=<32+ chars> \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/ai_resume_tailor \
  -e CLIENT_ORIGIN=http://localhost:4000 \
  -v art-storage:/app/storage \
  ai-resume-tailor
```

To include LibreOffice for PDF previews:

```bash
docker build --build-arg INSTALL_LIBREOFFICE=true -t ai-resume-tailor:pdf .
```

The image runs as the non-root `node` user. Storage is a volume at `/app/storage`.

### Reverse proxy notes

- Terminate TLS at the proxy and set `COOKIE_SECURE=true`.
- Set `TRUST_PROXY=true` for exactly one trusted proxy hop.
- Set `CLIENT_ORIGIN` to the exact public origin.
- Forward `X-Request-Id` if your proxy generates one (optional).
- Keep `/api/health` available for load-balancer checks.
- The in-process job runner should run as **one** app replica unless you add a
  shared queue. Multiple replicas will each process their own jobs; persisted
  job status is still consistent, but there is no cross-replica worker
  coordination.

---

## Render + MongoDB Atlas

The repository includes [`render.yaml`](render.yaml) for deploying the app as a
single Docker web service on Render, with MongoDB Atlas as the database and a
Render persistent disk for private storage.

1. Create an Atlas cluster and copy the SRV connection string.
2. Push the repository to GitHub.
3. Render Dashboard → **New → Blueprint** → select the repository → paste
   `MONGODB_URI` → **Apply**.

`JWT_SECRET` is generated by Render. `CLIENT_ORIGIN` is derived from Render's
`RENDER_EXTERNAL_URL` unless you set it explicitly (required for a custom
domain). The full walkthrough — Atlas setup, verification, custom domains,
LibreOffice previews, backups, costs, and troubleshooting — is in
[`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md).

---

## Production checklist

- [ ] Replace the example `JWT_SECRET` with a random 32+ character secret.
- [ ] Set `NODE_ENV=production`.
- [ ] Set `CLIENT_ORIGIN` to the exact public HTTPS origin (no wildcards).
- [ ] Set `COOKIE_SECURE=true` and `TRUST_PROXY=true` behind TLS.
- [ ] Use MongoDB with authentication and TLS (managed service recommended).
- [ ] Use `STORAGE_DRIVER=s3` with private, encrypted object storage and
      lifecycle rules; otherwise mount a persistent private volume.
- [ ] Set `RETENTION_DAYS` to match your policy and confirm cleanup runs.
- [ ] Set AI provider credentials via secrets management, not committed files.
- [ ] Ensure `MAX_UPLOAD_MB`, body limits, and rate limits match your traffic.
- [ ] Configure log collection; resume text and API keys are not logged.
- [ ] Run `npm test`, the smoke test, and a real DOCX review in Word.
- [ ] Back up MongoDB metadata and storage consistently.
- [ ] Add a shared job queue before scaling to multiple app replicas.

---

## Privacy and security

- Authentication uses a signed JWT in an httpOnly, SameSite=Lax cookie. In
  production, set `COOKIE_SECURE=true`.
- Every resume/session/edit/export/preview query is scoped by `userId`.
  Unauthorized access returns a consistent 404 rather than leaking existence.
- State-changing requests with a browser `Origin` header must match the
  configured allow-list (defense in depth alongside SameSite cookies).
- Uploaded files are private, randomly named, and served only through
  authenticated endpoints — never from a public directory.
- DOCX parsing is hardened: zip entry count/size limits, path/ZIP-slip
  protection, XML size limits, unsafe external-relationship handling, and no
  macro execution.
- AI content is redacted (emails, phone numbers, URLs, LinkedIn) before being
  sent to an external provider. Resume content is never logged.
- Retention deletes expired resumes, exports, previews, suggestions, and stored
  files. Users can delete a resume immediately.
- `helmet` adds security headers; CSP is enabled in production.
- API errors are centralized and do not expose stack traces in production.

---

## Known limitations

- **No Office renderer by default.** Without LibreOffice, preview is an HTML
  content reconstruction, not a pixel/pagination-accurate rendering. Open the
  downloaded DOCX in Word for final layout review.
- **Even with LibreOffice**, PDF rendering is an approximation of how Word will
  lay out the document. Fonts unavailable on the server can reflow text.
- **Inline formatting can change** when an edit spans mixed-format runs. The
  paragraph style is preserved, but the new middle text uses the first replaced
  run's inline formatting. This is surfaced as a warning in review and export.
- **Some content is intentionally not editable**: headers, footers, headings,
  hyperlinks, fields, images, tracked changes, content controls, and paragraphs
  with tabs/manual breaks. They are preserved but cannot be rewritten.
- **No structural edits**: the engine does not add/remove paragraphs, sections,
  tables, lists, or pages. It only replaces text inside existing editable
  paragraphs. Adding or removing paragraphs would risk breaking layout.
- **Heuristic mode is not an LLM.** It is conservative and primarily surfaces
  coverage gaps and safe phrasing changes. It will not deeply rewrite a resume.
- **LLM output is untrusted.** Suggestions are schema-validated and
  evidence-checked; unsafe ones are dropped. This reduces fabrication but cannot
  prove that a statement is true — users must review every change.
- **No ATS score or hiring guarantee.** Keyword coverage is a simple,
  transparent measure of requirement tokens evidenced in the resume, not a
  prediction.
- **In-process jobs.** A restart marks queued/analyzing/processing work as failed
  or interrupted; users can retry. There is no distributed queue or
  exactly-once guarantee.
- **Single-server static serving.** If the client is hosted separately, configure
  CORS and cookies correctly (`CLIENT_ORIGIN`, HTTPS, SameSite).
- **No email verification, password reset, MFA, or admin console** in this
  build.
- **No virus scanning.** Uploads are limited to DOCX and structurally validated,
  but production deployments should add malware scanning.
- **Not tested against every DOCX producer.** Word, Google Docs, LibreOffice,
  and template-heavy documents can contain structures that are preserved but
  read-only, or that trigger a warning.
- **Browser support** targets current evergreen browsers. Legacy browsers and
  IE are not supported.
- **Local storage is process-local.** Multiple replicas need shared S3-compatible
  storage.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Invalid environment configuration` | Compare `.env` with `.env.example`; Zod lists the failing key. |
| `JWT_SECRET must be ...` | Production requires a unique 32+ character secret. |
| `AI_PROVIDER=... requires AI_API_KEY` | Set `AI_API_KEY` or use `AI_PROVIDER=heuristic`. |
| `ECONNREFUSED 127.0.0.1:27017` | Start MongoDB or set `MONGODB_URI`. |
| Upload rejected as `INVALID_DOCX` | The file is not a valid DOCX zip, or it is password-protected/corrupt. |
| No suggestions | The JD may not overlap with safe, editable paragraphs; review the match tab and read-only warnings. This is expected rather than fabricated. |
| No editable paragraphs | All content is headings, headers/footers, links, or otherwise read-only. |
| Preview says HTML fallback | LibreOffice is not installed/detected. Set `LIBREOFFICE_PATH` or install it. |
| Export fails validation | Review the error details; re-generate suggestions if the source changed. |
| Export is stale | Review decisions changed after export; request a new export. |
| Analysis interrupted after restart | Retry the session; interrupted jobs are marked failed on startup. |
| `429 RATE_LIMITED` | Increase `RATE_LIMIT_MAX` or wait for the 15-minute window. |

---

## Project structure

```text
ai-resume-tailor/
├── client/                  # React + Vite SPA
│   ├── src/
│   │   ├── components/      # shell, dropzone, review cards, export panel
│   │   ├── context/         # auth + toast
│   │   ├── pages/           # landing, auth, dashboard, upload, resume, review
│   │   └── services/api.js  # Axios client, blob download helpers
│   └── dist/                # production build (git-ignored, served by server)
├── server/
│   ├── src/
│   │   ├── config/          # env validation, DB, paths
│   │   ├── controllers/     # auth, resume, analysis, edit, export
│   │   ├── jobs/            # in-process persisted job runner
│   │   ├── middleware/      # auth, upload, validation, errors
│   │   ├── models/          # User, Resume, Session, Edit, Export
│   │   ├── routes/          # API routes
│   │   ├── services/
│   │   │   ├── ai/          # providers, prompts, schemas, validator
│   │   │   ├── documents/   # security, parser, editor, validator, renderer
│   │   │   ├── resume/      # upload/list/delete, sessions, retention
│   │   │   ├── review/      # decisions, bulk review, export
│   │   │   └── storage/     # local + S3-compatible private storage
│   │   └── validators/      # Zod request schemas
│   └── tests/               # Vitest + Supertest suites and DOCX fixtures
├── scripts/smoke-test.mjs   # live HTTP end-to-end checks
├── docs/API.md              # API reference
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## License

No license file is included. Treat this as a private project unless you add one.
