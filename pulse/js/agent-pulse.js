// agent-pulse controller library.
// Load this ONCE into the controller tab: a same-origin claude.ai page that ticks never reload.
// Ticks then only call short expressions such as `await agentPulse.scan([...])` and `await agentPulse.verify([...])`.
// It talks only to claude.ai's API, so one tab serves every conversation. The only thing it reads from an
// agent's reply is a trailing bare number, which sets that agent's pulse interval (see scan()). That holds for
// every reply, whether it answers a pulse or the user. Empty or absent replies are part of the agents' spec and
// change nothing.
// Bump VERSION whenever this file changes. Ticks reload the library when the loaded version differs.
window.agentPulse = (() => {
  const VERSION = 7;
  const MESSAGE = 'pulse'; // keep in sync with pulse/config.json "message"
  const SKIP_IF_USER_ACTIVE_MIN = 3; // the user chatting in a conversation holds its pulses until 3 quiet minutes
  const MIN_INTERVAL = 2, MAX_INTERVAL = 60; // keep in sync with pulse/config.json "intervals"

  const org = () => decodeURIComponent((document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1] || '');
  const tx = m => m.text || (m.content || []).map(c => c.text || '').join('') || '';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = async path => {
    const r = await fetch(`/api/organizations/${org()}${path}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`);
    return r.json();
  };
  const messages = async uuid => (await api(`/chat_conversations/${uuid}?tree=False&rendering_mode=messages`)).chat_messages || [];
  // An agent sets its own interval by ending a reply with a bare number: the last
  // whitespace-separated token must be digits only ("30", not "30m", "3.5" or "30.").
  // Clamped to MIN_INTERVAL..MAX_INTERVAL. Anything else returns null: keep the current interval.
  const parseInterval = text => {
    const last = String(text || '').trim().split(/\s+/).pop();
    return /^\d+$/.test(last) ? Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, parseInt(last, 10))) : null;
  };

  const lib = {
    version: VERSION,
    convs: {},    // agent name -> conversation uuid
    baseline: {}, // agent name -> number of human messages seen by the last check()
    latest: {},   // agent name -> { at, value } of the newest non-human message, seen by the last check()
    last: {},     // agent name -> { sender, at } of the newest message of any kind, seen by the last check()

    init(convs) {
      lib.convs = convs;
      lib.baseline = {};
      lib.latest = {};
      lib.last = {};
      return `agentPulse v${VERSION}: ${Object.keys(convs).join(', ')}`;
    },

    // Map agent names to their most recently updated "<Agent> - <description>" conversation
    // (or a conversation named exactly "<Agent>", with no description).
    async resolve(agents) {
      if (!org()) return 'ERROR: not logged in';
      const body = await api('/chat_conversations?limit=500');
      const out = {};
      for (const c of Array.isArray(body) ? body : (body.data || [])) {
        if (c.is_archived || !c.name) continue;
        const agent = c.name.split(' - ')[0].trim();
        if (!agents.includes(agent)) continue;
        if (!out[agent] || c.updated_at > out[agent].updated_at)
          out[agent] = { uuid: c.uuid, title: c.name, url: `https://claude.ai/chat/${c.uuid}`, updated_at: c.updated_at };
      }
      return out;
    },

    // Decide per conversation from claude.ai's stored data: SEND | SKIP: ... | ERROR: ...
    // Also records the baseline used by verify() and the newest reply's number used by scan().
    async check(names = Object.keys(lib.convs)) {
      if (!org()) return 'ERROR: not logged in';
      const out = {};
      await Promise.all(names.map(async name => {
        try {
          const ms = await messages(lib.convs[name]);
          const last = ms[ms.length - 1];
          const lastH = [...ms].reverse().find(m => m.sender === 'human');
          const lastA = [...ms].reverse().find(m => m.sender !== 'human');
          const ageMin = lastH ? (Date.now() - Date.parse(lastH.created_at)) / 60000 : Infinity;
          lib.baseline[name] = ms.filter(m => m.sender === 'human').length;
          lib.last[name] = last ? { sender: last.sender, at: last.created_at } : null;
          lib.latest[name] = lastA ? { at: lastA.created_at, value: parseInterval(tx(lastA)) } : null;
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

    // check() plus the newest reply of each agent:
    //   { status: {name: SEND|SKIP...|ERROR...}, numbers: {name: {at: ISO time of the reply, value: minutes|null} | null},
    //     last: {name: {sender, at} | null} }
    // `last` identifies the newest message, so the caller can tell whether the same message made it skip before:
    // "SKIP: awaiting reply" may skip one pulse per unanswered message, never two.
    // value is the clamped number the reply ends with, or null. The caller applies a number only when `at` is
    // newer than the last one it applied for that agent, so every reply counts once, pulse reply or not.
    async scan(names = Object.keys(lib.convs)) {
      const status = await lib.check(names);
      if (typeof status === 'string') return { status, numbers: {}, last: {} };
      return { status, numbers: Object.fromEntries(names.map(n => [n, lib.latest[n] || null])), last: Object.fromEntries(names.map(n => [n, lib.last[n] || null])) };
    },

    // Poll until each named conversation has a new stored human message equal to MESSAGE.
    // claude.ai stores it only once the reply completes, hence the polling. Returns SENT | NOT-SENT per name.
    async verify(names, timeoutMs = 40000) {
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
