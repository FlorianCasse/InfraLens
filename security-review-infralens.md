# Security Review: infralens

**Date:** 2026-04-24
**Reviewer:** Claude (automated security review, session `LotRY`)
**Language/Framework:** Python 3 / Flask (back-end) + vanilla JS + React/Excalidraw ESM (front-end)
**Dependency Manager:** pip (requirements.txt)
**Base branch:** `claude/stoic-ramanujan-LotRY` (created from `main`)

## Status

The repository already has **11 open `Claude`-labeled security issues** (#41–#52) from prior automated reviews that cover every finding this review would raise. This run:

1. Confirmed every prior finding is still present on `main`.
2. Opened one new PR (#53) applying the smallest safe fix — SHA-pinning the GitHub Actions workflow (closes #47).
3. Declined to open duplicate Issues; added a comment to #47 instead.
4. Attempted to push single-file edits for `app.py` (#46, #51) but the 51 KB file body exceeded the per-tool payload budget of `create_or_update_file`, consistent with what prior reviews reported.

## Summary

- Total findings: **11** (all pre-existing open issues)
- Critical: 0 | High: 1 | Medium: 7 | Low: 3
- PRs opened this run: **1** (#53)
- Issues opened this run: **0** (every finding is already tracked; avoiding duplicates)
- Label check: `Claude`, `security`, `low`, `medium`, `high` all exist. Note the repo does **not** use `severity:*` prefixed labels — the plain `low`/`medium`/`high` labels are used instead, and the new PR follows that convention.

## Pull Requests Opened

- **PR #53** — `security: pin GitHub Actions to commit SHAs (refs #47)` — https://github.com/FlorianCasse/InfraLens/pull/53
  - Head: `claude/security-fix-actions-pin-LotRY`
  - Base: `claude/stoic-ramanujan-LotRY`
  - Labels: `Claude`, `security`, `low`

## Issues Opened

None — all findings map to existing open issues #41–#52.

## Findings (all map to existing open issues)

### [HIGH] Stored XSS via `innerHTML` with untrusted XLSX data
- **File:** `index.html` (lines 1002–1008, 1019–1028, 1080–1085, 1128–1136, 1139–1146)
- **Description:** Template literals interpolate `site`, `cluster`, `hostname`, `model`, `esxi`, `cpu_type`, `filters[c.key]` (reflected filter input) straight into `innerHTML`. A crafted XLSX with HTML in e.g. the `Host` column achieves script execution under the `github.io/InfraLens/` origin.
- **Remediation:** Add `escapeHtml()` helper and wrap every interpolated field; prefer `textContent` / `Number()` for numerics long-term.
- **PR-ready:** no — 61 KB `index.html` exceeds the per-tool content budget used by this reviewer.
- **Action taken:** Existing **Issue #49** covers it.

### [MEDIUM] Missing security response headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- **File:** `app.py` (no `@app.after_request` handler)
- **Description:** Without a CSP, the XSS sink in `index.html` (above) has a much larger blast radius. Also missing: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS.
- **Remediation:** Add an `@app.after_request` handler setting these headers; allow-list the `jsdelivr.net` / `esm.sh` CDN hosts in `script-src` until they're bundled locally.
- **PR-ready:** no — edit to the 51 KB `app.py`.
- **Action taken:** Existing **Issue #41**.

### [MEDIUM] No CSRF protection on POST endpoints
- **File:** `app.py` — `/generate`, `/license-csv`, `/license-txt`, `/vcf9-csv`, `/vcf9-txt`.
- **Description:** No token, no Origin/Referer check, no custom header gate. If deployed with auth later, every POST endpoint is CSRF-vulnerable.
- **Remediation:** `flask-wtf` with `CSRFProtect`, or at minimum an `Origin`/`Referer` allow-list, or require `X-Requested-With`.
- **PR-ready:** no — needs a new dependency and a front-end change.
- **Action taken:** Existing **Issue #42**.

### [MEDIUM] No rate limiting on upload endpoints
- **File:** `app.py`
- **Description:** Unauthenticated 50 MB uploads into CPU-heavy pandas parsing with no throttle.
- **Remediation:** `flask-limiter` (`30/minute`, `200/hour`); reduce `MAX_CONTENT_LENGTH` to ~16 MB; also enforce at reverse-proxy layer.
- **PR-ready:** no — new dependency.
- **Action taken:** Existing **Issue #43**.

### [MEDIUM] Extension-only upload validation (no magic-byte check)
- **File:** `app.py` — all upload routes.
- **Description:** Only `os.path.splitext(f.filename)[1] == '.xlsx'` is checked; the file body could be anything. XLSX is a ZIP — verifying the `PK\x03\x04` prefix cheaply raises the bar against pandas/openpyxl parser bugs reached via hostile input.
- **Remediation:** `if not body.startswith(b'PK\x03\x04'): return "Not a valid XLSX", 400`. Also consider per-file size caps and parse-time limits.
- **PR-ready:** no — coordinated change with size caps.
- **Action taken:** Existing **Issue #44**.

### [MEDIUM] CDN scripts/stylesheets loaded without Subresource Integrity (SRI)
- **File:** `index.html` lines 499, 1491–1494, 1509, 1523, 1528.
- **Description:** `cdn.jsdelivr.net/npm/xlsx/...` (no version pin!) and multiple `esm.sh/@excalidraw/@react@19` imports have no `integrity=` / `crossorigin=`. A compromised CDN moves malicious code into every user's browser.
- **Remediation:** Pin exact semver versions, add SRI hashes where possible, or bundle locally.
- **PR-ready:** no — touches large `index.html`.
- **Action taken:** Existing **Issue #50**.

### [MEDIUM] Flask server binds to 0.0.0.0 by default
- **File:** `app.py:1417`
- **Description:** `app.run(debug=False, host="0.0.0.0", port=port)` exposes the dev server on every interface — no auth, no CSRF, no rate-limits.
- **Remediation:** Default to `127.0.0.1`; opt-in to wider bind via `INFRALENS_HOST` env var. Fix was prepared locally but could not be pushed (51 KB `app.py` body exceeds per-tool payload limit, same blocker as prior runs).
- **PR-ready:** attempted, failed due to size limit.
- **Action taken:** Existing **Issue #51**; patch is pasted in that issue.

### [MEDIUM] (meta) Security-review backlog consolidation
- **File:** n/a
- **Description:** The repo has accumulated ~12 open security issues from repeated automated scans. Duplicate/near-duplicate entries exist (several on CSRF, rate limiting, missing headers) from older runs that pre-date the current unified set.
- **Remediation:** Triage the backlog. A `SECURITY.md` with accepted-risk declarations would let future scans skip already-acknowledged findings.
- **Action taken:** Existing **Issue #52** already captures this.

### [LOW] Error responses leak raw exception messages
- **File:** `app.py:1217, 1243, 1287, 1327, 1362`
- **Description:** `return f"Error parsing {filename}: {str(e)}", 400` exposes library internals / paths.
- **Remediation:** Log server-side with `app.logger.exception`, return a generic message.
- **Action taken:** Existing **Issue #45**.

### [LOW] Thread-unsafe global state: `app.config['_last_license_report']`
- **File:** `app.py:1256`
- **Description:** Process-global state overwritten per request; cross-request leakage risk if ever read back. Also dead code — no route reads it.
- **Remediation:** Delete the block. Fix was prepared locally but could not be pushed (size limit as above).
- **PR-ready:** attempted, failed due to size limit.
- **Action taken:** Existing **Issue #46**.

### [LOW] GitHub Actions pinned to floating major tags
- **File:** `.github/workflows/pages.yml`
- **Description:** `actions/checkout@v4`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4` — floating tags can be force-moved to compromised commits.
- **Remediation:** Pin to full commit SHAs with `# vX.Y.Z` comments.
- **PR-ready:** **yes — fixed in PR #53.**
- **Action taken:** **PR #53** https://github.com/FlorianCasse/InfraLens/pull/53 (refs Issue #47).

## What was checked

- Full repository tree listing at the `main` ref.
- `app.py` (1418 lines) read in full — reviewed routes, error handling, globals, the `MAX_CONTENT_LENGTH` setting, bind host, validation logic, and the embedded HTML.
- `index.html` (1586 lines) read in full — reviewed CDN references, `innerHTML` sinks, `target="_blank"` links (have no user-supplied URLs, so not a `rel="noopener"` risk here), and inline scripts.
- `requirements.txt` — `flask~=3.0`, `pandas~=2.0`, `openpyxl~=3.1`. Compatible-release specifiers allow minor-version drift; not flagged as new since it's already documented in older issues.
- `.github/workflows/pages.yml` — only workflow present. Permissions are already minimal (`contents: read, pages: write, id-token: write`); only concern was the unpinned actions, now fixed in PR #53.
- `.gitignore` — no credential-shaped patterns missing.
- No hardcoded secrets, API keys, or credentials found in source or config.
- No `eval` / `exec` / `pickle.loads` / unsafe deserialization patterns in `app.py`.
- No SQL (there's no database) — no SQLi surface.
- No `subprocess` / `os.system` / shell usage — no command injection surface.
- No path-traversal surface: uploads are read via `f.read()` into memory, nothing is written to disk.

## Recommendation

Prioritise in this order:

1. **Merge PR #53** — one-line supply-chain hardening, zero runtime risk.
2. **Fix XSS (#49)** — only HIGH finding; patch is self-contained.
3. **Add security headers (#41)** — cheap defense-in-depth that limits XSS blast radius.
4. **Triage the backlog (#52)** — close pre-consolidation duplicates so future scans don't re-create noise.
