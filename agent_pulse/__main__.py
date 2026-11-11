"""CLI: python -m agent_pulse <command> ...

browser   launch the debug Chrome (log in to claude.ai by hand there once)
tabs      list open tabs
goto      navigate a tab to a URL
snap      screenshot + ARIA snapshot of a tab (exploration / debugging)
exec      run a Python statement against `page` (exploration only)
pulse     send one heartbeat message into a conversation
"""
from __future__ import annotations

import argparse
import sys

from . import browser, claude_ui


def cmd_browser(args: argparse.Namespace) -> None:
    browser.start_chrome(args.url)


def cmd_tabs(args: argparse.Namespace) -> None:
    with browser.attach() as ctx:
        for i, page in enumerate(ctx.pages):
            print(f"[{i}] {page.title()!r}  {page.url}")


def cmd_goto(args: argparse.Namespace) -> None:
    with browser.attach() as ctx:
        page = browser.pick_page(ctx, args.tab)
        page.goto(args.url, wait_until="domcontentloaded")
        print(page.url)


def cmd_snap(args: argparse.Namespace) -> None:
    with browser.attach() as ctx:
        page = browser.pick_page(ctx, args.tab)
        png = browser.artifact_path(args.name, ".png")
        page.screenshot(path=str(png), full_page=False)
        aria = page.locator(args.root).aria_snapshot()
        yml = png.with_suffix(".aria.yml")
        yml.write_text(aria, encoding="utf-8")
        print(f"url:        {page.url}")
        print(f"screenshot: {png}")
        print(f"aria:       {yml}")
        if not args.quiet:
            print(aria)


def cmd_exec(args: argparse.Namespace) -> None:
    with browser.attach() as ctx:
        page = browser.pick_page(ctx, args.tab)
        scope = {"page": page, "ctx": ctx, "ui": claude_ui}
        try:
            result = eval(args.code, scope)  # noqa: S307 - local dev tool
            if result is not None:
                print(repr(result))
        except SyntaxError:
            exec(args.code, scope)  # noqa: S102


def cmd_pulse(args: argparse.Namespace) -> None:
    with browser.attach(autostart=True) as ctx:
        page = next((p for p in ctx.pages if p.url.startswith(args.url)), None)
        opened = page is None
        if opened:
            page = ctx.new_page()
            page.goto(args.url, wait_until="domcontentloaded")
        if claude_ui.is_logged_out(page):
            raise SystemExit(f"Not logged in ({page.url}). Log in in the debug Chrome window, then retry.")
        if args.dry_run:
            claude_ui.composer(page).wait_for(state="visible", timeout=30_000)
            print("dry run: composer found, nothing sent")
        else:
            claude_ui.send_message(page, args.message)
            print("sent")
            if not args.no_wait:
                started = claude_ui.wait_for_reply(page)
                print("reply finished" if started else "WARNING: no reply detected")
        shot = browser.artifact_path("pulse", ".png")
        page.screenshot(path=str(shot))
        print(f"screenshot: {shot}")
        if opened and not args.keep_tab:
            page.close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="agent_pulse", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("browser")
    p.add_argument("--url", default=browser.HOME_URL)
    p.set_defaults(fn=cmd_browser)

    p = sub.add_parser("tabs")
    p.set_defaults(fn=cmd_tabs)

    def tab_arg(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--tab", type=int, help="tab index from `tabs` (default: first claude.ai tab)")

    p = sub.add_parser("goto")
    p.add_argument("url")
    tab_arg(p)
    p.set_defaults(fn=cmd_goto)

    p = sub.add_parser("snap")
    p.add_argument("--name", default="snap")
    p.add_argument("--root", default="body", help="CSS selector to scope the ARIA snapshot")
    p.add_argument("-q", "--quiet", action="store_true", help="don't print the ARIA snapshot")
    tab_arg(p)
    p.set_defaults(fn=cmd_snap)

    p = sub.add_parser("exec")
    p.add_argument("code", help="expression or statement; `page`, `ctx`, `ui` are in scope")
    tab_arg(p)
    p.set_defaults(fn=cmd_exec)

    p = sub.add_parser("pulse")
    p.add_argument("--url", required=True, help="conversation URL, e.g. https://claude.ai/chat/<id>")
    p.add_argument("--message", default="pulse")
    p.add_argument("--dry-run", action="store_true", help="open and locate the composer, send nothing")
    p.add_argument("--no-wait", action="store_true", help="don't wait for the reply to finish")
    p.add_argument("--keep-tab", action="store_true")
    p.set_defaults(fn=cmd_pulse)

    args = parser.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
