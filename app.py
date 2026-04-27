"""
InfraLens — VMware infrastructure → Excalidraw Generator
Flask web app — single file, no templates directory needed.
Supports RVTools and LiveOptics .xlsx exports.
"""

import io
import json
import os
import uuid
import re
from flask import Flask, request, send_file, Response
import pandas as pd

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB upload limit


# Defence-in-depth headers. Renders are always self-hosted (no third-party
# scripts other than the pinned XLSX CDN), so a tight CSP is safe.
@app.after_request
def _set_security_headers(resp):
    resp.headers.setdefault(
        'Content-Security-Policy',
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "font-src 'self' data:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('X-Frame-Options', 'DENY')
    resp.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    resp.headers.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    return resp


def _safe_filename(name):
    """Strip control chars and HTML-significant chars from a user-supplied
    filename before reflecting it back in an error message."""
    return re.sub(r'[^A-Za-z0-9._\- ]', '_', (name or 'file'))[:80]
