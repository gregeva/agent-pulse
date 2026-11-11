// agent-pulse precheck. Run with javascript_tool in the conversation's tab right AFTER reloading it.
// Decides from claude.ai's stored conversation (not the DOM) whether to pulse.
// Returns READY | READY-LEFTOVER (composer focused, caret at end) | SKIPPED: ... | ERROR: ...
// It never looks at what the agents reply: empty or absent replies are part of their spec.
// Keep MESSAGE in sync with pulse/config.json "message".
await (async () => {
  const MESSAGE = 'pulse';
  const SKIP_IF_USER_ACTIVE_MIN = 5;
  await new Promise(r => setTimeout(r, 3000)); // let the reloaded page hydrate
  const org = decodeURIComponent((document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1] || '');
  if (!org) return 'ERROR: not logged in (no lastActiveOrg cookie)';
  const id = location.pathname.split('/').pop();
  const res = await fetch(`/api/organizations/${org}/chat_conversations/${id}?tree=False&rendering_mode=messages`, { credentials: 'include' });
  if (!res.ok) return 'ERROR: conversation fetch ' + res.status;
  const ms = (await res.json()).chat_messages || [];
  const tx = m => m.text || (m.content || []).map(c => c.text || '').join('') || '';
  const last = ms[ms.length - 1];
  const lastH = [...ms].reverse().find(m => m.sender === 'human');
  const ageMin = lastH ? (Date.now() - Date.parse(lastH.created_at)) / 60000 : Infinity;
  window.__pulseHumans = ms.filter(m => m.sender === 'human').length; // baseline for verify.js
  if (last && last.sender === 'human') return 'SKIPPED: awaiting reply';
  if (lastH && tx(lastH).trim().toLowerCase() !== MESSAGE && ageMin < SKIP_IF_USER_ACTIVE_MIN)
    return `SKIPPED: user chatting ${ageMin.toFixed(1)}m ago`;
  const ed = document.querySelector('[contenteditable="true"][aria-label="Write your prompt to Claude"]');
  if (!ed) return 'ERROR: no composer';
  const t = ed.textContent.trim();
  if (t && t !== MESSAGE) return 'SKIPPED: composer has other text';
  ed.focus();
  const range = document.createRange();
  range.selectNodeContents(ed);
  range.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return t ? 'READY-LEFTOVER' : 'READY';
})()
