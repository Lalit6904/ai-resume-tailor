# API reference

Base URL: `/api` (development server: `http://localhost:4000/api`).

All routes except `GET /api/health` and the auth routes require authentication.
The server sets an httpOnly `art_session` cookie on register/login. Clients may
instead send `Authorization: Bearer <jwt>`.

Successful responses:

```json
{ "success": true, "data": { } }
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some submitted fields are invalid.",
    "details": [{ "field": "jobDescription", "message": "..." }],
    "requestId": "..."
  }
}
```

Every response includes `X-Request-Id`. State-changing requests with an
`Origin` header must match `CLIENT_ORIGIN`.

---

## Health

### `GET /api/health`

No authentication. Returns `200` when MongoDB is connected, `503` otherwise.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptimeSeconds": 42,
    "database": "connected",
    "storage": "local",
    "renderer": { "available": false, "renderer": "none", "previewMode": "html" },
    "aiProvider": "heuristic",
    "aiModel": "local-deterministic-v1",
    "activeJobs": 0,
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
}
```

`renderer.available` and `renderer.previewMode` are the honest source of truth for
whether previews are PDF or HTML.

---

## Authentication

### `POST /api/auth/register`

```json
{ "name": "Jordan Lee", "email": "jordan@example.com", "password": "Password123" }
```

Password: 8–128 chars, at least one letter and one number.
Returns `201` with the safe user object and sets `art_session`.
Conflicts with `409 EMAIL_IN_USE`.

### `POST /api/auth/login`

```json
{ "email": "jordan@example.com", "password": "Password123" }
```

Returns `200` and sets a fresh cookie. Wrong email and wrong password both return
`401 INVALID_CREDENTIALS` with the same message.

### `POST /api/auth/logout`

Clears the cookie. Returns `200 { "loggedOut": true }`.

### `GET /api/auth/me`

Returns the authenticated user:

```json
{ "success": true, "data": { "user": { "id": "...", "name": "Jordan Lee", "email": "..." } } }
```

---

## Resumes

### `POST /api/resumes`

`multipart/form-data` with one file field named `resume`. Only `.docx` is
accepted. Maximum size: `MAX_UPLOAD_MB` (default 10 MB).

Returns `201`:

```json
{
  "success": true,
  "data": {
    "resume": {
      "id": "...",
      "originalFilename": "Jordan Lee Resume.docx",
      "sizeBytes": 51234,
      "parseStatus": "ready",
      "document": {
        "documentHash": "...",
        "paragraphCount": 24,
        "editableCount": 14,
        "wordCount": 420,
        "sections": [{ "name": "EXPERIENCE", "headingLevel": 1, "paragraphCount": 6 }],
        "counts": {
          "tables": 1,
          "images": 1,
          "headers": 1,
          "footers": 1,
          "hyperlinks": 1,
          "lists": 2,
          "sections": 1,
          "resumeSections": 5
        },
        "warnings": ["Headers and footers are preserved but remain read-only."],
        "unsupported": []
      },
      "paragraphs": [
        {
          "id": "body:p7",
          "kind": "body",
          "text": "Worked on React and Node.js...",
          "section": "EXPERIENCE",
          "styleName": "Normal",
          "isHeading": false,
          "editable": true,
          "reasons": [],
          "runCount": 2,
          "mixedFormatting": true
        }
      ]
    }
  }
}
```

`paragraphs[].id` is a stable structural location (`part:pN`) and is the
`locationId` used by suggestions. It is not a database ID and remains stable
when only text changes.

Errors: `400 FILE_REQUIRED`, `400 UNSUPPORTED_FILE_TYPE`, `400 INVALID_DOCX`,
`413 FILE_TOO_LARGE`.

### `GET /api/resumes`

Lists only the caller's resumes, newest first. Each item uses the same summary
fields as above without the `paragraphs` array.

### `GET /api/resumes/:id`

```json
{
  "success": true,
  "data": {
    "resume": { "...": "detail as above" },
    "latestSession": {
      "id": "...",
      "jobTitle": "Senior Full Stack Engineer",
      "status": "completed",
      "stage": "completed",
      "progress": 100,
      "suggestionCount": 2,
      "editVersion": 3,
      "error": null,
      "createdAt": "..."
    },
    "latestExport": { "...": "export record or null" }
  }
}
```

`latestSession` and `latestExport` are `null` when none exist.

### `DELETE /api/resumes/:id`

Deletes the resume, its sessions, suggestions, exports, previews, and stored
files. Returns `{ "deleted": true }`.

Ownership: an unauthorized ID returns `404 RESUME_NOT_FOUND` on every route.

---

## Analysis

### `POST /api/resumes/:id/analyze`

```json
{ "jobDescription": "Senior Full Stack Engineer\n\nWe are looking for..." }
```

Length: 50–50,000 characters. Returns `202`:

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "...",
      "resumeId": "...",
      "label": "Senior Full Stack Engineer",
      "status": "queued",
      "stage": "queued",
      "progress": 0,
      "jobAnalysis": null,
      "requirements": [],
      "matchingSummary": null,
      "ai": null,
      "editVersion": 1,
      "suggestionCount": 0,
      "error": null,
      "createdAt": "..."
    }
  }
}
```

