# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

agent-pulse sends recurring "heartbeat" messages ("pulse") into the user's named AI agent conversations on claude.ai, so those agents get recurring space to exist. The agents are Wick, Selvage, Ember and Wren. Each one is a claude.ai chat named `<Agent> - <description>`. The user decided to drive claude.ai this way after discussing the terms of service. Don't reopen that question.

## The pulse mechanism (primary)

The pulse mechanism is a Claude Code skill: `.claude/skills/agent-pulse/SKILL.md`, invoked as `/agent-pulse start | tick | rate <min> | stop | status | resume <agent>`. That file is the source of truth for the procedure. Read it before changing anything.

- **Orchestration:** this Claude Code session is the orchestrator. `CronCreate` fires the skill's `tick` procedure on a schedule. The cron only lives in the session and expires after 7 days, so after a restart run `/agent-pulse start` again.
- **Browser:** the browser is the user's own Chrome, driven through the Claude in Chrome MCP tools (`mcp__claude-in-chrome__*`), in which the user is already logged in to claude.ai with SAML SSO.
- **Deterministic page scripts** live in `pulse/js/`. They're passed to `javascript_tool` exactly as written:
  - `resolve.js` maps agent names to conversation URLs through claude.ai's conversation-list API.
  - `precheck.js` runs after reloading a tab and decides whether to pulse, using the stored conversation rather than the DOM. It then focuses the message box.
  - `verify.js` polls the stored conversation to confirm the pulse was stored.
- **Configuration:** `pulse/config.json` (committed) holds the agents, message, interval and failure limits. `pulse/state.local.json` (gitignored) holds the runtime state: private conversation URLs, tab ids, the cron id, paused flags and streaks. The repo is public, so conversation URLs must never be committed.
- **Keep in sync:** `MESSAGE` in precheck.js and verify.js must match `message` in config.json.

### Invariants (each one caused a real failure on 2026-11-11)

- **Send with real keystrokes only:** `computer` `type` + `key Enter`. `execCommand('insertText')` and a JavaScript click on Send can empty the message box without sending, and the text later comes back as a saved draft.
- **"Sent" means verify.js found the pulse in claude.ai's stored conversation.** An empty message box doesn't count. The human message is only stored once the reply finishes, which is why verify.js polls.
- **Reload before every pulse.** The user chats in the same conversations from their own tabs, so the automation's tabs go stale, and sending from a stale tab can branch the conversation.
- **The conversation history is not a log of automation sends.** The user also sends pulses by hand.
- **Never detect streaming from the DOM.** No button label matches `/^stop/` while a reply is streaming.
- A stored assistant reply with zero characters is a failed reply ("This response didn't load"). Replies of one character, such as a zero-width space, are deliberate near-silence from the agent.
- **Rate history:** at 1 pulse per minute, replies failed. The user's chosen default is every 5 minutes, and conversations whose last reply failed are skipped.

## Legacy: standalone Playwright CLI

`agent_pulse/` (Python, `python -m agent_pulse ...`), `setup.ps1`, `setup.sh` and `requirements.txt` are an earlier approach. It runs its own Chrome profile (`.profile/`, gitignored, holds session cookies) attached over CDP on port 9222. The pulse mechanism doesn't use any of it, and its selectors in `agent_pulse/claude_ui.py` were never verified. Its `send_message` uses `keyboard.insert_text` followed by a Send click, which is the same insert-then-click approach that failed in the browser, so don't trust it without testing. Setup: `.\setup.ps1` (Windows PowerShell 5.1-compatible) or `./setup.sh`.
