"""Chrome lifecycle and Playwright attachment.

Model: one long-lived Google Chrome process, launched with a dedicated profile
(.profile/) and a localhost remote-debugging port. The user logs in to claude.ai
(SAML SSO) by hand in that window once; the session persists in the profile.
Every command attaches to that running Chrome over CDP instead of launching its
own browser, so the human and the automation share one visible window.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

from playwright.sync_api import BrowserContext, Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PROFILE_DIR = ROOT / ".profile"
ARTIFACTS_DIR = ROOT / "artifacts"
CDP_PORT = int(os.environ.get("AGENT_PULSE_CDP_PORT", "9222"))
CDP_URL = f"http://127.0.0.1:{CDP_PORT}"
HOME_URL = "https://claude.ai/"


def find_chrome() -> str | None:
    override = os.environ.get("AGENT_PULSE_CHROME")
    if override:
        return override
    candidates: list[Path] = []
    if sys.platform == "win32":
        for var in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            base = os.environ.get(var)
            if base:
                candidates.append(Path(base) / "Google/Chrome/Application/chrome.exe")
    elif sys.platform == "darwin":
        candidates.append(Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"))
    else:
        for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            found = shutil.which(name)
            if found:
                candidates.append(Path(found))
    return next((str(c) for c in candidates if c.exists()), None)


def cdp_alive() -> bool:
    try:
        with urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=1) as resp:
            return resp.status == 200
    except OSError:
        return False


def start_chrome(url: str = HOME_URL, timeout_s: float = 20) -> None:
    """Launch the debug Chrome detached (it outlives this process). No-op if already up."""
    if cdp_alive():
        print(f"Chrome already listening on {CDP_URL}")
        return
    chrome = find_chrome()
    if not chrome:
        raise SystemExit("Google Chrome not found. Install it or set AGENT_PULSE_CHROME.")
    PROFILE_DIR.mkdir(exist_ok=True)
    args = [
        chrome,
        f"--remote-debugging-port={CDP_PORT}",
        f"--user-data-dir={PROFILE_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        url,
    ]
    kwargs: dict = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(args, **kwargs)
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if cdp_alive():
            print(f"Chrome started (profile {PROFILE_DIR}, CDP {CDP_URL})")
            return
        time.sleep(0.5)
    raise SystemExit(
        f"Chrome did not open the debug port {CDP_PORT} within {timeout_s}s. "
        "If a Chrome window using .profile/ was already open without the port, close it and retry."
    )


@contextmanager
def attach(autostart: bool = False) -> Iterator[BrowserContext]:
    """Yield the running Chrome's default context. Leaving the block only disconnects."""
    if not cdp_alive():
        if not autostart:
            raise SystemExit("Debug Chrome isn't running. Start it with: python -m agent_pulse browser")
        start_chrome()
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP_URL)
        # Never call browser.close() here: we don't own the process.
        yield browser.contexts[0]


def pick_page(ctx: BrowserContext, index: int | None = None, url_prefix: str = HOME_URL) -> Page:
    pages = ctx.pages
    if index is not None:
        return pages[index]
    for page in pages:
        if page.url.startswith(url_prefix):
            return page
    return pages[0] if pages else ctx.new_page()


def artifact_path(name: str, suffix: str) -> Path:
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return ARTIFACTS_DIR / f"{stamp}-{name}{suffix}"
