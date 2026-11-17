'use client';
import { useEffect, useState, type FormEvent } from 'react';

type User = { id: string; email: string };
type OrgMembership = { role: string; organization: { id: string; name: string } };
type Member = { userId: string; role: string; user: { email: string } };
type Invite = { id: string; email: string; role: string; expiresAt: string };
type Resource = { id: string; title: string };

async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch('/api' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = Array.isArray(error.message) ? error.message.join(', ') : error.message;
    throw new Error(message || 'Request failed');
  }
  return response.json();
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login'|'register'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [selected, setSelected] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [orgName, setOrgName] = useState(''), [resourceTitle, setResourceTitle] = useState('');
  const [inviteEmail, setInviteEmail] = useState(''), [inviteRole, setInviteRole] = useState('MEMBER');
  const [link, setLink] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = orgs.find(o => o.organization.id === selected);
  const role = current?.role || '';
  const isManager = role === 'OWNER' || role === 'ADMIN';

  async function refreshOrgs(preferred?: string) {
    const data = await api<OrgMembership[]>('/organizations');
    setOrgs(data);
    setSelected(prev => {
      const choice = preferred || prev;
      return data.some(x => x.organization.id === choice) ? choice : (data[0]?.organization.id || '');
    });
  }
  async function refreshDetail(id: string, manager: boolean) {
    const [m, r] = await Promise.all([
      api<Member[]>('/organizations/' + id + '/members'),
      api<Resource[]>('/organizations/' + id + '/resources'),
    ]);
    setMembers(m); setResources(r);
    setInvites(manager ? await api<Invite[]>('/organizations/' + id + '/invitations') : []);
  }
  useEffect(() => {
    api<User>('/auth/me').then(u => { setUser(u); return refreshOrgs(); })
      .catch(() => {}).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (selected && user) refreshDetail(selected, isManager).catch(e => setError(e.message));
    else { setMembers([]); setInvites([]); setResources([]); }
  }, [selected, user?.id, isManager]);

  async function execute(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  function onAuth(event: FormEvent) {
    event.preventDefault();
    void execute(async () => {
      const u = await api<User>('/auth/' + authMode, 'POST', { email, password });
      setUser(u); setPassword(''); await refreshOrgs();
    });
  }
  function createOrg(event: FormEvent) {
    event.preventDefault();
    void execute(async () => {
      const o = await api<{id:string}>('/organizations', 'POST', { name: orgName });
      setOrgName(''); await refreshOrgs(o.id); setMessage('Organization created');
    });
  }
  function addResource(event: FormEvent) {
    event.preventDefault();
    void execute(async () => {
      await api('/organizations/' + selected + '/resources', 'POST', { title: resourceTitle });
      setResourceTitle(''); await refreshDetail(selected, isManager); setMessage('Item added');
    });
  }
  function invite(event: FormEvent) {
    event.preventDefault();
    void execute(async () => {
      const result = await api<{link:string}>('/organizations/' + selected + '/invitations', 'POST',
        { email: inviteEmail, role: inviteRole });
      setLink(result.link); setInviteEmail(''); await refreshDetail(selected, isManager);
      setMessage('Invitation created. Share this link privately with the recipient.');
    });
  }
  async function acceptInvite() {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    await execute(async () => {
      const result = await api<{organizationId:string}>('/invitations/accept','POST',{token});
      window.history.replaceState({}, '', '/');
      await refreshOrgs(result.organizationId);
      setMessage('Invitation accepted');
    });
  }
  if (!ready) return <main className="shell"><p>Loading...</p></main>;
  return <main className="shell">
    <header><div className="brand"><span className="mark">T</span><div><strong>TenantKit</strong><small>Multi-tenant RBAC starter</small></div></div>
      {user && <div className="identity"><span>{user.email}</span><button className="subtle" disabled={busy}
        onClick={() => void execute(async () => { await api('/auth/logout','POST'); setUser(null); setOrgs([]); setSelected(''); setLink(''); })}>Sign out</button></div>}
    </header>
    {error && <div role="alert" className="alert error">{error}</div>}
    {message && <div role="status" className="alert success">{message}</div>}
    {!user ? <section className="auth card"><h1>{authMode === 'login' ? 'Sign in' : 'Create an account'}</h1>
      <p>Manage organizations, members, and permissions.</p>
      <form onSubmit={onAuth}><label>Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" required minLength={12} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="primary" disabled={busy}>{authMode === 'login' ? 'Sign in' : 'Register'}</button></form>
      <button className="textbutton" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
        {authMode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}</button>
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('token') && <p className="hint">Sign in with the invited email to accept the invitation.</p>}
    </section> : <div className="workspace">
      <aside className="card sidebar"><h2>Organizations</h2>
        <nav aria-label="Organizations">{orgs.map(o => <button key={o.organization.id} className={selected === o.organization.id ? 'org active' : 'org'} onClick={() => { setSelected(o.organization.id); setLink(''); }}>
          <span>{o.organization.name}</span><small>{o.role.toLowerCase()}</small></button>)}</nav>
        <form onSubmit={createOrg} className="createform"><label>New organization<input required minLength={2} maxLength={80} value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Organization name" /></label><button disabled={busy}>Create</button></form>
      </aside>
      <div className="content">
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('token') && <section className="card inviteBanner"><strong>You've been invited to an organization.</strong><button className="primary" disabled={busy} onClick={() => void acceptInvite()}>Accept invitation</button></section>}
        {!current ? <section className="card empty"><h1>No organization yet</h1><p>Create an organization to get started.</p></section> : <>
          <div className="heading"><div><h1>{current.organization.name}</h1><p>Organization workspace · {role.toLowerCase()}</p></div></div>
          <section className="card"><div className="sectionTitle"><div><h2>Shared items</h2><p>Example tenant-isolated data</p></div></div>
            <form className="inlineform" onSubmit={addResource}><input aria-label="Item title" placeholder="New item" required maxLength={160} value={resourceTitle} onChange={e => setResourceTitle(e.target.value)} /><button disabled={busy}>Add item</button></form>
            <div className="lines">{resources.length ? resources.map(r => <div className="line" key={r.id}><span>{r.title}</span><button className="textbutton danger" disabled={busy} onClick={() => void execute(async () => { await api('/organizations/' + selected + '/resources/' + r.id,'DELETE'); await refreshDetail(selected,isManager); })}>Remove</button></div>) : <p className="hint">No items yet.</p>}</div>
          </section>
          <section className="card"><div className="sectionTitle"><div><h2>Members</h2><p>{members.length} member{members.length !== 1 ? 's' : ''}</p></div></div>
            <div className="lines">{members.map(m => <div className="line" key={m.userId}><div><strong>{m.user.email}</strong><small className="roleLabel">{m.role.toLowerCase()}</small></div>
              {isManager && m.role !== 'OWNER' && (role === 'OWNER' || m.role === 'MEMBER') && <div className="actions">
                {role === 'OWNER' && <select aria-label={'Role for ' + m.user.email} value={m.role} disabled={busy} onChange={e => void execute(async () => {
                  await api('/organizations/' + selected + '/members/' + m.userId,'PATCH',{role:e.target.value}); await refreshDetail(selected,isManager);
                })}><option value="ADMIN">Admin</option><option value="MEMBER">Member</option></select>}
                <button className="textbutton danger" disabled={busy} onClick={() => { if (window.confirm('Remove this member?')) void execute(async () => {
                  await api('/organizations/' + selected + '/members/' + m.userId,'DELETE'); await refreshDetail(selected,isManager);
                }); }}>Remove</button></div>}
              {!isManager && m.userId === user.id && m.role !== 'OWNER' && <button className="textbutton" disabled={busy} onClick={() => void execute(async () => {
                await api('/organizations/' + selected + '/members/' + m.userId,'DELETE'); await refreshOrgs();
              })}>Leave</button>}</div>)}</div>
          </section>
          {isManager && <section className="card"><h2>Invitations</h2><p>Generate a private invitation link. Expires in 7 days.</p>
            <form className="inviteform" onSubmit={invite}><label>Email<input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@example.com" /></label>
              <label>Role<select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                <option value="MEMBER">Member</option>{role === 'OWNER' && <option value="ADMIN">Admin</option>}</select></label>
              <button className="primary" disabled={busy}>Create invitation</button></form>
            {link && <div className="linkbox"><input aria-label="Invitation link" value={link} readOnly onFocus={e => e.target.select()} /><button onClick={() => void navigator.clipboard.writeText(link)}>Copy</button></div>}
            <div className="lines">{invites.map(i => <div className="line" key={i.id}><span>{i.email} <small>· {i.role.toLowerCase()} · expires {new Date(i.expiresAt).toLocaleDateString()}</small></span>
              <button className="textbutton danger" disabled={busy} onClick={() => void execute(async () => { await api('/organizations/' + selected + '/invitations/' + i.id,'DELETE'); await refreshDetail(selected,isManager); })}>Revoke</button></div>)}</div>
          </section>}
          {role === 'OWNER' && <section className="card dangerzone"><h2>Delete organization</h2><p>Deletes members, invitations, and shared items permanently.</p>
            <button className="dangerButton" disabled={busy} onClick={() => { if (window.confirm('Permanently delete ' + current.organization.name + '?')) void execute(async () => {
              await api('/organizations/' + selected,'DELETE'); await refreshOrgs(); setMessage('Organization deleted');
            }); }}>Delete organization</button></section>}
        </>}
      </div>
    </div>}
  </main>;
}