Errors: `400 VALIDATION_ERROR`, `404 RESUME_NOT_FOUND`,
`409 RESUME_NOT_READY`.

### `GET /api/resumes/:id/analysis`

Returns the latest session for the resume, or `404 NO_SESSION`.

### `GET /api/resumes/:id/sessions`

Returns session summaries for the resume, newest first.

### `GET /api/sessions/:sessionId`

Returns `{ session, resumeId }`. Use this to poll status.

`status` progression: `queued` → `analyzing` → `completed` or `failed`.
Honest `stage` values: `queued`, `analyzing_job`, `analyzing_resume`,
`generating_suggestions`, `completed`, `failed`. `progress` is 0–100.

When completed, the payload includes:

- `requirements[]`: `{ id, text, type, category, importance, status, evidence[] }`
  with status `demonstrated`, `partially_demonstrated`, `not_evidenced`, or
  `pending`.
- `matchingSummary`: counts of total/demonstrated/partially/not evidenced.
- `coverage`: percentage of requirements with evidence (added by the API).
- `ai`: `{ provider, model, warnings[], discarded[] }`. Discarded suggestions
  explain which safety rule rejected them.
- `error`: `{ code, message, recoverable, retryable }` when failed.

### `POST /api/sessions/:sessionId/retry`

Only failed sessions. Requeues analysis, clears old suggestions, returns `202`.
Errors: `409 SESSION_NOT_FAILED`, `409 SESSION_RETRY_CONFLICT`.

---

## Review

### `GET /api/resumes/:id/edits?sessionId=<id>`

`sessionId` is optional; without it the latest session is used.

```json
{
  "success": true,
  "data": {
    "session": { "...": "session" },
    "edits": [
      {
        "id": "...",
        "sessionId": "...",
        "locationId": "body:p7",
        "part": "body",
        "sectionName": "EXPERIENCE",
        "originalText": "Worked on React and Node.js...",
        "proposedText": "Contributed to React and Node.js...",
        "finalText": null,
        "effectiveText": "Contributed to React and Node.js...",
        "reason": "...",
        "evidence": "Worked on React and Node.js...",
        "requirementIds": ["REQ-1"],
        "risk": "low",
        "status": "pending",
        "validation": { "status": "valid", "warnings": [], "formatting": "full" },
        "version": 1,
        "order": 0,
        "ai": { "provider": "heuristic", "model": "local-deterministic-v1" },
        "decidedAt": null,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "summary": {
      "total": 2,
      "pending": 2,
      "approved": 0,
      "rejected": 0,
      "modified": 0,
      "highRisk": 0
    }
  }
}
```

`effectiveText` is `finalText` for modified suggestions, otherwise
`proposedText`.

### `PATCH /api/resumes/:id/edits/:editId`

```json
{ "action": "accept", "version": 1 }
```

Actions:

