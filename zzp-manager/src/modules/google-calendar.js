'use strict';

/**
 * google-calendar.js — Google Calendar API v3 with OAuth 2.0
 *
 * Handles:
 *  - OAuth 2.0 Desktop App flow (localhost redirect, code exchange)
 *  - Access token refresh via refresh_token
 *  - Listing / creating / updating / deleting events on the user's primary calendar
 *
 * Mirrors the pattern used in youtube-api.js — no external HTTP dependencies,
 * uses Node.js native https + http modules only.
 */

const https = require('https');
const http  = require('http');
const { URLSearchParams } = require('url');

const GOOGLE_AUTH_HOST  = 'accounts.google.com';
const GOOGLE_TOKEN_HOST = 'oauth2.googleapis.com';
const CALENDAR_HOST     = 'www.googleapis.com';
const REDIRECT_PORT     = 8086; // distinct from youtube-api.js's 8085 to avoid collisions
const REDIRECT_PATH     = '/oauth2callback';
const REDIRECT_URI      = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;
const OAUTH_TIMEOUT_MS  = 3 * 60 * 1000; // 3 minutes to complete browser auth

const SCOPES = ['https://www.googleapis.com/auth/calendar'].join(' ');

// ── Low-level HTTP helpers ─────────────────────────────────────────────────

