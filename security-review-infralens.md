# Security Review: infralens

**Date:** 2026-04-17
**Reviewer:** Claude (automated security review)
**Language / Framework:** Python 3 / Flask (back-end `app.py`) + vanilla JS browser client (`index.html`)
**Dependency Manager:** pip (`requirements.txt`)

## Summary
- Total findings: 11
- Critical: 0 | High: 1 | Medium: 6 | Low: 4
- PRs opened: 1
  - #48 https://github.com/FlorianCasse/InfraLens/pull/48 — pin `requirements.txt` to exact versions
- Issues opened: 10
  - #41 https://github.com/FlorianCasse/InfraLens/issues/41 — Missing security response headers (CSP, XFO, etc.)
  - #42 https://github.com/FlorianCasse/InfraLens/issues/42 — No CSRF protection on POST endpoints
  - #43 https://github.com/FlorianCasse/InfraLens/issues/43 — No rate limiting on upload endpoints
  - #44 https://github.com/FlorianCasse/InfraLens/issues/44 — Upload MIME validation by extension only
  - #45 https://github.com/FlorianCasse/InfraLens/issues/45 — Error responses leak raw exception text
  - #46 https://github.com/FlorianCasse/InfraLens/issues/46 — Thread-unsafe `app.config['_last_license_report']`
  - #47 https://github.com/FlorianCasse/InfraLens/issues/47 — GitHub Actions pinned to floating tags
  - #49 https://github.com/FlorianCasse/InfraLens/issues/49 — **Stored XSS** in rendered reports (HIGH)
  - #50 https://github.com/FlorianCasse/InfraLens/issues/50 — CDN scripts loaded without SRI
  - #51 https://github.com/FlorianCasse/InfraLens/issues/51 — Flask binds `0.0.0.0` by default

