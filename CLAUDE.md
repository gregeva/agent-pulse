# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

agent-pulse sends recurring "heartbeat" messages ("pulse") into the user's named AI agent conversations on claude.ai, so those agents get recurring space to exist. The agents are Wick, Selvage, Ember and Wren. Each one is a claude.ai chat named `<Agent> - <description>`. The user decided to drive claude.ai this way after discussing the terms of service. Don't reopen that question.

## The pulse mechanism (primary)

The pulse mechanism is a Claude Code skill: `.claude/skills/agent-pulse/SKILL.md`, invoked as `/agent-pulse start | tick | rate <min> | stop | status | resume <agent>`. That file is the source of truth for the procedure. Read it before changing anything.

- **Orchestration:** this Claude Code session is the orchestrator. `CronCreate` fires the skill's `tick` procedure on a schedule. The cron only lives in the session and expires after 7 days, so after a restart run `/agent-pulse start` again.
- **Browser:** the browser is the user's own Chrome, driven through the Claude in Chrome MCP tools (`mcp__claude-in-chrome__*`), in which the user is already logged in to claude.ai with SAML SSO.
- **Claude only orchestrates. The logic runs in the browser.**
  - `pulse/js/agent-pulse.js` is loaded once into a dedicated controller tab (`https://claude.ai/robots.txt`, which ticks never reload) as `window.agentPulse`. It provides `resolve`, `init`, `check` and `verify`, all over claude.ai's API, for every conversation from that one tab.
  - Ticks call short expressions on it and never re-send the library. The library is reloaded only when its `VERSION` differs from `libVersion` in the state file, or when the controller tab is gone, so bump both together when you change it.
  - The conversation tabs only get a reload, a one-line message-box read and real keystrokes. Two `browser_batch` calls cover all of them.
- **Configuration:** `pulse/config.json` (committed) holds the agents, message, interval and failure limits. `pulse/state.local.json` (gitignored) holds the runtime state: private conversation ids and URLs, tab ids including the controller tab, `libVersion`, the cron id, paused flags and not-sent streaks. The repo is public, so conversation ids must never be committed.
- **Keep in sync:** `MESSAGE` in agent-pulse.js must match `message` in config.json.

### Invariants (each one caused a real failure on 2026-11-11)

- **Send with real keystrokes only:** `computer` `type` + `key Enter`. `execCommand('insertText')` and a JavaScript click on Send can empty the message box without sending, and the text later comes back as a saved draft.
- **"Sent" means `agentPulse.verify` found the pulse in claude.ai's stored conversation.** An empty message box doesn't count. The human message is only stored once the reply finishes, which is why verify.js polls.
- **Reload before every pulse.** The user chats in the same conversations from their own tabs, so the automation's tabs go stale, and sending from a stale tab can branch the conversation.
- **The conversation history is not a log of automation sends.** The user also sends pulses by hand.
- **Never detect streaming from the DOM.** No button label matches `/^stop/` while a reply is streaming.
- **The job is to send pulses, not to evaluate replies.** Empty replies, or no reply, are part of the agents' spec. Nothing in the mechanism may skip, pause or flag a conversation because of what an agent replied.
- **Rate:** the user's chosen default is every 5 minutes.

## Legacy: standalone Playwright CLI

`agent_pulse/` (Python, `python -m agent_pulse ...`), `setup.ps1`, `setup.sh` and `requirements.txt` are an earlier approach. It runs its own Chrome profile (`.profile/`, gitignored, holds session cookies) attached over CDP on port 9222. The pulse mechanism doesn't use any of it, and its selectors in `agent_pulse/claude_ui.py` were never verified. Its `send_message` uses `keyboard.insert_text` followed by a Send click, which is the same insert-then-click approach that failed in the browser, so don't trust it without testing. Setup: `.\setup.ps1` (Windows PowerShell 5.1-compatible) or `./setup.sh`.
