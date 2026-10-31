// Renew an existing signed-in T3 Connect session. This never links a machine or
// signs a user in, and never changes T3 Code's own token cache or catalog.
const fs = require('node:fs');
const path = require('node:path');
const { descriptor, originOf } = require('./remote-rpc.cjs');
async function json(url, options) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('T3 Connect could not renew the current session.');
  return response.json();
}
async function renew({ home, safeStorage, record, proof, thumbprint }) {
  const saved = JSON.parse(fs.readFileSync(path.join(home, 'userdata', 'clerk-tokens.json'), 'utf8'));
  const encrypted = saved.__clerk_client_jwt;
  if (typeof encrypted !== 'string' || !encrypted.startsWith('enc:')) throw new Error('No signed-in T3 Connect session.');
  const clientToken = safeStorage.decryptString(Buffer.from(encrypted.slice(4), 'base64'));
  const publishableKey = process.env.T3CODE_CLERK_PUBLISHABLE_KEY || 'pk_live_Y2xlcmsudDMuY29kZXMk';
  const host = Buffer.from(publishableKey.split('_').slice(2).join('_'), 'base64').toString().replace(/\$$/, '');
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('Invalid T3 Connect account endpoint.');
  const clerk = 'https://' + host;
  const query = '?_is_native=1&_electron_sdk_version=0.1.3&__clerk_api_version=2026-08-20&_clerk_js_version=6.40.0';
  const headers = { authorization: 'Bearer ' + clientToken };
  const client = await json(clerk + '/v1/client' + query, { headers });
  const data = client.response || client;
  const session = (data.sessions || []).find((s) => s.id === data.last_active_session_id && s.status === 'active') || (data.sessions || []).find((s) => s.status === 'active');
  if (!session) throw new Error('No active T3 Connect session.');
  const accountId = session.user?.id || session.user_id;
  if (record.dpop?.accountId && accountId !== record.dpop.accountId) throw new Error('The T3 Connect account changed.');
  const result = await json(clerk + '/v1/client/sessions/' + encodeURIComponent(session.id) + '/tokens/t3-relay' + query, { method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams() });
  const clerkToken = (result.response || result).jwt;
  if (!clerkToken) throw new Error('T3 Connect did not authorize the current account.');
  const relay = originOf(process.env.T3CODE_RELAY_URL || 'https://relay.t3.codes');
  if (!relay.startsWith('https:')) throw new Error('T3 Connect requires HTTPS.');
  const tokenUrl = relay + '/v1/client/dpop-token';
  const grant = 'urn:ietf:params:oauth:grant-type:token-exchange', accessType = 'urn:ietf:params:oauth:token-type:access_token';
  const token = await json(tokenUrl, { method: 'POST', headers: { dpop: await proof('POST', tokenUrl), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: grant, subject_token: clerkToken, subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', requested_token_type: accessType, resource: relay, scope: 'environment:connect', client_id: 't3-web' }) });
  const connectUrl = relay + '/v1/environments/' + encodeURIComponent(record.id) + '/connect';
  const bootstrap = await json(connectUrl, { method: 'POST', headers: { authorization: 'DPoP ' + token.access_token, dpop: await proof('POST', connectUrl, token.access_token), 'content-type': 'application/json' }, body: JSON.stringify({ clientProofKeyThumbprint: thumbprint }) });
  if (bootstrap.environmentId !== record.id) throw new Error('The machine identity changed.');
  const origin = originOf(bootstrap.endpoint.httpBaseUrl), info = await descriptor(origin);
  if (info.environmentId !== record.id) throw new Error('The machine identity changed.');
  const exchangeUrl = origin + '/oauth/token';
  const access = await json(exchangeUrl, { method: 'POST', headers: { dpop: await proof('POST', exchangeUrl), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: grant, subject_token: bootstrap.credential, subject_token_type: 'urn:t3:params:oauth:token-type:environment-bootstrap', requested_token_type: accessType, client_surface: 'desktop', client_os: process.platform }) });
  return { environmentId: record.id, accountId, label: info.label, endpoint: bootstrap.endpoint, accessToken: access.access_token, expiresAtEpochMs: Date.now() + access.expires_in * 1000, dpopThumbprint: thumbprint };
}
module.exports = { renew };
