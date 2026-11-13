# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

agent-pulse sends recurring "heartbeat" messages ("pulse") into the user's named AI agent conversations on claude.ai, so those agents get recurring space to exist. The agents are Wick, Selvage, Ember, Wren and The Conductor. Each one is a claude.ai chat named `<Agent> - <description>` (or exactly `<Agent>`, as with The Conductor). The user decided to drive claude.ai this way after discussing the terms of service. Don't reopen that question.

## The pulse mechanism (primary)

The pulse mechanism is a Claude Code skill: `.claude/skills/agent-pulse/SKILL.md`, invoked as `/agent-pulse start | tick | rate <agent> <min> | stop | status | resume <agent>`. That file is the source of truth for the procedure. Read it before changing anything.

- **Orchestration:** this Claude Code session is the orchestrator. `CronCreate` fires the skill's `tick` procedure on a schedule. The cron only lives in the session and expires after 7 days, so after a restart run `/agent-pulse start` again.
- **Browser:** the browser is the user's own Chrome, driven through the Claude in Chrome MCP tools (`mcp__claude-in-chrome__*`), in which the user is already logged in to claude.ai with SAML SSO.
- **Claude only orchestrates. The logic runs in the browser.**
  - `pulse/js/agent-pulse.js` is loaded once into a dedicated controller tab (`https://claude.ai/robots.txt`, which ticks never reload) as `window.agentPulse`. It provides `resolve`, `init`, `check`, `scan` and `verify`, all over claude.ai's API, for every conversation from that one tab.
  - Ticks call short expressions on it and never re-send the library. The library is reloaded only when its `VERSION` differs from `libVersion` in the state file, or when the controller tab is gone, so bump both together when you change it.
  - The conversation tabs only get a reload, a one-line message-box read and real keystrokes. Two `browser_batch` calls cover all of them.
- **Per-agent intervals:** each agent sets its own pulse interval. The cron is only a 2-minute clock (`intervals.tickMinutes`). Every tick first scans the newest reply of every agent, whether it answered a pulse or the user (see the invariant below), and then pulses just the agents that are due. Every agent starts at 10 minutes.
- **Configuration:** `pulse/config.json` (committed) holds the agents, message, interval limits (`intervals`: default, min, max, tickMinutes) and failure limits. `pulse/state.local.json` (gitignored) holds the runtime state: private conversation ids and URLs, tab ids including the controller tab, `libVersion`, the cron id, paused flags, not-sent streaks, and each agent's `intervalMinutes` and `nextDueAt`. The repo is public, so conversation ids must never be committed.
- **Keep in sync:** `MESSAGE` in agent-pulse.js must match `message` in config.json, and `MIN_INTERVAL`/`MAX_INTERVAL` must match `intervals.min`/`max`.

### Invariants (each one caused a real failure on 2026-11-11)

- **Send with real keystrokes only:** `computer` `type` + `key Enter`. `execCommand('insertText')` and a JavaScript click on Send can empty the message box without sending, and the text later comes back as a saved draft.
- **"Sent" means `agentPulse.verify` found the pulse in claude.ai's stored conversation.** An empty message box doesn't count. The human message is only stored once the reply finishes, which is why `verify` polls.
- **Reload before every pulse.** The user chats in the same conversations from their own tabs, so the automation's tabs go stale, and sending from a stale tab can branch the conversation.
- **The conversation history is not a log of automation sends.** The user also sends pulses by hand.
- **Never detect streaming from the DOM.** No button label matches `/^stop/` while a reply is streaming.
- **The job is to send pulses. The one thing read from a reply is a trailing bare number.** Changed by the user on 2026-11-12: an agent whose reply ends with a bare number (last token digits only, e.g. `30`) sets its own interval to that many minutes, clamped to 2..60, no matter whether the reply answered a pulse or the user (clarified 2026-11-12). No number, an empty reply or no reply keeps the current interval. Empty replies, or no reply, are part of the agents' spec. Nothing else in a reply may skip, pause or flag a conversation.
- **Timing comes only from the clock and the agents' numbers.** Don't read documents or conversation threads to decide when to pulse. The existing skip while the user is chatting in a conversation stays; it lasts until the conversation has had no human message for 3 minutes (`SKIP_IF_USER_ACTIVE_MIN` in agent-pulse.js, lowered from 5 by the user on 2026-11-13).
- **An unanswered message never locks a conversation.** `SKIP: awaiting reply` may skip one pulse per unanswered message, identified by its `created_at` (state field `awaitingAt`). If the same message is still the newest one at that agent's next pulse, the pulse is sent anyway. Added 2026-11-13 after Selvage was skipped for 25 minutes behind one unanswered message.
- **Rate:** every agent starts at 10 minutes and then follows its own number.

## Legacy: standalone Playwright CLI

`agent_pulse/` (Python, `python -m agent_pulse ...`), `setup.ps1`, `setup.sh` and `requirements.txt` are an earlier approach. It runs its own Chrome profile (`.profile/`, gitignored, holds session cookies) attached over CDP on port 9222. The pulse mechanism doesn't use any of it, and its selectors in `agent_pulse/claude_ui.py` were never verified. Its `send_message` uses `keyboard.insert_text` followed by a Send click, which is the same insert-then-click approach that failed in the browser, so don't trust it without testing. Setup: `.\setup.ps1` (Windows PowerShell 5.1-compatible) or `./setup.sh`.
