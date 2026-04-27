# Security Review: InfraLens

_Reviewed: 2026-04-27 — Branch `claude/modest-einstein-JdCmo`_

Stack: Flask single-file app (`app.py`) + single-page client (`index.html`,
client-side XLSX parsing via jsdelivr CDN).
Dependency manager: pip (`requirements.txt`).

## Summary
- Total findings: 7
- HIGH: 2 | MEDIUM: 3 | LOW: 2
- PRs opened: 1 (bundled fix on the development branch — see "Action taken" rows)
- Issues opened: 2 (see "Action taken" rows)

## Findings

### [HIGH] Flask dev server bound to `0.0.0.0`
- **File:** `app.py` (line 1417, pre-fix)
- **Description:** `app.run(debug=False, host="0.0.0.0", port=port)` exposes
  Flask's built-in dev server on every interface, including the public NIC if
  the host is internet-facing. Werkzeug's dev server is explicitly *not* a
  production server.
- **Remediation:** Default to `127.0.0.1`; allow opt-in override via
  `INFRALENS_HOST=0.0.0.0`; document `gunicorn -w 4 app:app` for production.
- **PR-ready:** yes
- **Action taken:** Fix included in the bundled PR on
  `claude/modest-einstein-JdCmo`.

### [HIGH] XLSX CDN script loaded with no version pin and no SRI
- **File:** `index.html` (line 499, pre-fix)
- **Description:** `script.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js'`
  resolves to whatever jsdelivr serves as "latest" for the npm `xlsx`
  package. SheetJS unpublished `xlsx` from npm in 2023; depending on registry
  mirror state, the served bytes can change. No `integrity=` attribute means
  a CDN compromise or TLS-stripping MITM injects arbitrary JS into a page
  that parses the user's infrastructure inventory.
- **Remediation (this PR):** pin to `xlsx@0.18.5` (last unaffected published
  version on npm). Follow-up Issue tracks adding the SRI hash from jsdelivr
  metadata, or self-hosting the file under `/static/`.
- **PR-ready:** yes
- **Action taken:** Pin in PR; SRI/self-host in follow-up Issue.

### [MEDIUM] No security headers on responses
- **File:** `app.py` (no `@app.after_request` or talisman)
- **Description:** No `Content-Security-Policy`, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. Combined with
  the XSS sinks below this turns a low-impact bug into a high-impact one.
- **Remediation:** Add an `@app.after_request` hook setting a tight CSP,
  `frame-ancestors 'none'`, etc.
- **PR-ready:** yes
- **Action taken:** Fix included in the bundled PR.

### [MEDIUM] Reflected XSS via uploaded filename in error responses
- **File:** `app.py` (lines 1240, 1246, 1309, 1315, 1350, 1356, 1384, 1390 — pre-fix)
- **Description:** `return f"Invalid file type: {f.filename}…", 400` reflects
  the user-controlled filename. Flask defaults to `Content-Type: text/html`
  for `str` responses, so HTML in the filename is rendered. `str(e)` is also
  reflected.
- **Remediation:** `_safe_filename()` helper (strip everything outside
  `[A-Za-z0-9._\- ]`, cap length); explicit `mimetype='text/plain'`.
- **PR-ready:** yes
- **Action taken:** Fix included in the bundled PR.

### [MEDIUM] Stored XSS via XLSX cell content rendered into `innerHTML`
- **File:** `index.html` (lines 1002, 1035, 1080, 1149)
- **Description:** Hostnames, cluster names, model strings, etc. from the
  parsed XLSX are interpolated into template literals assigned via
  `innerHTML`. Crafted RVTools export → JS exec in colleague's browser.
- **Remediation:** `escHtml(s)` helper, escape every interpolation, or
  rebuild tables with `createElement` + `textContent`. Then drop
  `'unsafe-inline'` from the CSP `script-src`.
- **PR-ready:** yes (held out of this PR — touches several rendering
  helpers and needs UI verification)
- **Action taken:** Issue opened.

### [LOW] Process-global `app.config['_last_license_report']` stash
- **File:** `app.py` (line 1256, pre-fix)
- **Description:** `/generate` stashed the license report on `app.config`.
  The stash was never read by any route — per-process state shared across
  requests, a footgun waiting to be read by some future endpoint.
- **Remediation:** Delete the stash; `/license-csv` already recomputes from
  the uploaded files.
- **PR-ready:** yes
- **Action taken:** Fix included in the bundled PR.

### [LOW] Floating dependency versions, no lockfile
- **File:** `requirements.txt`
- **Description:** `flask~=3.0`, `pandas~=2.0`, `openpyxl~=3.1` allow minor
  upgrades without a lockfile, so two installs minutes apart can pull
  different transitive trees. No hash pinning either.
- **Remediation:** Adopt `pip-tools` (`pip-compile --generate-hashes`),
  `uv pip compile`, or `poetry lock`; commit the lock file; install with
  `pip install --require-hashes -r requirements.txt`.
- **PR-ready:** no — needs maintainer steer on tooling.
- **Action taken:** Issue opened.

## What was checked

- `app.py` — Flask routes, file upload handling, session/global state,
  error reflection, headers, bind address
- `index.html` — DOM injection, third-party scripts, CSP-relevant patterns
- `requirements.txt` — direct dependency surface and version pinning
- `static/` — assets only, no code paths
- `.gitignore` — secrets exposure (clean)

## Action links

PR and Issue URLs are written into the PR description and the corresponding
GitHub Issues created from this review.
