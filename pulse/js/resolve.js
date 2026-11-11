// agent-pulse: list claude.ai conversations named "<Agent> - <description>".
// Run with Claude in Chrome's javascript_tool in any logged-in claude.ai tab.
// Returns [{agent, title, url, updated_at}]; pick the most recently updated per agent.
await (async () => {
  const org = decodeURIComponent((document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1] || '');
  if (!org) return 'ERROR: not logged in (no lastActiveOrg cookie)';
  const res = await fetch(`/api/organizations/${org}/chat_conversations?limit=500`, { credentials: 'include' });
  if (!res.ok) return 'ERROR: conversation list fetch ' + res.status;
  const body = await res.json();
  const list = Array.isArray(body) ? body : (body.data || []);
  return list
    .filter(c => !c.is_archived && / - /.test(c.name || ''))
    .map(c => ({
      agent: c.name.split(' - ')[0].trim(),
      title: c.name,
      url: `https://claude.ai/chat/${c.uuid}`,
      updated_at: c.updated_at,
    }));
})()
