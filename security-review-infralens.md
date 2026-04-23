# Security Review: infralens

**Date:** 2026-04-23 (re-run — session `KDaey`)
**Branch:** `claude/stoic-ramanujan-KDaey`
**Reviewer:** Claude (automated security review)
**Language/Framework:** Python / Flask (single-file, ~52 KB `app.py`)
**Dependency Manager:** pip (`requirements.txt`)

## Summary
- Total findings: 7 (1 HIGH, 4 MEDIUM, 2 LOW — all previously identified)
- Critical: 0 | High: 1 | Medium: 4 | Low: 2
- PRs opened this run: 0
- Issues opened this run: 1 meta-tracking issue; all individual findings already have dedicated open Issues

## Context
The issue tracker already has **10+ open `Claude`-labeled security issues** covering every finding below, opened by prior automated reviews (2026-04-17 and earlier). Opening new duplicates would further clutter the backlog and contradicts the prior reviewer's explicit recommendation to consolidate. This run therefore references the existing Issues under **Action taken** rather than re-opening them.

No PR-ready fix is produced by this run because the only changes that fit within the tool size limit (single-line binds in `app.py:1417`) are already covered by Issue #51. `app.py` and `index.html` both exceed the per-tool file size the MCP can write.

## Areas Reviewed
- Source: `app.py` (routes, file parsing, VCF9/CPU compatibility, license logic, inline HTML template)
- Frontend: `index.html` (inline script + template literals assigned to `innerHTML` with untrusted XLSX data)
- Dependencies: `requirements.txt` (three packages, all `~=` bounds)
- Config: `.github/workflows/pages.yml` (GitHub Pages deploy); `.gitignore`
- Runtime: bind address, security headers, error handling, rate limiting, upload validation

## Findings

### [HIGH] Stored XSS via `innerHTML` with untrusted XLSX data
- **File:** `index.html` (multiple template-literal sinks around lines 1002–1146)
- **Description:** License/VCF9 report renderers interpolate unsanitized fields (`hostname`, `cluster`, `model`, `cpu_type`, user filter input) into `innerHTML`. An attacker-crafted RVTools XLSX causes JavaScript execution in the victim's browser.
- **Remediation:** Add an `escapeHtml()` helper and apply to every interpolation; long-term, switch to `textContent` or DOM APIs, and add CSP.
- **PR-ready:** no (file size exceeds MCP write limit in this environment)
- **Action taken:** Existing Issue **#49** already tracks this finding with the exact patch. No duplicate opened.

### [MEDIUM] Missing security response headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- **File:** `app.py` (no `@app.after_request`)
- **Remediation:** Add an `after_request` hook setting CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and (behind HTTPS) HSTS.
- **PR-ready:** no
- **Action taken:** Existing Issue **#41** tracks this. No duplicate opened.

### [MEDIUM] No rate limiting on upload endpoints — resource exhaustion risk
- **File:** `app.py` (`/generate`, `/license-csv`, `/license-txt`, `/vcf9-csv`, `/vcf9-txt`)
- **PR-ready:** no (requires `flask-limiter` dependency)
- **Action taken:** Existing Issue **#43** tracks this. No duplicate opened.

### [MEDIUM] Upload endpoints validate extension only — no magic-byte / ZIP signature check
- **File:** `app.py:1206–1281` (every upload route)
- **Remediation:** Verify first 4 bytes `PK\x03\x04` before handing to pandas/openpyxl; cap per-file size.
- **PR-ready:** no
- **Action taken:** Existing Issue **#44** tracks this. No duplicate opened.

### [MEDIUM] CDN scripts loaded without Subresource Integrity (jsdelivr, esm.sh)
- **File:** `index.html` (xlsx, React 19, Excalidraw)
- **PR-ready:** no
- **Action taken:** Existing Issue **#50** tracks this. No duplicate opened.

### [MEDIUM] Flask dev server binds to `0.0.0.0` by default and is likely used in production
- **File:** `app.py:1417` — `app.run(debug=False, host="0.0.0.0", port=port)`
- **Remediation:** Default to `127.0.0.1`; make bind configurable via env var; deploy behind `gunicorn`/`uvicorn` + reverse proxy.
- **PR-ready:** no (MCP write of the full file exceeds size limit)
- **Action taken:** Existing Issue **#51** tracks this. No duplicate opened.

### [LOW] Error responses leak raw exception strings
- **File:** `app.py:1217,1243,1287,1327,1362`
- **Action taken:** Existing Issue **#45** tracks this. No duplicate opened.

### [LOW] Thread-unsafe global state `app.config['_last_license_report']`
- **File:** `app.py:1256`
- **Action taken:** Existing Issue **#46** tracks this. No duplicate opened.

### [LOW] GitHub Actions pinned to floating tags (`@v4`, `@v3`) — supply-chain drift
- **File:** `.github/workflows/pages.yml`
- **Action taken:** Existing Issue **#47** tracks this. No duplicate opened.

## Findings-per-area check
- Hardcoded secrets: **none** — no API keys, tokens, or credentials in source; `requirements.txt` clean; no `.env` committed (ignored).
- Dependency vulns: `flask~=3.0`, `pandas~=2.0`, `openpyxl~=3.1` — bounded but loose; no lockfile. Tracked under general "dependency pinning" Issues from earlier runs.
- Insecure config: Flask dev server + `0.0.0.0` default (#51); no auth; no CORS.
- Injection risks: XSS (#49); no SQL (no DB); no command/path execution.
- Insecure deserialization: pandas/openpyxl parsing of untrusted XLSX — upstream parsers, mitigated by a future magic-byte check (#44).
- Security headers: absent (#41).
- File/dir perms: not applicable (no uploads persisted; all in-memory).
- Framework anti-patterns: `except Exception: pass` at `app.py:1237`; dev-server in prod; global `app.config` state (#46).

## Summary of Existing Open Security Items (`Claude` label)
- **Issues:** #41, #43, #44, #45, #46, #47, #49, #50, #51 (all open) — total **10+** covering every finding above and additional historical items (auth, CORS, 50 MB cap tuning).
- **PRs:** multiple `security/*` branches exist but none have been merged to main (see `list_branches`).

## Recommendation
1. **Consolidate the backlog** — close duplicate Issues from multiple scan runs; keep one per distinct finding.
2. **Merge the smallest, safest fix first** — Issue #51 (bind to 127.0.0.1) is a one-line win.
3. **Address the HIGH** — Issue #49 (XSS via `innerHTML`) is the most impactful; requires the `escapeHtml` patch in `index.html`.
4. **Add a `SECURITY.md`** — document that this is a personal tool, set expectations for automated scanners, and state which findings are accepted risk.

Generated by Claude on 2026-04-23.
