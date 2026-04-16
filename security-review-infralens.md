# Security Review: infralens

**Date:** 2026-04-16
**Reviewer:** Claude (automated security review)
**Language/Framework:** Python / Flask
**Dependency Manager:** pip (requirements.txt)

## Summary
- Total findings: 4
- Critical: 0 | High: 0 | Medium: 4 | Low: 0
- PRs opened: 0
- Issues opened: 4
  - https://github.com/FlorianCasse/InfraLens/issues/36
  - https://github.com/FlorianCasse/InfraLens/issues/37
  - https://github.com/FlorianCasse/InfraLens/issues/38
  - https://github.com/FlorianCasse/InfraLens/issues/39

## Findings

### [MEDIUM] Missing security headers in Flask application
- **File:** `app.py`
- **Description:** The Flask application does not set security response headers (X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, HSTS). Flask does not add these by default.
- **Remediation:** Add an `@app.after_request` handler to set security headers on all responses.
- **PR-ready:** no (requires modifying the large monolithic app.py file — exact code change provided in issue)
- **Action taken:** Issue #36 https://github.com/FlorianCasse/InfraLens/issues/36

### [MEDIUM] No authentication on file upload endpoints
- **File:** `app.py` (routes: `/generate`, `/license-csv`, `/license-txt`, `/vcf9-csv`, `/vcf9-txt`)
- **Description:** All file upload and processing endpoints are unauthenticated. Anyone who can reach the server can upload .xlsx files for processing.
- **Remediation:** Add network-level access control (reverse proxy auth) or application-level authentication.
- **PR-ready:** no (architectural decision needed)
- **Action taken:** Issue #37 https://github.com/FlorianCasse/InfraLens/issues/37

### [MEDIUM] No rate limiting on file upload endpoints
- **File:** `app.py`
- **Description:** No rate limiting is configured. Upload endpoints can be flooded to cause resource exhaustion.
- **Remediation:** Add `flask-limiter` with appropriate rate limits.
- **PR-ready:** no (requires new dependency)
- **Action taken:** Issue #38 https://github.com/FlorianCasse/InfraLens/issues/38

### [MEDIUM] No CSRF protection on POST endpoints
- **File:** `app.py`
- **Description:** POST endpoints lack CSRF tokens. If authentication is later added, this becomes exploitable.
- **Remediation:** Integrate `flask-wtf` for CSRF protection.
- **PR-ready:** no (requires new dependency and form changes)
- **Action taken:** Issue #39 https://github.com/FlorianCasse/InfraLens/issues/39

## Areas Checked (No Issues Found)
- **Hardcoded secrets:** No API keys, tokens, or credentials found in source
- **Debug mode:** `app.run(debug=False)` is correctly set in the `__main__` guard
- **File upload security:** Only `.xlsx` files accepted; 50 MB upload limit enforced; file content parsed with pandas (not executed)
- **Dependency versions:** `flask~=3.0`, `pandas~=2.0`, `openpyxl~=3.1` — approximate version pinning is reasonable; no known critical CVEs
- **Injection risks:** No SQL, command injection, or path traversal vectors found; file parsing uses pandas which handles xlsx safely
- **Template injection:** No Jinja2 templates used; HTML is hardcoded in a Python string (no user input interpolation)
- **Insecure deserialization:** No pickle, eval, or exec usage found