| Action | Body | Result |
| --- | --- | --- |
| `accept` | `{ action, version? }` | status `approved`, clears `finalText` |
| `reject` | `{ action, version? }` | status `rejected` |
| `modify` | `{ action, text, version? }` | status `modified`, sets `finalText` |
| `reset` | `{ action, version? }` | status `pending`, clears `finalText` |

`text` is 1–3,000 characters, cannot contain line breaks, tabs, or control
characters, and is whitespace-normalized. `version` is optional but strongly
recommended; if supplied it must equal the edit's current version.

Returns:

```json
{
  "success": true,
  "data": {
    "edit": { "...": "updated edit" },
    "editVersion": 2
  }
}
```

`editVersion` is the session-level version used for export staleness.

Errors: `400 INVALID_REVIEW_ACTION`, `400 INVALID_EDIT_TEXT`,
`404 EDIT_NOT_FOUND`, `409 STALE_REVIEW_VERSION` (includes
`details.currentVersion`), `409 SESSION_NOT_COMPLETED`.

### `POST /api/resumes/:id/edits/bulk-review`

```json
{
  "action": "accept_all",
  "sessionId": "...",
  "filters": { "section": "EXPERIENCE", "risk": "low" }
}
```

Actions:

| Action | Applies to |
| --- | --- |
| `accept_all` | all `pending` suggestions matching filters |
| `reject_all` | all `pending` suggestions matching filters |
| `reset_all` | all suggestions matching filters |

Returns `{ modifiedCount, edits, summary, editVersion }`. The session
`editVersion` increments once if anything changed.

---

## Export

### `POST /api/resumes/:id/export`

```json
{ "sessionId": "..." }
```

`sessionId` is optional; latest is used. Only `approved` and `modified`
suggestions are included. Pending/rejected suggestions are counted in
`excluded`.

Returns `202` with the export record:

