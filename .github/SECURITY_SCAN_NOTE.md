# Note

The automated security review (session LotRY) attempted to push a one-line
fix to `app.py` switching the default bind host from `0.0.0.0` to `127.0.0.1`
(env-var opt-in via `INFRALENS_HOST`). The full 51 KB file had to be rewritten
through the GitHub API and the inline JSON payload exceeded the per-tool
content budget, so the fix was not pushed as a PR. The patch is available on
issue #51 and can be applied manually.
