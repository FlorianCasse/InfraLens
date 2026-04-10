# Security Review: InfraLens

**Date:** 2026-04-10
**Reviewer:** Automated (Claude)
**Repository:** floriancasse/infralens
**Stack:** Python/Flask, pandas, openpyxl, vanilla JS (client-side), GitHub Pages

## Summary
- Total findings: 18
- Critical: 0 | High: 2 | Medium: 7 | Low: 9
- PRs opened: 1 (this review) + 4 (previous reviews)
- Issues opened: 5 (this review) + 8 (previous reviews)

### PRs (this review)
- PR #22: Fix: XSS vulnerabilities and add security headers — https://github.com/FlorianCasse/InfraLens/pull/22

### PRs (previous reviews, still open)
- PR #4: Harden app.py with 7 security improvements — https://github.com/FlorianCasse/InfraLens/pull/4
- PR #5: Pin XLSX CDN version and add escapeHtml utility — https://github.com/FlorianCasse/InfraLens/pull/5
- PR #6: Add security headers and input validation — https://github.com/FlorianCasse/InfraLens/pull/6
- PR #11: Security headers, fix host binding, improve error handling — https://github.com/FlorianCasse/InfraLens/pull/11

### Issues (this review)
- Issue #17: [LOW] No CSRF protection on POST endpoints — https://github.com/FlorianCasse/InfraLens/issues/17
- Issue #18: [LOW] No rate limiting on file upload endpoints — https://github.com/FlorianCasse/InfraLens/issues/18
- Issue #19: [LOW] Imprecise dependency pinning with tilde constraints — https://github.com/FlorianCasse/InfraLens/issues/19
- Issue #20: [LOW] GitHub Pages workflow deploys dev branch to production — https://github.com/FlorianCasse/InfraLens/issues/20
- Issue #21: [LOW] Large inline HTML template in app.py complicates security maintenance — https://github.com/FlorianCasse/InfraLens/issues/21

## Findings

### [HIGH] DOM-based XSS via innerHTML with unsanitized XLSX data
- **File:** `index.html` (lines 1022-1027, 1141-1146)
- **Description:** The rendering functions inject parsed XLSX cell values directly into innerHTML without HTML escaping. Values like r.site, r.cluster, r.hostname, r.model, r.esxi originate from user-uploaded Excel files. A malicious .xlsx file with cell content like `<img src=x onerror=alert(1)>` would execute arbitrary JavaScript.
- **Remediation:** Add escapeHtml() utility and apply to all data values before innerHTML interpolation.
- **PR-ready:** yes
- **Action taken:** PR #22

### [HIGH] DOM-based XSS in summary boxes via innerHTML
- **File:** `index.html` (lines 1003-1009, 1081-1086)
- **Description:** Summary sections use innerHTML with template literals that include report data computed from XLSX values. The pattern of innerHTML without escaping is unsafe.
- **Remediation:** Use textContent for values or apply HTML escaping.
- **PR-ready:** yes
- **Action taken:** PR #22

### [MEDIUM] External CDN scripts loaded without Subresource Integrity (SRI)
- **File:** `index.html` (line 500, lines 1492-1529)
- **Description:** XLSX library loaded from jsdelivr CDN without integrity attribute. React/Excalidraw loaded from esm.sh without SRI. CDN compromise would inject malicious JS.
- **Remediation:** Pin versions and add integrity + crossorigin attributes.
- **PR-ready:** yes
- **Action taken:** Addressed in previous PR #5

### [MEDIUM] Missing security headers on all HTTP responses
- **File:** `app.py` (all route handlers)
- **Description:** No CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, or Permissions-Policy headers set on any response.
- **Remediation:** Add @app.after_request handler setting all security headers.
- **PR-ready:** yes
- **Action taken:** PR #22

### [MEDIUM] Server binds to 0.0.0.0 by default
- **File:** `app.py` (line 1418)
- **Description:** Flask dev server binds to all interfaces, exposing service to the entire network.
- **Remediation:** Default to 127.0.0.1, allow override via FLASK_HOST env var.
- **PR-ready:** yes
- **Action taken:** Addressed in previous PRs #4, #6, #11

### [MEDIUM] Bare except swallows all errors during VCF9 processing
- **File:** `app.py` (lines 1237-1239)
- **Description:** VCF9 compatibility check catches Exception with bare pass, silently swallowing all errors.
- **Remediation:** Catch specific exceptions and add logging.
- **PR-ready:** yes
- **Action taken:** Addressed in previous PRs #4, #11