function httpsRequest(method, hostname, path, headers = {}, bodyStr = null) {
  return new Promise((resolve, reject) => {
    const finalHeaders = { ...headers };
    if (bodyStr != null) {
      finalHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const options = { hostname, path, method, headers: finalHeaders };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // DELETE typically returns 204 No Content — no body to parse
        if (!data.trim()) { resolve({}); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const msg = typeof parsed.error === 'string'
              ? parsed.error
              : (parsed.error.message || parsed.error_description || JSON.stringify(parsed.error));
            reject(new Error(msg));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    if (bodyStr != null) req.write(bodyStr);
    req.end();
  });
}

function httpsGet(hostname, path, headers = {}) {
  return httpsRequest('GET', hostname, path, headers);
}

function httpsPost(hostname, path, bodyStr, extraHeaders = {}) {
  return httpsRequest('POST', hostname, path, {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...extraHeaders
  }, bodyStr);
}

function apiRequest(method, path, accessToken, bodyObj) {
  const bodyStr = bodyObj != null ? JSON.stringify(bodyObj) : null;
  const headers = { Authorization: 'Bearer ' + accessToken };
  if (bodyStr != null) headers['Content-Type'] = 'application/json';
  return httpsRequest(method, CALENDAR_HOST, path, headers, bodyStr);
}

// ── OAuth 2.0 Desktop App Flow ────────────────────────────────────────────

/**
 * Starts OAuth flow:
 *  1. Spins up a temporary local HTTP server
 *  2. Opens browser with Google consent URL
 *  3. Waits for redirect with authorization code
 *  4. Exchanges code for access_token + refresh_token
 *  Returns: { access_token, refresh_token, expires_in }
 */
async function startOAuthFlow(clientId, clientSecret) {
  const { shell } = require('electron');

  const state = Math.random().toString(36).slice(2);
  const authParams = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state
  });
  const authUrl = `https://${GOOGLE_AUTH_HOST}/o/oauth2/auth?${authParams.toString()}`;

  const code = await new Promise((resolve, reject) => {
    let server;
    const timeout = setTimeout(() => {
      server?.close();
      reject(new Error('Timeout — nie ukończono autoryzacji w ciągu 3 minut.'));
    }, OAUTH_TIMEOUT_MS);

    server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        const receivedCode  = reqUrl.searchParams.get('code');
        const receivedState = reqUrl.searchParams.get('state');
        const error         = reqUrl.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h2 style="font-family:sans-serif;color:#c00">Błąd autoryzacji: ' + error + '</h2><p>Możesz zamknąć tę kartę.</p>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('Odmowa dostępu: ' + error));
          return;
        }

        if (receivedCode && receivedState === state) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><head><title>ZZP Manager</title></head>
            <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#e6edf3">
              <div style="text-align:center">
                <div style="font-size:48px">✅</div>
                <h2>Połączono z Google Calendar!</h2>
                <p style="color:#8b949e">Możesz zamknąć tę kartę i wrócić do aplikacji.</p>
              </div>
            </body></html>
          `);
          clearTimeout(timeout);
          server.close();
          resolve(receivedCode);
        }
      } catch (e) {
        // ignore malformed requests to the local server
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error('Nie można uruchomić lokalnego serwera (port ' + REDIRECT_PORT + '): ' + err.message));
    });

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      shell.openExternal(authUrl);
    });
  });

  const tokenBody = new URLSearchParams({
    code,
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  REDIRECT_URI,
    grant_type:    'authorization_code'
  }).toString();

  const tokenResponse = await httpsPost(GOOGLE_TOKEN_HOST, '/token', tokenBody);

  if (tokenResponse.error) {
    throw new Error('Token exchange failed: ' + (tokenResponse.error_description || tokenResponse.error));
  }
  if (!tokenResponse.refresh_token) {
    throw new Error('Brak refresh_token w odpowiedzi. Upewnij się że prompt=consent i access_type=offline są ustawione.');
  }

  return {
    access_token:  tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_in:    tokenResponse.expires_in
  };
}

// ── Token Refresh ─────────────────────────────────────────────────────────

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token'
  }).toString();

  const response = await httpsPost(GOOGLE_TOKEN_HOST, '/token', body);

  if (response.error) {
    throw new Error('Token refresh failed: ' + (response.error_description || response.error));
  }

  return {
    access_token: response.access_token,
    expires_in:   response.expires_in
  };
}

// ── Calendar API ───────────────────────────────────────────────────────────

/**
 * Lists events on the user's primary calendar within [timeMin, timeMax] (ISO strings).
 * Returns an array of simplified event objects.
 */
async function listEvents(accessToken, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  });
  const data = await apiRequest('GET', `/calendar/v3/calendars/primary/events?${params.toString()}`, accessToken);
  return (data.items || []).map(_mapEvent);
}

/**
 * Creates a new event on the primary calendar.
 * eventData: { title, description, start, end, allDay }
 *   start/end: ISO datetime strings (or YYYY-MM-DD if allDay)
 */
async function createEvent(accessToken, eventData) {
  const body = _toGoogleEvent(eventData);
  const data = await apiRequest('POST', '/calendar/v3/calendars/primary/events', accessToken, body);
  return _mapEvent(data);
}

async function updateEvent(accessToken, eventId, eventData) {
  const body = _toGoogleEvent(eventData);
  const data = await apiRequest('PATCH', `/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, accessToken, body);
  return _mapEvent(data);
}

async function deleteEvent(accessToken, eventId) {
  await apiRequest('DELETE', `/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, accessToken);
  return { success: true };
}

function _toGoogleEvent(eventData) {
  const body = {
    summary: eventData.title || '(bez tytułu)',
    description: eventData.description || ''
  };
  if (eventData.allDay) {
    body.start = { date: eventData.start };
    body.end   = { date: eventData.end || eventData.start };
  } else {
    body.start = { dateTime: eventData.start };
    body.end   = { dateTime: eventData.end || eventData.start };
  }
  return body;
}

function _mapEvent(ev) {
  const allDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
  return {
    id:          ev.id,
    title:       ev.summary || '(bez tytułu)',
    description: ev.description || '',
    start:       ev.start ? (ev.start.dateTime || ev.start.date) : null,
    end:         ev.end   ? (ev.end.dateTime   || ev.end.date)   : null,
    allDay,
    htmlLink:    ev.htmlLink || null
  };
}

module.exports = {
  startOAuthFlow,
  refreshAccessToken,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent
};
