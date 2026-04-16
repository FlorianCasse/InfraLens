# Security Review: InfraLens

**Date:** 2026-04-16
**Reviewer:** Claude (automated security review)
**Language:** Python (Flask backend) + JavaScript (Vanilla + React/Excalidraw frontend)
**Framework:** Flask 3.0, Excalidraw 0.18.0, SheetJS
**Dependency Manager:** pip (requirements.txt)

## Summary
- Total findings: 11
- Critical: 1 | High: 3 | Medium: 3 | Low: 4
- PRs opened: 1 ([PR #28](https://github.com/FlorianCasse/InfraLens/pull/28))
- Issues opened: 7 ([#29](https://github.com/FlorianCasse/InfraLens/issues/29), [#30](https://github.com/FlorianCasse/InfraLens/issues/30), [#31](https://github.com/FlorianCasse/InfraLens/issues/31), [#32](https://github.com/FlorianCasse/InfraLens/issues/32), [#33](https://github.com/FlorianCasse/InfraLens/issues/33), [#34](https://github.com/FlorianCasse/InfraLens/issues/34), [#35](https://github.com/FlorianCasse/InfraLens/issues/35))

## Findings

### [CRITICAL] Cross-Site Scripting (XSS) via innerHTML with Unsanitized Data
- **File:** `index.html` (lines 1021-1027, 1140-1146)
- **Description:** User-supplied data (site name, cluster name, hostname, model, CPU type) from uploaded Excel files is directly embedded into HTML strings via template literals and assigned to `innerHTML`. A malicious Excel file with HTML/JS payloads in cells would execute JavaScript when the report is rendered.
- **Remediation:** Use an HTML escape function (`esc()`) to sanitize all user-supplied data before interpolation into innerHTML.
- **PR-ready:** yes
- **Action taken:** PR #28 https://github.com/FlorianCasse/InfraLens/pull/28

### [HIGH] Missing CSRF Protection on POST Endpoints
- **File:** `app.py` (lines 1198, 1268, 1309, 1377, 1395)
- **Description:** All Flask POST endpoints lack CSRF token validation. An attacker could forge cross-origin requests to upload files and process infrastructure data.
- **Remediation:** Install `flask-wtf` and add `CSRFProtect(app)`. Integrate CSRF tokens into the frontend.
- **PR-ready:** no
- **Action taken:** Issue #29 https://github.com/FlorianCasse/InfraLens/issues/29

### [HIGH] File Validation Relies Only on Extension, Not MIME Type
- **File:** `app.py` (lines 1209, 1279, 1320, 1354)
- **Description:** File extension validation uses only `os.path.splitext()` to check for `.xlsx`. No MIME type or magic byte validation is performed.
- **Remediation:** Add MIME type validation using `f.content_type` or `python-magic`.
- **PR-ready:** no
- **Action taken:** Issue #30 https://github.com/FlorianCasse/InfraLens/issues/30

### [HIGH] Upload Size Limit Allows 50MB Files Causing Resource Exhaustion
- **File:** `app.py` (line 16)
- **Description:** MAX_CONTENT_LENGTH is set to 50 MB. A malformed large Excel file could trigger excessive pandas/openpyxl processing, causing DoS.
- **Remediation:** Reduce to 10 MB per file. Add per-file size validation and file count limits.
- **PR-ready:** no
- **Action taken:** Issue #31 https://github.com/FlorianCasse/InfraLens/issues/31

### [HIGH] Exception Information Leakage in Error Messages
- **File:** `app.py` (lines 1216-1217, 1286-1287, 1327-1328, 1361-1362, 1242-1243)
- **Description:** Error handling exposes full exception details (`str(e)`) to users, revealing internal data structures and parsing logic.
- **Remediation:** Return generic error messages to users; log full errors server-side.
- **PR-ready:** yes
- **Action taken:** PR #28 https://github.com/FlorianCasse/InfraLens/pull/28

### [MEDIUM] Missing Security Headers
- **File:** `app.py` (global)
- **Description:** No security headers set by Flask. Missing: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection.
- **Remediation:** Add `@app.after_request` handler to inject security headers.
- **PR-ready:** yes
- **Action taken:** PR #28 https://github.com/FlorianCasse/InfraLens/pull/28

### [MEDIUM] No CORS Restrictions When Backend Runs on Network
- **File:** `app.py` (line 1417)
- **Description:** The Flask app had no CORS configuration and listened on `0.0.0.0`, making it accessible from any network interface. Any website could make cross-origin requests.
- **Remediation:** Install `flask-cors` with restricted origins.
- **PR-ready:** no
- **Action taken:** Issue #32 https://github.com/FlorianCasse/InfraLens/issues/32

### [MEDIUM] CDN Libraries Loaded Without Subresource Integrity
- **File:** `index.html` (lines 442, 499, 1523, 1528-1529)
- **Description:** External libraries loaded from jsdelivr and esm.sh CDNs without SRI hash verification. Compromised CDN could inject malicious code.
- **Remediation:** Add `integrity` attributes with SRI hashes to all external script loads.
- **PR-ready:** no
- **Action taken:** Issue #33 https://github.com/FlorianCasse/InfraLens/issues/33

### [LOW] Network Exposure via 0.0.0.0 Binding
- **File:** `app.py` (line 1417)
- **Description:** Application was accessible from any network interface by default. Combined with no authentication, anyone on the network could access the application.
- **Remediation:** Default to `127.0.0.1`, configurable via environment variable.
- **PR-ready:** yes
- **Action taken:** PR #28 https://github.com/FlorianCasse/InfraLens/pull/28

### [LOW] No Rate Limiting on File Upload Endpoints
- **File:** `app.py` (lines 1198-1265)
- **Description:** The `/generate` endpoint accepts files without rate limiting. An attacker could exhaust server resources with repeated requests.
- **Remediation:** Install `flask-limiter` and add per-endpoint limits.
- **PR-ready:** no
- **Action taken:** Issue #34 https://github.com/FlorianCasse/InfraLens/issues/34

### [LOW] No Logging or Audit Trail
- **File:** `app.py` (global)
- **Description:** No logging of user actions. If infrastructure data is leaked, there is no audit trail.
- **Remediation:** Add Python logging for all file processing operations.
- **PR-ready:** no
- **Action taken:** Issue #35 https://github.com/FlorianCasse/InfraLens/issues/35