### [MEDIUM] Unpinned XLSX CDN dependency (supply chain risk)
- **File:** `index.html` (line 500)
- **Description:** XLSX loaded as `npm/xlsx` without version pinning. Latest version auto-resolves, enabling supply chain attacks.
- **Remediation:** Pin to specific version: `xlsx@0.20.3`.
- **PR-ready:** yes
- **Action taken:** Addressed in previous PR #5

### [MEDIUM] Unescaped user-supplied filenames in HTTP error responses
- **File:** `app.py` (lines 1211-1362)
- **Description:** f.filename values embedded in error responses without HTML escaping. Combined with missing security headers, filenames with HTML could execute as XSS.
- **Remediation:** Wrap filenames with html.escape(). Set Content-Type: text/plain on error responses.
- **PR-ready:** yes
- **Action taken:** PR #22

### [MEDIUM] Information disclosure via raw exception messages
- **File:** `app.py` (lines 1217, 1243, 1287, 1328, 1362)
- **Description:** Raw exception messages from pandas/openpyxl returned directly to users, exposing internal details.
- **Remediation:** Return generic error messages; log exceptions server-side.
- **PR-ready:** yes
- **Action taken:** PR #22

### [LOW] No CSRF protection on POST endpoints
- **File:** `app.py` (all POST routes)
- **Description:** All five POST routes lack CSRF token validation. Attacker-crafted pages could trigger file uploads.
- **Remediation:** Implement Flask-WTF CSRF protection.
- **PR-ready:** no
- **Action taken:** Issue #17

### [LOW] No rate limiting on file upload endpoints
- **File:** `app.py` (all POST routes)
- **Description:** No rate limiting exists. 50MB upload limit + 5 endpoints allows DoS via repeated large uploads.
- **Remediation:** Add Flask-Limiter with per-IP rate limits.
- **PR-ready:** no
- **Action taken:** Issue #18

### [LOW] Thread-unsafe global state for license report
- **File:** `app.py` (line 1256)
- **Description:** app.config['_last_license_report'] stores report in global state. Concurrent requests can overwrite data.
- **Remediation:** Remove global cache (the value is never read back by other routes).
- **PR-ready:** yes
- **Action taken:** Addressed in previous PR #4

### [LOW] Imprecise dependency pinning with tilde constraints
- **File:** `requirements.txt`
- **Description:** Dependencies use ~= constraints, allowing auto-installation of potentially vulnerable patch versions.
- **Remediation:** Use exact pinning or pip-tools for reproducible builds.
- **PR-ready:** no
- **Action taken:** Issue #19

### [LOW] Potential DOM selector injection via data attribute
- **File:** `index.html` (line 1402)
- **Description:** CSS attribute selector constructed from panelId argument. Currently from hardcoded values, but pattern is fragile.
- **Remediation:** Use getElementById or validate against allowlist.
- **PR-ready:** yes
- **Action taken:** Noted in report (low risk, hardcoded values only)

### [LOW] GitHub Pages workflow deploys dev branch content to production
- **File:** `.github/workflows/pages.yml`
- **Description:** Workflow deploys dev branch alongside production. Unreviewed code becomes publicly accessible.
- **Remediation:** Deploy only main, or gate dev deployments.
- **PR-ready:** no
- **Action taken:** Issue #20

### [LOW] Excalidraw loaded from dev distribution in production
- **File:** `index.html` (line 1524)
- **Description:** Excalidraw imported from dist/dev/ path. Dev builds may have relaxed security checks.
- **Remediation:** Change to dist/prod/ paths.
- **PR-ready:** yes
- **Action taken:** Noted in report (deferred to CDN pinning PR)

### [LOW] No Flask SECRET_KEY configured
- **File:** `app.py` (line 15)
- **Description:** No SECRET_KEY set. If session-dependent features are added, they'll fail or use weak defaults.
- **Remediation:** Set app.secret_key from env var or os.urandom(32).
- **PR-ready:** yes
- **Action taken:** Addressed in previous PR #4

### [LOW] Large inline HTML template in app.py complicates security maintenance
- **File:** `app.py` (lines 888-1190)
- **Description:** ~300-line HTML template duplicated in Python source. Makes consistent security patching difficult.
- **Remediation:** Use render_template() or send_file().
- **PR-ready:** no
- **Action taken:** Issue #21

## No Hardcoded Secrets Found
No hardcoded secrets, API keys, tokens, or credentials were found in any file. The application does not use eval(), exec(), pickle, subprocess, or other dangerous patterns. File paths use os.path.join with __file__ as base (safe from path traversal). debug=False is correctly set.
