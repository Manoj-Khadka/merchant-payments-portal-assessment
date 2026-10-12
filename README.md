# Merchant Payments Portal

An Angular merchant-onboarding portal for submitting, reviewing and deciding
merchant payment applications. The UI is built entirely from Angular standalone
components with signals, typed reactive forms and **Angular Material** (Material 3
tokens) styled with SCSS. A small **Express mock API** ships in `mock-api/` and
implements the auth, RBAC, refresh-token rotation and draft-autosave semantics the
UI depends on.

> **AI usage.** I wrote the application code myself; Claude helped me plan, document
> and review it. The tooling, the bugs that review caught, and my own verification
> steps are listed under [AI usage & verification](#ai-usage--verification).


---

## Contents

- [Stack](#stack)
- [Getting started](#getting-started)
- [Architecture overview](#architecture-overview)
- [Authentication & the refresh flow](#authentication--the-refresh-flow)
- [Permissions](#permissions)
- [The wizard](#the-wizard)
- [Sensitive data handling](#sensitive-data-handling)
- [Content Security Policy (CSP)](#content-security-policy-csp)
- [Mock API](#mock-api)
- [Testing](#testing)
- [AI usage & verification](#ai-usage--verification)
- [Trade-offs & known limitations](#trade-offs--known-limitations)
- [Notes & deliberate choices](#notes--deliberate-choices)

---

## Stack

| Concern           | Choice                                                          |
| ----------------- | --------------------------------------------------------------- |
| Framework         | Angular 22, standalone components, **signals**                  |
| Change detection  | `ChangeDetectionStrategy.OnPush` everywhere                     |
| Templates         | Built-in control flow (`@if` / `@for` / `@switch`)              |
| Component files   | one folder per component: `.ts` + `.html` + `.scss` (`templateUrl` / `styleUrl`) |
| Dependency access | `inject()` (no constructor parameter injection)                 |
| UI library        | **Angular Material 3** (`mat.theme`) + hand-written SCSS        |
| Icons / type      | Material Symbols + Roboto (see `src/index.html`)                |
| Forms             | Reactive Forms + typed `NonNullableFormBuilder`                 |
| Async state       | RxJS for HTTP, signals for view state                           |
| Router            | Lazy `applications` subtree + functional guards + `canDeactivate` |
| Tests             | Vitest + TestBed via `@angular/build:unit-test` (`runner: "vitest"`) |
| Mock API          | Express, in `mock-api/`, started alongside the app              |

There is exactly **one** UI library: Angular Material. No Bootstrap, PrimeNG or
other kit is present, and no component library JS bundle is pulled in.

---

## Getting started

```bash
npm install          # dependencies
npm start            # runs `ng serve` + the Express mock API together
npm run start:debug  # same, plus the mock API's /debug/* helpers (demonstrations)
```

`npm start` runs both halves with `concurrently`:

- Angular dev server on `http://localhost:4200`
- Express mock API on `http://localhost:3000`

The dev server proxies `/api` → `http://localhost:3000` (see `proxy.conf.json`),
so the browser only ever talks to its own origin and there are no CORS surprises.

Run the halves separately if you prefer:

```bash
npm run mock-api        # node mock-api/server.js
ng serve                # UI only (expects the API on :3000)

npm run mock-api:debug  # same API, with the /debug/* helpers mounted
npm run start:debug     # ng serve + the debug API together (for demos)
```

### Seeded accounts

All seeded users share the dummy password **`password`**. The login screen lists
quick-fill buttons for each role.

| Email                   | Alias                | Role     | Scope                                   |
| ----------------------- | -------------------- | -------- | --------------------------------------- |
| `sales@example.com`     | `sales@test.com`     | SALES    | Only applications they created          |
| `reviewer@example.com`  | `reviewer@test.com`  | REVIEWER | Only applications assigned to them      |
| `reviewer2@example.com` | —                    | REVIEWER | Same, but unassigned in the seed        |
| `admin@example.com`     | `admin@test.com`     | ADMIN    | Every application; manages assignments  |

### Debug routes & render mode

- **`npm start` is the normal mode, with debug routes off.** It runs the mock API
  through `npm run mock-api`, which starts the server with **no `--debug` flag**, so
  the `/debug/*` helpers do not exist and return `404` — the default is safe to
  expose.
- **`npm run start:debug` turns them on for demonstrations.** It runs `ng serve`
  together with `npm run mock-api:debug`, which passes **`--debug`** and mounts the
  `/debug/*` helpers (expire tokens, inject latency, force a 401, reset state, read
  the audit log). `--debug` (rather than an inline `VAR=value` prefix) is used so the
  command also works on Windows; `ENABLE_DEBUG=1` is accepted as well.
- The app renders **client-side**: `app.routes.server.ts` uses `RenderMode.Client`.
  The session lives in browser storage that the server-side renderer cannot see, so
  server-rendering would redirect every protected URL to `/login` before the browser
  could restore the session. The render mode is independent of which start script
  you use.

### How to see the refresh flow and the error states

Start with the debug helpers enabled:

```bash
npm run start:debug
```

- **Refresh flow** – sign in as any role, call
  `POST /api/debug/expire-tokens`, then reload `/applications`. The browser makes
  **a single** `POST /api/auth/refresh` and replays the failed request; open the
  Network tab to confirm only one refresh call.
- **Slow saves** – `POST /api/debug/slow` injects latency, which is useful for
  watching autosave queue and coalesce.
- **Forced failure** – `POST /api/debug/force-401` (or stopping the API) drives the
  error states: the header shows `Couldn't save` with a **Retry** button, and the
  wizard keeps whatever you typed.
- `GET /api/debug/state` dumps the in-memory store; `POST /api/debug/reset` restores
  the seed.

---

## Architecture overview

The app is a single Angular application with a **lazy `applications` subtree**.
Authentication state lives in signals; HTTP concerns live in functional
interceptors; authorisation is centralised in one role→permission map. Material
components are themed once in `src/styles.scss` via the M3 `mat.theme` mixin, so
every component consumes the generated `--mat-sys-*` tokens.

### Folder map

```
merchant-payments-portal/
├── mock-api/                       # Express mock backend (own package.json)
│   ├── server.js                   # routes, security headers, debug flags
│   ├── data/
│   │   ├── applications.js         # seeded applications (obviously fake values)
│   │   ├── users.js                # 4 seeded users (2 reviewers)
│   │   └── store.js                # in-memory state, masking, audit, serialisation
│   └── middleware/                 # auth, cors, request-logger, security-headers
└── src/
    ├── index.html                  # Roboto + Material Symbols, viewport
    ├── styles.scss                 # M3 `mat.theme` + global layout/a11y helpers
    ├── styles/
    │   └── _breakpoints.scss       # shared responsive breakpoint variables
    └── app/
        ├── app.ts / app.html       # shell: Material toolbar, skip-link, router outlet
        ├── app.config.ts           # interceptors, animations, session restore
        ├── app.routes.ts           # login / forbidden / lazy applications subtree
        ├── core/
        │   ├── auth/               # AuthService, interceptor, guards, token storage
        │   ├── http/               # API base token, error interceptor (ApiError)
        │   ├── permissions/        # role→permission map (+ *hasPermission directive)
        │   └── models/             # User/Role, MerchantApplication, Page<T>
        ├── shared/
        │   ├── ui/                 # status-badge, masked-field (reveal),
        │   │                       # confirm-dialog (MatDialog), loading-skeleton,
        │   │                       # error-state, field-error (rendered in <mat-error>)
        │   └── validators/         # ein, routing-number, url, age, ownership-total,
        │                           # processing-range, async-unique-name
        └── features/
            ├── auth/               # login page
            ├── forbidden/          # 403 page
            └── applications/
                ├── applications.api.ts / applications.routes.ts
                ├── dashboard/      # list page + store + URL-synced filters
                ├── wizard/         # 4-step wizard, step components, autosave, guard
                └── detail/         # detail page, risk timeline, review panel,
                                    # sensitive-data service
```

Every component is three files in one folder — `name.ts`, `name.html` and
`name.scss` — wired with `templateUrl` / `styleUrl`; there are no inline
`template:` / `styles:` strings.

### Data model

The model mirrors the brief:

```ts
MerchantApplication {
  id; status; version; businessName; createdBy;
  assignedReviewerId?; createdAt; updatedAt;
  business: { legalName; dba; entityType; ein; website;
              address: { line1, line2?, city, state, postalCode, country } };
  owners:   { id; name; dob; ownershipPct; ssnLast4 }[];
  banking:  { bankName; accountNumber; routingNumber; monthlyVolume; averageTicket };
  documents: ApplicationDocument[];
  riskHistory?: RiskDecision[];
}
```

`RiskDecision` records the decision, optional reason, reviewer and timestamp;
list endpoints return `Page<T>` (`{ items, total, page, pageSize }`).

### Routing & guards

- `authMatchGuard` (`CanMatchFn`) gates the whole lazy `applications` subtree and
  redirects to `/login?returnUrl=…` **before** the chunk is downloaded.
- `roleGuard` (`CanMatchFn`) reads `route.data.roles`; `new` and `:id/edit` are
  SALES-only. A failed role check redirects to `/forbidden`.
- Routes: `applications` → list, `applications/new` → wizard,
  `applications/:id/edit` → wizard (resume a draft), `applications/:id` → detail.
  Review happens on the detail page, so there is no separate `:id/review` route.
- `unsavedChangesGuard` (`CanDeactivateFn`) blocks leaving the wizard while a save
  is in flight or has failed; a `beforeunload` handler covers the browser close.

---

## Authentication & the refresh flow

- **Access token** – short-lived (30 s in the mock), kept **in memory only**.
- **Refresh token** – kept in `sessionStorage` for this mock so a page reload can
  transparently re-authenticate (see the trade-off below).
- `authInterceptor` attaches the bearer token, never touches `/auth/*`, and on a
  `401` performs a **single-flight refresh** then retries the failed request
  **exactly once**. Only a *second* `401` (the fresh token is rejected too) logs the
  user out; any other failure of the retry — `403`, `404`, `5xx` — is passed through
  untouched, so a permissions error surfaces as a `403` / forbidden screen rather
  than a spurious sign-out.
- Interceptor order is `withInterceptors([errorInterceptor, authInterceptor])`, so
  the auth interceptor still sees the raw `HttpErrorResponse` before errors are
  normalised into `ApiError`.
- `provideAppInitializer` calls `AuthService.restoreSession()` on boot.

---

## Permissions

Permissions are **centralised** as keys in
`core/permissions/permission.service.ts`:

| Key                   | SALES | REVIEWER | ADMIN |
| --------------------- | :---: | :------: | :---: |
| `application:create`  |  ✅   |    ❌    |  ❌   |
| `application:edit`    |  ✅   |    ❌    |  ❌   |
| `application:review`  |  ❌   |    ✅    |  ❌   |
| `assignment:manage`   |  ❌   |    ❌    |  ✅   |
| `sensitive:reveal`    |  ❌   |    ✅    |  ✅   |

The UI reads them through a memoised `Signal<boolean>` (`can('…')`) or the
`*hasPermission` structural directive. The client only decides what to *show*.

Each rule is enforced in **three places** — the route guard, the UI, and the mock
API (`403`) — as required:

| Action                    | Who                          | Route guard        | UI                                      | Mock API                                            |
| ------------------------- | ---------------------------- | ------------------ | --------------------------------------- | --------------------------------------------------- |
| Create application        | SALES                        | `new` roleGuard    | "New application" (`application:create`) | `POST /applications` `requireRole('SALES')`         |
| Edit / autosave draft     | owning SALES                 | `:id/edit` (SALES) | "Continue draft" for own `DRAFT`         | `PUT …/draft` checks `createdBy` + `DRAFT`          |
| Submit application        | owning SALES                 | (wizard)           | Submit button on the review step         | `POST …/submit` checks ownership + completeness     |
| Review / decide           | **assigned REVIEWER only**   | detail (auth)      | panel shown only when `IN_REVIEW` **and** assigned to the current user **and** `application:review` | `POST …/decision` re-checks assignee + state (ADMIN is rejected with `403`) |
| Reveal sensitive data     | assigned REVIEWER, ADMIN     | detail (auth)      | reveal button only with `sensitive:reveal` | `POST …/reveal` checks `canReveal()` and **audits** |
| Assign a reviewer         | ADMIN                        | detail (auth)      | assignment card only for `assignment:manage` | `PUT …/assignment` `requireRole('ADMIN')`      |

Permissions are enforced in **three places** everywhere it matters: the route
guard (can you reach the screen?), the UI (is the control rendered?), and the mock
API (is the request accepted?). The client is never the source of truth.

### Roles at a glance

- **SALES** – creates and edits its own drafts (autosaved), submits them, and sees
  only its own applications. No review controls, no reveal endpoint. Its *own
  draft* is returned **unmasked** while the application is a `DRAFT` (so autosave
  can round-trip the values it typed); once submitted it is masked like everyone
  else.
- **REVIEWER** – sees only applications assigned to it, can approve/reject (with a
  reason for rejections), and may reveal sensitive fields for those applications.
- **ADMIN** – sees every application, manages assignments, may reveal, but
  **cannot** decide an application.

---

## The wizard

The four-step wizard (`business` → `owners` → `banking & processing` → `review`)
is a horizontal, **linear** `MatStepper` bound to one root `FormGroup`. Each step
is an OnPush child component that receives its group via an `input`.

- Forward navigation is blocked until the current step is valid; going back is
  always free. The active step heading receives `aria-current="step"` and is
  focused on change for screen-reader users.
- A failed **Next** (or submit) marks the relevant controls touched, focuses the
  first invalid field and shows an **error summary** whose items move focus to the
  offending input by id.
- Validation has three layers:
  1. **Field level** – `required`, `min`/`max`, patterns (`ein.validator.ts`,
     `routing-number.validator.ts`, `url.validator.ts`, `age.validator.ts`,
     `ownership-total.validator.ts`, `processing-range.validator.ts`).
  2. **Cross-field** – owners must total 100 %
     (`ownershipTotal` on the owners `FormArray`); average ticket may not exceed
     monthly volume (`processingRangeValidator` on the banking group).
  3. **Async** – business-name uniqueness
     (`async-unique-name.validator.ts`) built with `timer` + `switchMap`, so the
     field shows a "Checking…" state and stale checks are cancelled.
- Errors render through a reusable `<app-field-error>` placed **inside**
  `<mat-error>`; Angular Material's form-field wires `aria-describedby` and the
  message itself carries `role="alert"`.

### Draft autosave

`DraftAutosaveService` debounces `form.valueChanges` (**800 ms**), de-dupes
against the last value it handed to the pipeline (`lastRequestedValue`) and
`concatMap`s into `saveDraft`:

- The **form is the source of truth**; saving is a side effect and the form is
  **never reset** when a save fails.
- Saves are **serialised** with `concatMap` rather than `switchMap`: cancelling an
  in-flight save would lose the new `version` it returned, so the next save would
  send a stale version and be rejected with a `409`. Each save reads its version
  **lazily via `defer`**, at the moment it actually starts, so a save that was
  queued behind a slow one picks up the latest version.
- `catchError` lives **inside** the mapped inner observable, so a failure never
  tears down the `valueChanges` stream — the next edit still saves.
- **Retry** – only **transient** failures are retried (network `status 0` or `5xx`),
  twice with exponential backoff. Deterministic failures (`400` / `403` / `409`)
  fail immediately; a version conflict is never retried into more conflicts.
- **Conflict handling** – drafts carry a `version`; a stale write returns
  `409 { error: "version_conflict", currentVersion }` and the UI shows a
  "reload" banner. The version advances only on a successful save.
- **De-dup baseline** – the service tracks two values: the last one the server
  **confirmed** (`lastSavedValue`) and the last one **handed to the pipeline**
  (`lastRequestedValue`). A debounced value is skipped only when it matches the
  *requested* one; it is a genuine no-op only when the *saved* one also matches
  (type a character, delete it again). Reverting to the last saved value **while a
  different save is still in flight** is therefore not skipped — the server is
  about to hold the in-flight value, so the revert is queued behind it. A failed
  save re-arms the requested baseline so the value can be retried.
- `hasPendingChanges` is set on **every edit** and cleared only when a save
  completes with the form matching the confirmed value (or on the true no-op
  above). While it is set the **Submit** button is disabled and reads
  `Saving draft…`, so a submit can never race the last edit. If a save fails the
  header shows `Couldn't save` with a **Retry** button that re-sends the current
  values through the same save queue; Submit reads `Fix save error first` until the
  retry succeeds or the form returns to the last saved value. The button therefore
  never sits on `Saving draft…` while nothing is actually saving.
- Drafts save even while invalid (`getRawValue()`); only submit requires validity.
- Status (`Saving…` / `Saved …` / `Couldn't save`) is announced via
  `aria-live="polite"`. Sensitive fields are only ever sent to the server —
  nothing is written to browser storage.

---

## Sensitive data handling

Sensitive values are `business.ein`, `banking.routingNumber`,
`banking.accountNumber` and each owner's `ssnLast4`. `<app-masked-field>` takes a
`fieldKey` of `ein` | `routingNumber` | `accountNumber` | `ssnLast4:<ownerId>`.

- **Masked by default for everyone.** Once an application leaves `DRAFT`, nobody
  sees real values — not even the owning SALES user. The one exception is the owner
  editing *their own draft*: real values are returned so autosave can round-trip
  what they typed. Because SALES holds no `sensitive:reveal`, a submitted
  application is masked for its owner with no reveal button.
- **Masked at the source.** The server masks these on serialisation as `••••6789`
  (last four only). The client never receives the full value until it asks.
- **Server-authorised reveal.** Only users holding `sensitive:reveal` (assigned
  REVIEWER, ADMIN) see the **Reveal** button. Clicking it calls
  `POST /applications/:id/reveal`, where `canReveal()` and the **audit log** live.
  The client only decides whether to offer the button.
- **Auto re-mask.** `SensitiveDataService` (provided at the detail component)
  keeps revealed values for **30 s**, then drops them from memory. Navigating away
  or logging out destroys the service and clears everything. Values are never
  written to storage, the console or a URL.
- **Accessibility.** The button carries `aria-pressed` and an `aria-label` such as
  `Reveal bank account number`; a visually-hidden `aria-live="polite"` region
  announces when a value is revealed or hidden.
- **Audit.** The mock records *who* revealed *which fields* of *which* application
  (`GET /api/debug/audit`) and deliberately never stores the values.

---

## Content Security Policy (CSP)

CSP is defence-in-depth that limits the damage of an **XSS** bug: a strict policy
stops injected inline scripts from running and stops `fetch`/`img`/form
submissions from exfiltrating data to attacker-controlled origins. It complements
output encoding and template sanitisation rather than replacing them.

`mock-api/middleware/security-headers.js` sets a strict `Content-Security-Policy`
by default (set `CSP_MODE=dev` for the relaxed, HMR-friendly policy) plus
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin` and a
`Permissions-Policy` denying geolocation/microphone/camera.

A production policy uses a per-response nonce (or Angular's build-time
`security.autoCsp` hashing) so no `'unsafe-inline'` is needed, restricts
`connect-src` to known API origins, and sets `frame-ancestors 'none'`,
`object-src 'none'`. The refresh token should be an `HttpOnly`, `Secure`,
`SameSite=Strict` cookie in production.

---

## Mock API

Base path `/api`. Protected routes require `Authorization: Bearer <token>`.

| Method | Path                             | Who                      | Notes                                            |
| ------ | -------------------------------- | ------------------------ | ------------------------------------------------ |
| POST   | `/auth/login`                    | anyone                   | `{ email, password }` → tokens + user            |
| POST   | `/auth/refresh`                  | anyone                   | Rotates the refresh token (reuse is detected)    |
| POST   | `/auth/logout`                   | anyone                   | Revokes refresh + access token                   |
| GET    | `/auth/me`                       | authenticated            | Current user                                     |
| GET    | `/applications`                  | authenticated            | `?page&pageSize&status&q&sort` → `Page<T>`        |
| POST   | `/applications`                  | SALES                    | Creates a blank `DRAFT` (`201`)                  |
| GET    | `/applications/:id`              | if permitted             | `403` when the viewer can't see it               |
| PUT    | `/applications/:id/draft`        | owning SALES             | Autosave; `409` on version conflict              |
| POST   | `/applications/:id/submit`       | owning SALES             | `DRAFT` → `SUBMITTED`, validates completeness    |
| POST   | `/applications/:id/decision`     | **assigned REVIEWER**    | Reject requires ≥ 5-char reason; → `APPROVED`/`REJECTED` |
| PUT    | `/applications/:id/assignment`   | ADMIN                    | `{ reviewerId }`; `SUBMITTED` → `IN_REVIEW`      |
| POST   | `/applications/:id/reveal`       | assigned REVIEWER / ADMIN| Unmasked sensitive fields; **audited**           |
| GET    | `/applications/:id/risk-history` | if permitted             | Decision timeline for the detail page            |
| GET    | `/applications/:id/documents`    | if permitted             | Uploaded document metadata                       |
| GET    | `/users?role=REVIEWER`           | ADMIN                    | Populates the assignment dropdown                |
| GET    | `/health`                        | anyone                   | Liveness                                         |

The `/debug/*` helpers (`state`, `audit`, `reset`, `expire-tokens`, `force-401`,
`slow`) are only mounted when the server is started with `--debug` (or
`ENABLE_DEBUG=1`). `npm start` / `npm run mock-api` leave them **off** (they return
`404`); `npm run start:debug` / `npm run mock-api:debug` turn them on for demos.

### Seed data is obviously fake

Every seeded value is intentionally non-real so nothing can be mistaken for
personal or payment data: EINs `00-0000000`–`00-0000004`, routing number
`000000000`, account numbers like `000123456789`, SSN last-4 values `0000`–`0005`,
and business names such as `Test Merchant LLC`. No real personal or payment data
appears anywhere in the repo.

---

## Testing

```bash
npm test             # Vitest + TestBed via @angular/build:unit-test (watch)
npm test -- --no-watch   # single run, for CI
npm run build        # production build
```

The unit-test target is configured as `"builder": "@angular/build:unit-test"` with
`"runner": "vitest"` (see `angular.json`).

9 spec files / 57 tests cover the parts where bugs hurt most:

| Spec                                      | Covers                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `core/auth/auth.interceptor.spec.ts`      | concurrent 401s → exactly one refresh + retry; refresh failure logs out; a retried **non-401 is passed through** (no logout); `/auth/*` never decorated |
| `core/auth/auth.guard.spec.ts`            | unauthenticated → `/login?returnUrl=…`; wrong role → `/forbidden`; allowed role passes       |
| `shared/validators/validators.spec.ts`    | EIN, routing checksum, URL, min age, ownership total, processing range, async name uniqueness |
| `wizard/draft-autosave.service.spec.ts`   | fake timers: rapid edits collapse to one save; an invalid value still saves; failure preserves the form and keeps the stream alive; **overlapping saves serialise as versions 0 → 1**; a `409` is **not retried**; **an edit back to the last saved value clears "pending" with no extra save**; **a revert during a slow save is queued and the server ends on the reverted value**; **a failed save is recovered by a Retry that re-sends the current value and clears "pending"** |
| `wizard/wizard.page.spec.ts`              | creates the draft on init, renders the four steps, blocks an invalid step behind an **error summary**, and marks the active step with `aria-current` |
| `ui/masked-field/masked-field.component.spec.ts` | masked by default; reveal button hidden without `sensitive:reveal`; reveal hits the server; **re-masks after 30 s** |
| `dashboard/applications.store.spec.ts`   | query change triggers a request; error state; `retry()` recovers; paging; **`open()` refetches an equal query**; **sign-out clears data → idle** |
| `detail/application-detail.page.spec.ts` | review panel **absent for SALES / unassigned reviewers**, present for the assigned reviewer; assignment UI only for ADMIN |
| `app.spec.ts`                            | shell boots and renders the router outlet                                                |

Material components in tests are provided through `provideNoopAnimations()` and
`provideHttpClientTesting()`, exercised with `HttpTestingController` and
`vi.useFakeTimers()` for the debounce/retry/TTL paths.

---

## AI usage & verification

### Tools and what they were used for

- **Claude (Anthropic), in the chat interface** — breaking the assignment brief into
  a checklist, planning the build order and architecture, brainstorming, helping
  write and tighten the documentation (this README and `CHANGES.txt`), reviewing the
  finished project, and giving written guidance and reference snippets for the fixes.

### Decisions I made while planning

Angular Material as the only UI library; an Express mock API (json-server can't
express the refresh and role rules well); an in-memory access token with the refresh
token in `sessionStorage` for the mock; `concatMap` to serialise draft saves; and
server-side enforcement of every permission so the UI is never the source of truth.

### Review rounds and the bugs they found

The finished project was reviewed several times. The reviews ran the test suite and a
build, called the mock API directly, and used throw-away tests to reproduce each
suspected bug before reporting it. I fixed each one myself, and each fix has a
regression test that fails on the old code.

1. **Sign-out on non-401 errors.** The interceptor treated any failure of a retried
   request as an expired session. Now only a second `401` ends the session.
2. **Stale dashboard data after sign-out.** The store kept the previous user's rows.
   It now clears on sign-out and refetches every time the page opens.
3. **False auto-save version conflicts.** Cancelling an in-flight save lost its new
   `version`. Saves are now serialised with `concatMap`, and a `409` is never retried.
4. **Reload of a deep link logged the user out.** Server-side rendering resolved
   protected routes before the browser could restore the session. Routes now render
   client-side.
5. **Submit stuck on "Saving draft…".** Typing then deleting a character, and
   reverting while a slow save was in flight, both left it stuck. Fixed with separate
   "requested" and "confirmed" baselines, plus a Retry action after a failed save.
6. **Smaller security items.** Debug routes are opt-in, the decision endpoint checks
   permission before validating the body, and a submitted application is masked even
   for its owner.

### What I verified myself

- `npm install`, `npm run build` and `npm test` run locally; the build is clean and
  all **9 spec files / 57 tests** pass.
- I walked through each role against the running app: SALES (create a draft and
  reload, submit and confirm masking, forbidden page for another user's
  application), REVIEWER (only assigned applications, approve and reject, reveal then
  re-mask, `403` for a non-assignee) and ADMIN (all applications, assign a reviewer,
  no approve/reject controls).
- I used `npm run start:debug` to see the refresh flow and the failure states: expire
  tokens, reload, the single `/auth/refresh`, and a stopped API while editing.

No credentials are committed beyond the intentionally dummy `password`, and all
seed data is obviously fake.

---

## Trade-offs & known limitations

- **In-memory mock DB.** State resets on restart or `/debug/reset` (when the
  server runs with `--debug`). No database.
- **Refresh-token storage.** `sessionStorage` is convenient for the mock but not
  production-safe; production should use an `HttpOnly` cookie. The access token is
  already memory-only.
- **No real file upload.** Documents are metadata only.
- **Optimistic concurrency, not offline.** Autosave blocks navigation on a failed
  save instead of queueing offline edits.
- **Client-side permission checks are cosmetic.** The server re-checks every
  action; the UI only hides what a role can't do.
- **No E2E/browser tests.** Coverage is TestBed unit/integration; Playwright would
  be the next step.

---

## Notes & deliberate choices

- **Angular version.** The installed toolchain is Angular **22.x**, although the
  brief said "Angular 20+"; the code uses only APIs available since 20.
- **External templates & styles.** Every component is split into `.ts` / `.html` /
  `.scss` (the Angular CLI layout) and referenced with `templateUrl` / `styleUrl` —
  no inline `template:` or `styles:` strings. The responsive breakpoints live in
  `src/styles/_breakpoints.scss` and are shared by the global and component styles.
- **Client-side rendering.** `app.routes.server.ts` uses `RenderMode.Client`, so a
  page reload restores the session before any route decision (see
  [Debug routes & render mode](#debug-routes--render-mode)).
- **Material-only UI.** The confirm dialog is a small `MatDialog` component, and
  the risk-history timeline is plain SCSS over Material tokens — no second kit.
- **Section E.** The brief jumped from **D** to **F** without describing **E**, so
  E is deliberately left unaddressed rather than invented.
- **Routes.** There is no `:id/review` route; review lives on the application
  detail page so the reviewer sees the full application before deciding.

---

