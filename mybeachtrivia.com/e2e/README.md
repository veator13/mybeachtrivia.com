# e2e — Playwright smoke tests

Fast "did a deploy break something obvious" checks. Not exhaustive — a handful of
load-and-look-for-key-elements tests plus console-error assertions.

## One-time setup

```bash
cd e2e
npm install
npx playwright install chromium
```

## Run

```bash
# public checks only (login page, bt-head.js, shared-include audit)
npm test

# + authenticated host checks: point at the burner host account
BT_HOST_EMAIL='13berner13@gmail.com' BT_HOST_PASSWORD='...' npm test
```

- Default target is the **staging** preview channel. Override with
  `BT_BASE_URL='https://…'`.
- With credentials set, an `auth` setup project logs in once and caches the
  session in `.auth/host.json` (gitignored); the host specs reuse it.
- Without credentials the host specs are skipped and only the public specs run.

`npm run report` opens the HTML report from the last run.

## What's covered

| spec | needs login | checks |
|---|---|---|
| `public.spec.js` | no | login form renders; `bt-head.js` is no-cache and injects the nav tags; all dashboard pages use the shared `bt-head.js` include (no drift) |
| `host.spec.js` | yes | host dashboard (nav + Today's Show + pay period), host calendar (shifts render), scoresheet (team table), time-off page (form) — each also asserts no console errors |

## Adding a test

Drop a `*.spec.js` in `tests/`. Use `trackErrors(page)` from `host.spec.js` if you
want the "no console errors" assertion. Keep them shallow — this suite should stay
runnable in well under a minute.
