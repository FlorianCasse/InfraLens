"""
InfraLens — VMware infrastructure → Excalidraw Generator
Flask web app — single file, no templates directory needed.
Supports RVTools and LiveOptics .xlsx exports.
"""

import io
import json
import os
import uuid
import html
import re
from flask import Flask, request, send_file, Response
import pandas as pd

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB upload limit


@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    return response