At the start of this run there were **0 open Issues and 1 open PR (#40)** — previous reviews' issues have all been closed. All prior `security/*` branches are present but stale; the current `dev` branch (PR #40) already proposes fixes for several of the historical findings.

## Scope Reviewed
- Root directory listing via `mcp__github__get_file_contents`
- Source files: `app.py` (1417 lines), `index.html` (1586 lines)
- Config / manifests: `requirements.txt`, `.gitignore`, `.github/workflows/pages.yml`, `README.md`
- Static data: `vcf9_cpu.json`, `vcf9_hcl.json` (no secrets, data-only JSON)
- Static assets: `static/logo.png` (binary, skipped)
- Existing Issues and open PRs via `mcp__github__list_issues` / `mcp__github__list_pull_requests`
- Token / secret sweep on the whole tree — no hard-coded credentials found
- XSS / injection sweep on front-end and back-end

## Findings

### [HIGH] Stored XSS in rendered License / VCF 9 reports
- **File:** `index.html` lines ~1002, 1019-1028, 1080-1085, 1128-1146
- **Description:** Data parsed from the uploaded XLSX (hostname, cluster, model, ESXi version, cpu_type, label, etc.) is interpolated straight into `innerHTML` template literals without escaping. An attacker can ship an XLSX whose `Host` / `Model` column contains e.g. `</td><img src=x onerror=alert(1)>` and anyone opening that file in InfraLens executes the payload in their browser. Same pattern repeats for the VCF 9 Readiness table filter inputs (line 1135).
- **Remediation:** Add an `escapeHtml(val)` helper and wrap every interpolated field in the three affected rendering functions (`renderLicenseReport`, `renderVcf9Report`, inner `renderTable`). Patch provided in the issue.
- **PR-ready:** no — `index.html` (~61 KB) exceeds the per-tool content size available to this review; the fix and an exact diff are recorded in the issue so a human can apply in a single commit.
- **Action taken:** Issue #49 https://github.com/FlorianCasse/InfraLens/issues/49

### [MEDIUM] Missing security response headers (CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy)
- **File:** `app.py` (no `@app.after_request` hook)
- **Description:** No security-related HTTP headers are emitted by Flask. Combined with the XSS sink above a Content-Security-Policy would reduce blast radius.
- **Remediation:** Add an `@app.after_request` decorator that sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a narrow `Content-Security-Policy`.
- **PR-ready:** no — requires allow-listing the CDN origins that the front-end currently needs; maintainer input required.
- **Action taken:** Issue #41 https://github.com/FlorianCasse/InfraLens/issues/41

### [MEDIUM] No CSRF protection on POST endpoints
- **File:** `app.py` (`/generate`, `/license-csv`, `/license-txt`, `/vcf9-csv`, `/vcf9-txt`)
- **Description:** No CSRF token, no Origin/Referer allow-list. If the app is ever deployed behind SSO it inherits this weakness.
- **Remediation:** Add `flask-wtf` `CSRFProtect`, or check `Origin` header.
- **PR-ready:** no — new dependency + front-end change.
- **Action taken:** Issue #42 https://github.com/FlorianCasse/InfraLens/issues/42

### [MEDIUM] No rate limiting — resource exhaustion risk
- **File:** `app.py` (all upload endpoints)
- **Description:** 50 MB upload cap, no throttling. An attacker can drive the CPU-heavy pandas parse in a loop.
- **Remediation:** `flask-limiter`, shrink `MAX_CONTENT_LENGTH` to ~16 MB.
- **PR-ready:** no — requires new dependency.
- **Action taken:** Issue #43 https://github.com/FlorianCasse/InfraLens/issues/43

### [MEDIUM] Upload validation by filename extension only
- **File:** `app.py:1209-1211`, `app.py:1279-1281`, `app.py:1321-1323`, `app.py:1354-1356`
- **Description:** Only the trailing `.xlsx` is checked; the file is handed directly to `pandas.ExcelFile(io.BytesIO(...))`. A future parser bug in the XLSX path becomes reachable for any attacker.
- **Remediation:** Check that the first 4 bytes are `PK\x03\x04` before parsing; consider per-file size cap.
- **PR-ready:** no — overlaps with issue #43 (rate-limit / size cap) so maintainer can bundle.
- **Action taken:** Issue #44 https://github.com/FlorianCasse/InfraLens/issues/44

### [MEDIUM] CDN resources loaded without SRI / version pin
- **File:** `index.html:499` (xlsx), `index.html:1491-1494` (react@19 via esm.sh), `index.html:1509, 1523, 1528` (excalidraw via esm.sh)
- **Description:** No `integrity=` / `crossorigin=`; `xlsx.full.min.js` is not even version-pinned. A CDN compromise lands code in every user's browser.
- **Remediation:** Pin exact versions, add SRI hashes, or bundle + self-host.
- **PR-ready:** no — `index.html` size exceeds the per-tool content limit.
- **Action taken:** Issue #50 https://github.com/FlorianCasse/InfraLens/issues/50

### [MEDIUM] Flask binds to `0.0.0.0` by default
- **File:** `app.py:1417` — `app.run(debug=False, host="0.0.0.0", port=port)`
- **Description:** The README promotes `python app.py` for local use. Binding to all interfaces exposes an unauth'd, no-CSRF, no-rate-limit service to whatever network the laptop happens to be on.
- **Remediation:** Default to `127.0.0.1`; optional `INFRALENS_HOST` env var for opt-in.
- **PR-ready:** no — `app.py` size exceeds the per-tool content limit.
- **Action taken:** Issue #51 https://github.com/FlorianCasse/InfraLens/issues/51

### [LOW] Dependency pinning uses `~=` (accepts minor/patch bumps)
- **File:** `requirements.txt`
- **Description:** `flask~=3.0`, `pandas~=2.0`, `openpyxl~=3.1` — a compromised patch release will be pulled in on the next `pip install`.
- **Remediation:** Switch to exact `==` pins.
- **PR-ready:** **yes.**
- **Action taken:** PR #48 https://github.com/FlorianCasse/InfraLens/pull/48

### [LOW] Error responses expose raw exception messages
- **File:** `app.py:1217, 1243, 1287, 1327, 1362`
- **Description:** `return f"Error parsing {f.filename}: {str(e)}", 400`
- **Remediation:** `app.logger.exception(...)` server-side; return a generic message.
- **PR-ready:** no — multi-site edit across `app.py`.
- **Action taken:** Issue #45 https://github.com/FlorianCasse/InfraLens/issues/45

### [LOW] Thread-unsafe global state `app.config['_last_license_report']`
- **File:** `app.py:1256`
- **Description:** Writing per-request state into process-global `app.config` under a multi-worker WSGI server leaks data across users; also the value is never read back (dead code).
- **Remediation:** Delete the assignment (and the unused `csv_content` computation).
- **PR-ready:** no — bundled with other `app.py` cleanup.
- **Action taken:** Issue #46 https://github.com/FlorianCasse/InfraLens/issues/46

### [LOW] GitHub Actions pinned to floating tags (`@v4` / `@v3`)
- **File:** `.github/workflows/pages.yml`
- **Description:** Supply-chain exposure if an upstream tag is force-moved.
- **Remediation:** Replace tags with immutable commit SHAs.
- **PR-ready:** no — maintainer must choose which exact SHAs they want to track.
- **Action taken:** Issue #47 https://github.com/FlorianCasse/InfraLens/issues/47

## Clean checks (no findings)
- **Hard-coded secrets / tokens / API keys / private keys:** none found in source, configs, or JSON data files.
- **Injection risks (SQL / command / template):** no DB code, no `subprocess` / `os.system`, no `eval` / `exec`, no `pickle` usage — `app.py` is a pure request-handling + pandas parse path.
- **Path traversal:** no user-controlled filesystem access — `open()` only reads bundled JSON (`vcf9_hcl.json`, `vcf9_cpu.json`) by fixed path.
- **Insecure deserialization:** `pickle` / `marshal` / `yaml.load` not present; uploaded bytes flow only through `pd.ExcelFile`.
- **Debug mode:** `app.run(debug=False, ...)` — good.
- **Permissive CORS:** no explicit CORS; same-origin-only is fine for current UI, but see issue #42 if CSRF is added.
- **`.gitignore`:** scoped to Python and OS files; no secrets history visible from the default branch.

## Notes on label creation
`Claude` already exists on the repo (verified via `get_label`). All opened Issues and the opened PR carry the three required labels (`Claude`, `<severity>`, `security`).

## Constraints hit during the run
- `app.py` (~52 KB) and `index.html` (~61 KB) are larger than the per-call content size this reviewer can reliably submit through `create_or_update_file` — for findings touching those files, the review opens Issues that include the exact patches so a human can apply them in one commit.
- No other errors encountered.
