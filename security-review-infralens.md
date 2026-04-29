# Security Review: infralens

**Date:** 2026-04-29
**Reviewer:** Claude (automated security review)
**Branch reviewed:** `main` @ `41b9715`
**Language/Framework:** Python / Flask 3.x (single-file app)
**Dependency Manager:** pip (`requirements.txt`)
**Working dev branch:** `claude/gallant-einstein-uoeGi`

## Summary
- Total findings: 12
- Critical: 0 | High: 1 | Medium: 6 | Low: 5
- PRs opened: TBD (see Action taken per finding)
- Issues opened: TBD (see Action taken per finding)

## Scope
- `app.py` (1417 lines, ~52 KB) — Flask routes, parsing, Excalidraw generation, embedded HTML template
- `index.html` (1586 lines, ~62 KB) — main client-side bundle deployed via GitHub Pages
- `requirements.txt`
- `.gitignore`
- `.github/workflows/pages.yml`
- `static/` directory (only `logo.png`)
- Existing `security-review-infralens.md` (prior runs)

Out of scope: data files (`vcf9_cpu.json`, `vcf9_hcl.json`) treated as static assets; `logo.png`.

## Methodology
- Manual source review for: Flask config, secret leaks, deserialization, command/SQL injection, path traversal, XSS sinks, open redirects, file-upload handling, auth/session, security headers, CORS.
- Targeted grep for `subprocess|os.system|shell=True|pickle|yaml.load|exec\(|eval\(|innerHTML|document.write` — no dangerous server-side sinks found; XSS sinks confirmed in client-side innerHTML usage.
- Secret-scan attempt via `mcp__github__run_secret_scanning` — Advanced Security not enabled on the repo; manual grep for `secret|password|token|api_key|AKIA|ssh-rsa` returned nothing.
- Dependency review for `requirements.txt`.
- Review of GitHub Actions workflow.
- Note on issue tracker: 11 prior `Claude`/`security` issues are already open (most recent meta-issue #52). Several of this review's findings overlap with them — flagged below where so.

## Findings

### [HIGH] Stored XSS via `innerHTML` interpolation of untrusted XLSX-derived data
- **File:** `index.html` (lines 1002-1008, 1019-1028, 1080-1085, 1128-1136, 1139-1146); same pattern in embedded HTML in `app.py` (around line 1071, 1115)
- **Description:** The License Report and VCF 9 Readiness UI build HTML strings via template literals and assign them to `innerHTML` without escaping. The values interpolated (`hostname`, `cluster`, `model`, `esxi`, `cpu_type`, label fields, etc.) are read directly from the user-supplied XLSX. A crafted RVTools/LiveOptics export with a hostname like `</td><img src=x onerror=alert(1)>` will execute attacker-controlled JS in the victim's browser at the app origin. Because the public deployment lives at `floriancasse.github.io/InfraLens/`, this puts every user who opens a malicious export at risk for cookie-jar theft scoped to that origin.
- **Remediation:** Add an `escapeHtml()` helper and wrap every `${...}` interpolation that goes into an `innerHTML` template. Alternatively, build rows via DOM APIs (`document.createElement`, `textContent`) instead of HTML strings. A CSP (see headers finding below) reduces but does not eliminate the risk.
- **PR-ready:** yes
- **Action taken:** _to be filled in step 6_

### [MEDIUM] Flask app binds to all interfaces (`0.0.0.0`) by default
- **File:** `app.py` (line 1417)
- **Description:** `app.run(debug=False, host="0.0.0.0", port=port)` exposes the dev server on every network interface when a user runs `python app.py`. Combined with absent auth/CSRF/rate-limiting/security-headers, the service is reachable from any device on the same LAN. Default should be loopback; an env var can opt in to a wider bind.
- **Remediation:** Default `host` to `127.0.0.1`; honour an `INFRALENS_HOST` environment variable for opt-in.
- **PR-ready:** yes
- **Action taken:** _to be filled in step 6_

### [MEDIUM] Missing security response headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- **File:** `app.py` (no `@app.after_request` handler)
- **Description:** No security headers are emitted on any response. A CSP would meaningfully reduce the blast radius of the XSS finding above; `X-Frame-Options` blocks clickjacking; `X-Content-Type-Options: nosniff` blocks MIME sniffing.
- **Remediation:** Add an `@app.after_request` handler that sets `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. CSP must allow the CDNs the front-end currently loads (esm.sh, cdn.jsdelivr.net) until they are bundled locally.
- **PR-ready:** yes
- **Action taken:** _to be filled in step 6_

### [MEDIUM] Upload endpoints validate file type by extension only — no magic-byte check
- **File:** `app.py` (lines 1208-1211, 1278-1281, 1319-1322, 1354-1356)
- **Description:** All five upload endpoints rely solely on `os.path.splitext(...)[1].lower() == '.xlsx'`. An attacker can submit arbitrary content named `*.xlsx`. While `pandas`/`openpyxl` will normally raise on non-XLSX content, any future parser bug becomes reachable; a magic-byte check (`PK\x03\x04`) cheaply tightens this.
- **Remediation:** Read the first 4 bytes of the upload, verify they equal `b'PK\x03\x04'`, and only then hand to `parse_file`. Also enforce a per-file size cap distinct from `MAX_CONTENT_LENGTH`.
- **PR-ready:** yes
- **Action taken:** _to be filled in step 6_

### [MEDIUM] CDN scripts and stylesheets loaded without Subresource Integrity (SRI)
- **File:** `index.html` (lines 499, 1491-1494, 1509, 1523, 1528)
- **Description:** `xlsx.full.min.js` is loaded from `cdn.jsdelivr.net` without a version pin or `integrity=`. React 19, Excalidraw 0.18.0 ESM modules and CSS are loaded from `esm.sh` without SRI. A CDN compromise (or a moved jsdelivr "latest") would execute attacker JS in every user's browser. Tracked already as #50 — kept as Issue (not auto-fixed) because adding SRI to dynamic ESM imports requires bundling.
- **Remediation:** Pin exact versions; add `integrity=` for static `<script>`/`<link>`; long-term, bundle the dependencies into the repo so they are version-controlled.
- **PR-ready:** no — requires design choice (bundling vs. SRI on a subset)
- **Action taken:** _to be filled in step 6_ (likely: comment on existing issue #50)

### [MEDIUM] No rate limiting on upload endpoints — resource-exhaustion risk
- **File:** `app.py` (`/generate`, `/license-csv`, `/license-txt`, `/vcf9-csv`, `/vcf9-txt`)
- **Description:** Up to 50 MB XLSX uploads parsed by pandas with no per-IP rate limit. An unauthenticated attacker can saturate CPU/memory.
- **Remediation:** Add `flask-limiter`; reduce `MAX_CONTENT_LENGTH`; deploy behind a reverse proxy with rate limits.
- **PR-ready:** no — requires new dependency. Tracked as #43.
- **Action taken:** _to be filled in step 6_

### [MEDIUM] No CSRF protection on POST endpoints
- **File:** `app.py` (all POST routes)
- **Description:** No CSRF tokens or Origin/Referer checks. Currently bounded by lack of authentication, but any future auth or SSO gating will inherit this weakness.
- **Remediation:** `flask-wtf` `CSRFProtect`, or at minimum allow-list `Origin`/`Referer`, or require a custom `X-Requested-With` header.
- **PR-ready:** no — design decision and a new dependency. Tracked as #42.
- **Action taken:** _to be filled in step 6_

### [LOW] Loose version pinning in `requirements.txt` (`~=` only)
- **File:** `requirements.txt` (lines 1-3)
- **Description:** `flask~=3.0`, `pandas~=2.0`, `openpyxl~=3.1` allow any compatible 3.x / 2.x / 3.x release at install time. This makes builds non-reproducible and exposes the deployment to a future upstream regression or compromise. `~=2.0` for `pandas` in particular spans many minor versions over years.
- **Remediation:** Pin to exact tested versions (e.g. `flask==3.0.3`, `pandas==2.2.3`, `openpyxl==3.1.5`) and rely on Dependabot/Renovate to bump in PRs. Optionally provide a `requirements.lock` generated by `pip-compile`.
- **PR-ready:** yes
- **Action taken:** _to be filled in step 6_

### [LOW] Thread-unsafe global mutable state: `app.config['_last_license_report']`
- **File:** `app.py` (line 1256)
- **Description:** `app.config` is process-global; under any multi-threaded WSGI worker one user's request can overwrite another's report. The assignment is also dead code — `csv_content` is never used and no route reads back the stashed report.
- **Remediation:** Delete the dead block. If per-user state ever becomes necessary, use Flask `session` or an explicit per-request structure.
- **PR-ready:** yes
- **Action taken:** _to be filled in step 6_

### [LOW] Error responses leak raw exception messages to clients
- **File:** `app.py` (lines 1217, 1243, 1287, 1327, 1362)
- **Description:** Several handlers include `str(e)` in the response body. Exception details (file paths, library internals) help an attacker profile the deployment.
- **Remediation:** `app.logger.exception(...)` server-side; return a generic message to the client. Already tracked as #45.
- **PR-ready:** no — touches multiple paths and requires choosing a logging sink. Tracked as #45.
- **Action taken:** _to be filled in step 6_

### [LOW] GitHub Actions pinned to floating major-version tags
- **File:** `.github/workflows/pages.yml` (lines 22, 30, 49, 60)
- **Description:** `actions/checkout@v4`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4` are floating tags. A force-moved upstream tag would be picked up by the next Pages build. Tracked as #47.
- **Remediation:** Pin each `uses:` to a full commit SHA with a version comment.
- **PR-ready:** no — SHAs must be looked up at the time the maintainer chooses which version to lock to. Tracked as #47.
- **Action taken:** _to be filled in step 6_

### [LOW] GitHub Pages workflow publishes the `dev` branch under `/dev/`
- **File:** `.github/workflows/pages.yml` (lines 25-32, 38)
- **Description:** The Pages build copies both `main` and `dev` into the artifact, so any work-in-progress code on `dev` is publicly served at `floriancasse.github.io/InfraLens/dev/`. This widens the public attack surface (e.g. unmerged code, prototype features, half-fixed bugs are publicly executable). It is also unusual for a static-Pages deployment to mirror two branches.
- **Remediation:** Remove the `dev` checkout / copy from `pages.yml`, or restrict it to a private staging deployment. If publishing previews is desirable, gate them behind an unguessable path or require auth.
- **PR-ready:** no — depends on the maintainer's preview workflow needs.
- **Action taken:** _to be filled in step 6_

## Operational notes
- **Secret scanning:** GitHub Advanced Security is not enabled on this repo, so `mcp__github__run_secret_scanning` returned an error. Manual grep for `secret|password|token|api_key|AKIA|ssh-rsa` matched nothing in `app.py`, `index.html`, `requirements.txt`, or workflows.
- **Severity labels:** `Claude`, `security`, `CRITICAL` exist on the repo. `HIGH`, `MEDIUM`, `LOW` (uppercase) do **not** exist; lowercase `high`/`medium`/`low` are already in use by prior automation. This run reuses the lowercase labels for consistency with prior issues.
- **Issue duplication:** Most of these findings overlap with existing open issues (#41, #42, #43, #44, #45, #46, #47, #49, #50, #51, #52). To avoid further duplication, this run only opens new issues for findings not already tracked, and prefers PRs for fixable items.
