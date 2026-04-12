# Security Review: InfraLens

**Date:** 2026-04-12
**Reviewer:** Claude (automated security review)
**Repository:** floriancasse/infralens
**Stack:** Python / Flask, pandas, openpyxl, Excalidraw, GitHub Pages

## Summary
- **Total findings:** 15
- **Critical:** 0 | **High:** 3 | **Medium:** 7 | **Low:** 5
- **PRs opened:** 4
  - [PR #23](https://github.com/FlorianCasse/InfraLens/pull/23) — Pin dependencies and GitHub Actions (new)
  - [PR #22](https://github.com/FlorianCasse/InfraLens/pull/22) — Fix XSS and security headers (existing)
  - [PR #4](https://github.com/FlorianCasse/InfraLens/pull/4) — Harden app.py (existing)
  - [PR #5](https://github.com/FlorianCasse/InfraLens/pull/5) — Pin XLSX CDN and escapeHtml (existing)
- **Issues opened:** 4
  - [Issue #24](https://github.com/FlorianCasse/InfraLens/issues/24) — File type validation relies on extension only
  - [Issue #25](https://github.com/FlorianCasse/InfraLens/issues/25) — Excalidraw loaded from dev build
  - [Issue #26](https://github.com/FlorianCasse/InfraLens/issues/26) — 50 MB upload limit
  - [Issue #27](https://github.com/FlorianCasse/InfraLens/issues/27) — No authentication on endpoints

## Findings

### [HIGH] Stored XSS via unescaped Excel cell data in innerHTML
- **File:** `index.html` (~lines 1033-1055)
- **Description:** renderVcf9Report() and renderLicenseReport() directly concatenate Excel cell values (hostname, site, cluster, model, etc.) into innerHTML without HTML escaping. A crafted .xlsx with `<img src=x onerror=alert(1)>` executes JavaScript in the browser.
- **Remediation:** Add escapeHtml() helper; apply to all innerHTML interpolations. Or use textContent/DOM APIs.
- **PR-ready:** yes
- **Action taken:** PR #22 https://github.com/FlorianCasse/InfraLens/pull/22

### [HIGH] External CDN scripts loaded without Subresource Integrity
- **File:** `index.html` (~line 460, ~lines 1170-1185)
- **Description:** SheetJS xlsx loaded from jsDelivr with no version pin and no SRI hash. Excalidraw and React loaded from esm.sh without SRI. A CDN compromise executes in the user's session.
- **Remediation:** Pin xlsx to specific version; add integrity and crossorigin attributes.
- **PR-ready:** yes
- **Action taken:** PR #5 https://github.com/FlorianCasse/InfraLens/pull/5

### [HIGH] Race condition / data leakage via app.config shared state
- **File:** `app.py` (~line 975)
- **Description:** `app.config['_last_license_report']` is a global dict entry written per-request. Under concurrent load, user A's infrastructure data leaks to user B.
- **Remediation:** Remove app.config shared state entirely; download endpoints already re-parse files independently.
- **PR-ready:** yes
- **Action taken:** PR #4 https://github.com/FlorianCasse/InfraLens/pull/4

### [MEDIUM] Server binds to 0.0.0.0 by default
- **File:** `app.py` (~line 1114)
- **Description:** Binds on all network interfaces. The service is accessible from any machine on the network without authentication.
- **Remediation:** Change to `host='127.0.0.1'`; add --host CLI flag for explicit override.
- **PR-ready:** yes
- **Action taken:** PR #4 https://github.com/FlorianCasse/InfraLens/pull/4

### [MEDIUM] Missing HTTP security headers
- **File:** `app.py` (all routes)
- **Description:** No CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, or Permissions-Policy headers.
- **Remediation:** Add Flask after_request hook or flask-talisman.
- **PR-ready:** yes
- **Action taken:** PR #22 https://github.com/FlorianCasse/InfraLens/pull/22

### [MEDIUM] File type validation relies solely on extension
- **File:** `app.py` (~lines 947-950)
- **Description:** Only checks file extension, not magic bytes. Crafted files (ZIP bombs, malformed OLE2) can bypass validation.
- **Remediation:** Validate magic bytes (PK\x03\x04 for XLSX); use python-magic.
- **PR-ready:** yes
- **Action taken:** Issue #24 https://github.com/FlorianCasse/InfraLens/issues/24

### [MEDIUM] Silent exception swallowing in VCF9 block
- **File:** `app.py` (~lines 960-967)
- **Description:** `except Exception: pass` hides all errors including exploitation attempts.
- **Remediation:** Log the exception; narrow except clause to specific expected types.
- **PR-ready:** yes
- **Action taken:** PR #4 https://github.com/FlorianCasse/InfraLens/pull/4

### [MEDIUM] ReDoS risk via unvalidated regex patterns from JSON data files
- **File:** `app.py` (~lines 107-124)
- **Description:** cpu_rules patterns from vcf9_cpu.json fed directly to re.search(). Tampered regex could cause catastrophic backtracking.
- **Remediation:** Validate JSON structure; limit pattern complexity; consider embedding data as Python dict.
- **PR-ready:** yes
- **Action taken:** PR #23 https://github.com/FlorianCasse/InfraLens/pull/23 (noted)

### [MEDIUM] GitHub Actions pinned by mutable tag
- **File:** `.github/workflows/pages.yml` (lines 19, 25, 35, 41)
- **Description:** Actions referenced by mutable version tags. Tags can be moved, enabling supply-chain attacks.
- **Remediation:** Pin each action to full commit SHA.
- **PR-ready:** yes
- **Action taken:** PR #23 https://github.com/FlorianCasse/InfraLens/pull/23

### [MEDIUM] Excalidraw loaded from dev build
- **File:** `index.html` (~lines 1175-1185)
- **Description:** Excalidraw imported from /dist/dev/ instead of /dist/prod/. Dev builds include extra debug code.
- **Remediation:** Switch to /dist/prod/ in both import and CSS link.
- **PR-ready:** yes
- **Action taken:** Issue #25 https://github.com/FlorianCasse/InfraLens/issues/25

### [LOW] Dependency versions not pinned to exact versions
- **File:** `requirements.txt` (lines 1-3)
- **Description:** Compatible-release operators (~=) allow non-deterministic installs. No lockfile committed.
- **Remediation:** Pin exact versions; commit pip freeze output.
- **PR-ready:** yes
- **Action taken:** PR #23 https://github.com/FlorianCasse/InfraLens/pull/23

### [LOW] 50 MB upload limit may allow resource exhaustion
- **File:** `app.py` (~line 14)
- **Description:** Large Excel files loaded entirely into memory; concurrent uploads could exhaust memory.
- **Remediation:** Reduce to 5-10 MB; add rate limiting; use openpyxl read_only mode.
- **PR-ready:** yes
- **Action taken:** Issue #26 https://github.com/FlorianCasse/InfraLens/issues/26

### [LOW] Untrusted upload filename reflected in error messages
- **File:** `app.py` (multiple routes)
- **Description:** f.filename interpolated directly into error strings without sanitization.
- **Remediation:** Use os.path.basename() and limit length; strip control characters.
- **PR-ready:** yes
- **Action taken:** PR #22 https://github.com/FlorianCasse/InfraLens/pull/22

### [LOW] Predictable Excalidraw element seeds
- **File:** `app.py` (~line 800)
- **Description:** Element seeds derived from Python hash() which can be deterministic with PYTHONHASHSEED=0.
- **Remediation:** Use uuid.uuid4() or random.randint() for seeds.
- **PR-ready:** yes
- **Action taken:** Noted in report — low priority, cosmetic impact only

### [LOW] No authentication on any endpoint
- **File:** `app.py` (~line 907)
- **Description:** All endpoints publicly accessible. Sensitive VMware inventory data processed without authentication.
- **Remediation:** Add HTTP Basic Auth or API token for public deployments.
- **PR-ready:** yes
- **Action taken:** Issue #27 https://github.com/FlorianCasse/InfraLens/issues/27
