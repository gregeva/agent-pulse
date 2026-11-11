"""claude.ai page model: every selector and UI assumption lives here.

STATUS: provisional. These are written from general knowledge of the claude.ai
UI and have NOT yet been verified against the live page. Confirm each with
`python -m agent_pulse snap` / `exec` before trusting a pulse run, then update
this note.
"""
from __future__ import annotations

from playwright.sync_api import Locator, Page

LOGIN_URL_MARKERS = ("/login", "/magic-link", "/sso")


def is_logged_out(page: Page) -> bool:
    return any(m in page.url for m in LOGIN_URL_MARKERS)


def composer(page: Page) -> Locator:
    # ProseMirror contenteditable prompt box.
    return page.locator('div[contenteditable="true"]').first


def send_button(page: Page) -> Locator:
    return page.get_by_role("button", name="Send message")


def stop_button(page: Page) -> Locator:
    # Visible while a response is streaming.
    return page.get_by_role("button", name="Stop response")


def send_message(page: Page, text: str) -> None:
    box = composer(page)
    box.wait_for(state="visible", timeout=30_000)
    box.click()
    # insert_text is one input event, so ProseMirror doesn't treat newlines as Enter/submit.
    page.keyboard.insert_text(text)
    send_button(page).click(timeout=10_000)


def wait_for_reply(page: Page, start_timeout_ms: int = 30_000, finish_timeout_ms: int = 600_000) -> bool:
    """Wait for the response to start streaming, then finish. Returns False if it never started."""
    try:
        stop_button(page).wait_for(state="visible", timeout=start_timeout_ms)
    except Exception:
        return False
    stop_button(page).wait_for(state="hidden", timeout=finish_timeout_ms)
    return True
