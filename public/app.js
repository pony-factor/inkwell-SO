const byId = (id) => document.getElementById(id);
const ids = ['dialect', 'sensitivity', 'customWords', 'extraInstructions', 'githubReplyMode'];
let authenticated = false;
const message = (text, error = false) => {
  const notice = byId('notice');
  notice.textContent = text;
  notice.classList.toggle('error', error);
};
const request = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', 'X-Inkwell-Request': '1' },
    credentials: 'same-origin', ...options
  });
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
  return body;
};
function requireLogin(enabled) {
  authenticated = enabled;
  byId('check').disabled = !enabled;
  byId('save').disabled = !enabled;
  for (const id of ids) byId(id).disabled = !enabled;
}
async function init() {
  try {
    const me = await request('/api/me');
    byId('account').textContent = me.signedIn ? me.login : 'Not signed in';
    byId('login').hidden = me.local || me.signedIn;
    byId('logout').hidden = me.local || !me.signedIn;
    requireLogin(me.signedIn);
    if (!me.signedIn) { message('Sign in with GitHub to save your preferences and proofread.', true); return; }
    const prefs = await request('/api/preferences');
    byId('dialect').value = prefs.dialect;
    byId('sensitivity').value = prefs.sensitivity;
    byId('customWords').value = prefs.customWords.join('\n');
    byId('extraInstructions').value = prefs.extraInstructions;
    byId('githubReplyMode').value = prefs.githubReplyMode;
    message(me.local ? 'Local mode · preferences stay on this machine.' : 'Your settings are ready.');
  } catch (error) { requireLogin(false); message(error.message, true); }
}
byId('input').addEventListener('input', () => {
  byId('count').textContent = `${byId('input').value.length.toLocaleString()} / 12,000`;
});
byId('save').addEventListener('click', async () => {
  if (!authenticated) return;
  const prefs = {
    dialect: byId('dialect').value,
    sensitivity: byId('sensitivity').value,
    customWords: byId('customWords').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean),
    extraInstructions: byId('extraInstructions').value,
    githubReplyMode: byId('githubReplyMode').value
  };
  try {
    await request('/api/preferences', { method: 'POST', body: JSON.stringify(prefs) });
    message('Preferences saved. GitHub comments from your account will use them too.');
  } catch (error) { message(error.message, true); }
});
byId('check').addEventListener('click', async () => {
  if (!authenticated) return;
  byId('check').disabled = true;
  byId('result').textContent = 'Checking…';
  try {
    const response = await request('/api/spellcheck', {
      method: 'POST', body: JSON.stringify({ text: byId('input').value })
    });
    byId('output').value = response.corrected;
    byId('copy').disabled = false;
    byId('result').textContent = response.rejected
      ? 'Protected formatting changed; original returned safely.'
      : response.changed ? 'Spelling corrected.' : 'No clear spelling changes.';
    message('Complete.');
  } catch (error) { byId('result').textContent = ''; message(error.message, true); }
  finally { byId('check').disabled = false; }
});
byId('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(byId('output').value); byId('result').textContent = 'Copied!'; }
  catch { message('Clipboard permission was denied.', true); }
});
byId('logout').addEventListener('click', async () => {
  try { await request('/logout', { method: 'POST' }); location.reload(); }
  catch (error) { message(error.message, true); }
});
init();