```json
{
  "success": true,
  "data": {
    "export": {
      "id": "...",
      "sessionId": "...",
      "resumeId": "...",
      "filename": "Jordan Lee Resume-tailored-2026-10-24.docx",
      "sizeBytes": 0,
      "sha256": "",
      "previewAvailable": false,
      "sourceEditVersion": 3,
      "appliedEditIds": [],
      "excluded": { "pending": 0, "rejected": 0 },
      "validation": { "status": "pending", "checks": [], "warnings": [] },
      "status": "processing",
      "error": null,
      "expiresAt": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

Errors: `409 SESSION_NOT_COMPLETED`, `422 NO_APPROVED_EDITS`.

### `GET /api/resumes/:id/export-status?exportId=<id>`

`exportId` is optional; without it the latest export is returned. When none
exist: `{ "export": null, "stale": false }`.

```json
{
  "success": true,
  "data": {
    "export": {
      "status": "ready",
      "validation": {
        "status": "passed",
        "checks": [
          { "name": "parts_preserved", "passed": true, "details": "..." },
          { "name": "structure_preserved", "passed": true, "details": "..." },
          { "name": "formatting_properties_unchanged", "passed": true, "details": "..." },
          { "name": "text_correct", "passed": true, "details": "..." },
          { "name": "only_approved_applied", "passed": true, "details": "..." }
        ],
        "warnings": [
          "No Office renderer was available, so visual page count and pixel layout were not verified."
        ],
        "renderer": "none",
        "pageCount": null,
        "originalPageCount": null
      },
      "appliedEditIds": ["..."],
      "excluded": { "pending": 0, "rejected": 1 },
      "sizeBytes": 51234,
      "sha256": "..."
    },
    "stale": false,
    "currentEditVersion": 3
  }
}
```

`stale: true` means review decisions changed after this export was generated.
Request a new export rather than using the old file.

Export statuses: `processing`, `ready`, `failed`, `expired`.

### `GET /api/resumes/:id/download?exportId=<id>`

Streams the validated DOCX with `Content-Disposition: attachment`, the generated
filename, `Cache-Control: private, no-store`, and `X-Content-Type-Options:
nosniff`. Without `exportId`, the latest ready export is used.

Errors: `404 EXPORT_NOT_FOUND`, `409 EXPORT_NOT_READY`, `410 EXPORT_EXPIRED`,
`404 FILE_NOT_FOUND`.

### `GET /api/resumes/:id/preview?exportId=<id>`

Returns either:

```json
{
  "success": true,
  "data": {
    "mode": "pdf",
    "export": { "...": "record" },
    "stale": false,
    "validation": { "...": "..." },
    "note": "Rendered from the validated exported DOCX with LibreOffice...",
    "pdfUrl": "/api/resumes/.../preview/pdf?exportId=..."
  }
}
```

or, when LibreOffice is unavailable:

```json
{
  "success": true,
  "data": {
    "mode": "html",
    "export": { "...": "record" },
    "stale": false,
    "validation": { "...": "..." },
    "html": "<div class=\"doc-preview\">...</div>",
    "paragraphCount": 24,
    "counts": { "...": "..." },
    "warnings": ["..."],
    "note": "This is an HTML content preview generated directly from the exported DOCX. Word may paginate and reflow it differently. Open the downloaded DOCX for final layout review."
  }
}
```

The HTML is generated from the actual exported DOCX, but it is a content
reconstruction — not a pixel-perfect page render.

### `GET /api/resumes/:id/preview/pdf?exportId=<id>`

Returns `application/pdf` inline when a rendered PDF exists.
Errors: `404 PREVIEW_NOT_AVAILABLE`, `410 EXPORT_EXPIRED`.

---

## Common error codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Zod validation failed; see `details[]` |
| 400 | `FILE_REQUIRED` | No multipart `resume` file |
| 400 | `UNSUPPORTED_FILE_TYPE` | Not `.docx` |
| 400 | `INVALID_DOCX` | Corrupt, encrypted, or unsafe package |
| 400 | `INVALID_REVIEW_ACTION` | Unknown review action |
| 400 | `INVALID_EDIT_TEXT` | Empty, too long, newline, tab, or control char |
| 401 | `UNAUTHORIZED` | Missing/invalid session |
| 401 | `SESSION_EXPIRED` | Expired JWT |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 403 | `ORIGIN_NOT_ALLOWED` | Browser origin not in `CLIENT_ORIGIN` |
| 404 | `RESUME_NOT_FOUND` | Missing or not owned |
| 404 | `SESSION_NOT_FOUND` | Missing or not owned |
| 404 | `EDIT_NOT_FOUND` | Missing or not owned |
| 404 | `EXPORT_NOT_FOUND` | No export available |
| 409 | `EMAIL_IN_USE` | Duplicate account |
| 409 | `STALE_REVIEW_VERSION` | Edit/session changed; refresh |
| 409 | `STALE_TARGET` | Export target paragraph no longer exists |
| 409 | `STALE_ORIGINAL_TEXT` | Source paragraph text changed; regenerate |
| 409 | `CONFLICTING_EDITS` | Two edits target one location |
| 409 | `SESSION_NOT_COMPLETED` | Analysis still running |
| 409 | `REVIEW_CHANGED_DURING_EXPORT` | Decisions changed mid-export |
| 409 | `EXPORT_NOT_READY` | Export still processing |
| 410 | `EXPORT_EXPIRED` | Retention removed the file |
| 413 | `FILE_TOO_LARGE` | Upload exceeds limit |
| 422 | `NO_APPROVED_EDITS` | Nothing approved to export |
| 422 | `UNSUPPORTED_TARGET` | Edit targets read-only content |
| 429 | `RATE_LIMITED` | Per-IP limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502/503/504 | `AI_INVALID_OUTPUT`, `AI_UNAVAILABLE`, `AI_TIMEOUT`, ... | Provider failure; retry or check configuration |

---

## Concurrency model

- Each `ResumeEdit` has its own `version`, starting at 1.
- Each session has `editVersion`, starting at 1 and incremented after every
  decision change (single or bulk).
- `PATCH` with a stale `version` returns `409 STALE_REVIEW_VERSION`.
- An export captures `sourceEditVersion`. When it differs from the session at
  generation time, the job fails with `REVIEW_CHANGED_DURING_EXPORT`, and after
  generation the status endpoint reports `stale: true`.
- `ResumeEdit` has a unique `(sessionId, locationId)` index, so two suggestions
  cannot target the same paragraph within a session.
