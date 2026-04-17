# Security Review: infralens

**Date:** 2026-04-17 (re-run)
**Reviewer:** Claude (automated security review)
**Language/Framework:** Python / Flask
**Dependency Manager:** pip (requirements.txt)

## Status: Findings Persist — 29 Open Issues Cover All Identified Risks

This re-run confirms that the previously identified findings remain present in `app.py`. The repository already has **29 open issues** (labeled `Claude` and `security`) covering all common findings. No new issues were opened in this run to avoid duplication.

## Summary
- Total findings: 4 (unchanged from last run)
- Critical: 0 | High: 0 | Medium: 4 | Low: 0
- PRs opened this run: 0
- Issues opened this run: 0 (existing issues already cover all findings)

## Findings (all map to existing open issues)

### [MEDIUM] Missing security headers in Flask application
- **File:** `app.py`
- **Status:** No `@app.after_request` handler for security headers found.
- **Existing issues:** #36 (this reviewer's prior run) — no other duplicates
- **PR-ready:** no (large monolithic file; remediation code provided in the issue)

### [MEDIUM] No authentication on file upload endpoints
- **Status:** Endpoints `/generate`, `/license-csv`, `/license-txt`, `/vcf9-csv`, `/vcf9-txt` all unauthenticated.
- **Existing issues:** #27, #37 (duplicates)
- **PR-ready:** no (architectural decision)

### [MEDIUM] No rate limiting on file upload endpoints
- **Status:** No `flask-limiter` or equivalent.
- **Existing issues:** #9, #13, #18, #34, #38 (multiple duplicates)
- **PR-ready:** no (requires new dependency)

### [MEDIUM] No CSRF protection on POST endpoints
- **Status:** No `flask-wtf` or CSRF tokens.
- **Existing issues:** #8, #12, #17, #29, #39 (multiple duplicates)
- **PR-ready:** no (requires new dependency)

## Other Open Issues Already Tracking Additional Findings

The following findings from prior reviews are also tracked and remain valid:
- #19, #16, #7: Weak dependency pinning (`flask~=3.0`, etc.) — LOW
- #15: Information disclosure via detailed error messages — LOW
- #14, #10: Thread-unsafe global state in `app.config['_last_license_report']` — LOW
- #21: Large inline HTML template duplicates `index.html` — LOW
- #20: GitHub Pages deploys `dev` branch — LOW
- #24, #30: File validation by extension only, no magic byte check — MEDIUM/HIGH
- #25: Excalidraw loaded from dev build — MEDIUM
- #26, #31: 50 MB upload limit may allow resource exhaustion — LOW/HIGH
- #32: No CORS restrictions — MEDIUM
- #33: CDN libraries loaded without SRI — MEDIUM
- #35: No logging or audit trail — LOW

## Recommendation

The issue tracker has accumulated **29 open security issues**. Many are duplicates from repeated automated reviews. Suggest:
1. **Triage and consolidate** — close duplicate issues
2. **Pick 2-3 highest-impact items** to fix (security headers, file magic-byte validation, rate limiting)
3. **Configure a security policy** (`SECURITY.md`) so future scans don't re-create duplicates
