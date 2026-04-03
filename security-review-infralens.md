# Security Review: InfraLens

## Summary
- Total findings: 9
- Critical: 0 | High: 0 | Medium: 3 | Low: 6
- PRs opened: 0 (pending GitHub API access)
- Issues opened: 0 (pending GitHub API access)

## Findings

### [MEDIUM] Missing Security Headers
- **File:** `app.py` (all route handlers)
- **Description:** No security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) are set on HTTP responses, leaving the application vulnerable to XSS, clickjacking, and MIME sniffing attacks.
- **Remediation:** Add an `@app.after_request` handler that sets Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy headers.
- **PR-ready:** yes
- **Action taken:** Branch `security/add-security-headers-and-fixes` pushed. PR pending.

### [MEDIUM] Overly Permissive Host Binding
- **File:** `app.py` (line 1417)
- **Description:** Flask server binds to `0.0.0.0`, making the service accessible from any network interface. This increases attack surface in shared or cloud environments.
- **Remediation:** Bind to `127.0.0.1` by default; allow override via `FLASK_HOST` environment variable.
- **PR-ready:** yes
- **Action taken:** Branch `security/add-security-headers-and-fixes` pushed. PR pending.

### [MEDIUM] Bare Exception Handler Silently Swallows Errors
- **File:** `app.py` (lines 1237-1238)
- **Description:** A bare `except Exception: pass` catches ALL exceptions, masking bugs, security issues, and malformed JSON errors during VCF9 compatibility checks.
- **Remediation:** Catch specific exceptions `(FileNotFoundError, json.JSONDecodeError, KeyError)` and log the error.
- **PR-ready:** yes
- **Action taken:** Branch `security/add-security-headers-and-fixes` pushed. PR pending.

### [LOW] No CSRF Protection on POST Routes
- **File:** `app.py` (lines 1198, 1268, 1309, 1377, 1395)
- **Description:** POST routes lack CSRF token validation. Attackers could craft pages that trigger file uploads in users' browsers.
- **Remediation:** Implement Flask-WTF CSRF protection with frontend token injection and backend validation.
- **PR-ready:** no
- **Action taken:** Issue pending.

### [LOW] No Rate Limiting
- **File:** `app.py` (all POST routes)
- **Description:** No rate limiting on any endpoints. Combined with the 50MB upload limit, this allows resource exhaustion via repeated large file uploads.
- **Remediation:** Implement Flask-Limiter with per-IP rate limits.
- **PR-ready:** no
- **Action taken:** Issue pending.

### [LOW] Thread-Unsafe Global State
- **File:** `app.py` (line 1256)
- **Description:** License report stored in `app.config['_last_license_report']`, a global variable. Concurrent requests can overwrite each other's data in multi-threaded deployments.
- **Remediation:** Use request-scoped storage or eliminate the global cache.
- **PR-ready:** no
- **Action taken:** Issue pending.

### [LOW] Information Disclosure via Detailed Error Messages
- **File:** `app.py` (lines 1211, 1217, 1243, 1287, 1328, 1362)
- **Description:** Raw exception messages from pandas, openpyxl, and Flask are returned directly to users. This can reveal library versions, internal data formats, and stack traces.
- **Remediation:** Return generic error messages to users; log details server-side.
- **PR-ready:** no
- **Action taken:** Issue pending.

### [LOW] Unvalidated Filenames in Error Messages (XSS Risk)
- **File:** `app.py` (lines 1211, 1217, 1281, 1287, 1322, 1328, 1356, 1362)
- **Description:** User-supplied `f.filename` embedded directly in HTTP responses without HTML escaping. If responses are ever rendered as HTML, this creates XSS risk.
- **Remediation:** Sanitize filenames with `html.escape()` in all error messages.
- **PR-ready:** yes
- **Action taken:** Branch `security/add-security-headers-and-fixes` pushed. PR pending.

### [LOW] Weak Dependency Pinning
- **File:** `requirements.txt`
- **Description:** Dependencies use tilde (`~=`) version constraints instead of exact pinning. This allows automatic installation of potentially vulnerable patch versions.
- **Remediation:** Use exact version pinning (e.g., `flask==3.0.5`) or maintain a `requirements-lock.txt`.
- **PR-ready:** no
- **Action taken:** Issue pending.
