# Security Review: InfraLens

**Date:** 2026-04-01
**Reviewed by:** Claude (Automated Security Review)
**Language/Framework:** Python / Flask
**Dependency Manager:** pip (requirements.txt)

## Summary
- Total findings: 8
- Critical: 0 | High: 0 | Medium: 3 | Low: 5
- PRs opened: 1 ([PR #6](https://github.com/FlorianCasse/InfraLens/pull/6))
- Issues opened: 4
  - [#7](https://github.com/FlorianCasse/InfraLens/issues/7) - Weak dependency version constraints
  - [#8](https://github.com/FlorianCasse/InfraLens/issues/8) - Missing CSRF protection
  - [#9](https://github.com/FlorianCasse/InfraLens/issues/9) - No rate limiting
  - [#10](https://github.com/FlorianCasse/InfraLens/issues/10) - Thread-unsafe global state

## Positive Controls Observed
- No hardcoded secrets, API keys, or credentials
- No SQL injection risks (uses pandas, not SQL)
- No unsafe deserialization (no pickle, eval, exec)
- File extension validation in place (.xlsx only)
- 50MB upload limit configured
- Debug mode is OFF in production
- No template injection risks
- No path traversal risks (filenames not used for filesystem access)

## Findings

### [MEDIUM] Missing Security Headers
- **File:** `app.py` (all routes)
- **Description:** No security headers set on responses (CSP, X-Frame-Options, X-Content-Type-Options, HSTS, X-XSS-Protection, Referrer-Policy). Exposes the application to clickjacking, MIME sniffing, and XSS.
- **Remediation:** Add `@app.after_request` decorator to set security headers on all responses.
- **PR-ready:** yes
- **Action taken:** PR #6 https://github.com/FlorianCasse/InfraLens/pull/6

### [MEDIUM] Overly Permissive Host Binding
- **File:** `app.py` (line 1417)
- **Description:** Application binds to `0.0.0.0`, accessible from any network interface. Increases attack surface in shared environments.
- **Remediation:** Bind to `127.0.0.1` by default with `FLASK_HOST` env var override.
- **PR-ready:** yes
- **Action taken:** PR #6 https://github.com/FlorianCasse/InfraLens/pull/6

### [MEDIUM] Bare Exception Handler Silently Fails
- **File:** `app.py` (lines 1237-1238)
- **Description:** `except Exception: pass` swallows all errors during VCF9 compatibility check. Masks bugs, security issues, and file handling errors.
- **Remediation:** Catch specific exceptions (`FileNotFoundError`, `json.JSONDecodeError`, `KeyError`) and log failures.
- **PR-ready:** yes
- **Action taken:** PR #6 https://github.com/FlorianCasse/InfraLens/pull/6

### [LOW] Unvalidated Filenames in Error Messages
- **File:** `app.py` (lines 1211, 1217, 1281, 1287, 1322, 1328, 1356, 1362)
- **Description:** User-supplied `f.filename` embedded directly in error messages without HTML escaping.
- **Remediation:** Sanitize with `html.escape(f.filename or 'unknown')`.
- **PR-ready:** yes
- **Action taken:** PR #6 https://github.com/FlorianCasse/InfraLens/pull/6

### [LOW] Information Disclosure via Error Messages
- **File:** `app.py` (lines 1217, 1243, 1287, 1328, 1362)
- **Description:** Detailed exception messages from pandas/openpyxl returned directly to users, potentially revealing library versions and internal data formats.
- **Remediation:** Return generic error messages; log details server-side.
- **PR-ready:** yes
- **Action taken:** PR #6 https://github.com/FlorianCasse/InfraLens/pull/6

### [LOW] Weak Dependency Version Constraints
- **File:** `requirements.txt` (lines 1-3)
- **Description:** Tilde (`~=`) constraints allow broad version ranges. Non-reproducible builds and potential auto-install of CVE-affected versions.
- **Remediation:** Pin exact versions or use a lock file.
- **PR-ready:** no (requires testing with specific versions)
- **Action taken:** Issue #7 https://github.com/FlorianCasse/InfraLens/issues/7

### [LOW] Missing CSRF Protection on POST Routes
- **File:** `app.py` (lines 1198, 1268, 1309, 1377, 1395)
- **Description:** All POST routes lack CSRF token validation. Attacker could trigger file uploads via crafted webpage.
- **Remediation:** Implement CSRF protection using Flask-WTF.
- **PR-ready:** no (requires new dependency and frontend changes)
- **Action taken:** Issue #8 https://github.com/FlorianCasse/InfraLens/issues/8

### [LOW] No Rate Limiting on Upload Endpoints
- **File:** `app.py` (all POST routes)
- **Description:** No rate limiting on any routes. Attacker could upload many 50MB files for resource exhaustion.
- **Remediation:** Implement rate limiting using Flask-Limiter.
- **PR-ready:** no (requires new dependency and configuration)
- **Action taken:** Issue #9 https://github.com/FlorianCasse/InfraLens/issues/9

### [LOW] Thread-Unsafe Global State
- **File:** `app.py` (line 1256)
- **Description:** `app.config['_last_license_report']` stores reports in global state. Concurrent requests can overwrite each other's data.
- **Remediation:** Use request-scoped storage or eliminate the cache.
- **PR-ready:** no (requires architectural decision)
- **Action taken:** Issue #10 https://github.com/FlorianCasse/InfraLens/issues/10
