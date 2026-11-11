// agent-pulse controller library.
// Load this ONCE into the controller tab: a same-origin claude.ai page that ticks never reload.
// Ticks then only call short expressions such as `await agentPulse.check()` and `await agentPulse.verify([...])`.
// It talks only to claude.ai's API, so one tab serves every conversation. It never evaluates the agents'
// replies: empty or absent replies are part of their spec.
// Bump VERSION whenever this file changes. Ticks reload the library when the loaded version differs.
window.agentPulse = (() => {
  const VERSION = 1;
  const MESSAGE = 'pulse'; // keep in sync with pulse/config.json "message"
  const SKIP_IF_USER_ACTIVE_MIN = 5;

  const org = () => decodeURIComponent((document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1] || '');
  const tx = m => m.text || (m.content || []).map(c => c.text || '').join('') || '';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = async path => {
    const r = await fetch(`/api/organizations/${org()}${path}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`);
    return r.json();
  };
  const messages = async uuid => (await api(`/chat_conversations/${uuid}?tree=False&rendering_mode=messages`)).chat_messages || [];

  const lib = {
    version: VERSION,
    convs: {},    // agent name -> conversation uuid
    baseline: {}, // agent name -> number of human messages seen by the last check()

    init(convs) {
      lib.convs = convs;
      lib.baseline = {};
      return `agentPulse v${VERSION}: ${Object.keys(convs).join(', ')}`;
    },

    // Map agent names to their most recently updated "<Agent> - <description>" conversation.
    async resolve(agents) {
      if (!org()) return 'ERROR: not logged in';
      const body = await api('/chat_conversations?limit=500');
      const out = {};
      for (const c of Array.isArray(body) ? body : (body.data || [])) {
        if (c.is_archived || !/ - /.test(c.name || '')) continue;
        const agent = c.name.split(' - ')[0].trim();
        if (!agents.includes(agent)) continue;
        if (!out[agent] || c.updated_at > out[agent].updated_at)
          out[agent] = { uuid: c.uuid, title: c.name, url: `https://claude.ai/chat/${c.uuid}`, updated_at: c.updated_at };
      }
      return out;
    },

    // Decide per conversation from claude.ai's stored data: SEND | SKIP: ... | ERROR: ...
    // Also records the baseline used by verify().
    async check(names = Object.keys(lib.convs)) {
      if (!org()) return 'ERROR: not logged in';
      const out = {};
      await Promise.all(names.map(async name => {
        try {
          const ms = await messages(lib.convs[name]);
          const last = ms[ms.length - 1];
          const lastH = [...ms].reverse().find(m => m.sender === 'human');
          const ageMin = lastH ? (Date.now() - Date.parse(lastH.created_at)) / 60000 : Infinity;
          lib.baseline[name] = ms.filter(m => m.sender === 'human').length;
          if (last && last.sender === 'human') out[name] = 'SKIP: awaiting reply';
          else if (lastH && tx(lastH).trim().toLowerCase() !== MESSAGE && ageMin < SKIP_IF_USER_ACTIVE_MIN)
            out[name] = `SKIP: user chatting ${ageMin.toFixed(1)}m ago`;
          else out[name] = 'SEND';
        } catch (e) {
          out[name] = 'ERROR: ' + e.message;
        }
      }));
      return out;
    },

    // Poll until each named conversation has a new stored human message equal to MESSAGE.
    // claude.ai stores it only once the reply completes, hence the polling. Returns SENT | NOT-SENT per name.
    async verify(names, timeoutMs = 120000) {
      const out = Object.fromEntries(names.map(n => [n, 'NOT-SENT']));
      const deadline = Date.now() + timeoutMs;
      let pending = names.filter(n => typeof lib.baseline[n] === 'number');
      for (const n of names) if (typeof lib.baseline[n] !== 'number') out[n] = 'ERROR: no baseline (run check first)';
      while (pending.length && Date.now() < deadline) {
        await Promise.all(pending.map(async name => {
          try {
            const hs = (await messages(lib.convs[name])).filter(m => m.sender === 'human');
            if (hs.length > lib.baseline[name] && tx(hs[hs.length - 1]).trim().toLowerCase() === MESSAGE) out[name] = 'SENT';
          } catch (e) { /* transient; keep polling */ }
        }));
        pending = pending.filter(n => out[n] !== 'SENT');
        if (pending.length) await sleep(3000);
      }
      return out;
    },
  };
  return lib;
})();
`agentPulse v${window.agentPulse.version} loaded`
