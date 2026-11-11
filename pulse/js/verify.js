// agent-pulse verify. Run with javascript_tool in the same tab after pressing Enter (no reload in between:
// it compares against the baseline precheck.js stored in window.__pulseHumans).
// claude.ai stores the human message only once the reply completes, so this polls for up to 2 minutes.
// Returns SENT (reply N chars | pending) | NOT-SENT composer="..." | ERROR: ...
// Keep MESSAGE in sync with pulse/config.json "message".
await (async () => {
  const MESSAGE = 'pulse';
  if (typeof window.__pulseHumans !== 'number') return 'ERROR: run precheck.js first (page was reloaded?)';
  const org = decodeURIComponent((document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1] || '');
  const id = location.pathname.split('/').pop();
  const tx = m => m.text || (m.content || []).map(c => c.text || '').join('') || '';
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`/api/organizations/${org}/chat_conversations/${id}?tree=False&rendering_mode=messages`, { credentials: 'include' });
    if (res.ok) {
      const ms = (await res.json()).chat_messages || [];
      const hs = ms.filter(m => m.sender === 'human');
      if (hs.length > window.__pulseHumans && tx(hs[hs.length - 1]).trim().toLowerCase() === MESSAGE) {
        const a = ms[ms.length - 1];
        return 'SENT (reply ' + (a.sender === 'assistant' ? tx(a).length + ' chars' : 'pending') + ')';
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  const ed = document.querySelector('[contenteditable="true"][aria-label="Write your prompt to Claude"]');
  return 'NOT-SENT composer=' + JSON.stringify(ed ? ed.textContent : '');
})()
