'use strict';

/**
 * youtube-api.js — YouTube Analytics API v2 with OAuth 2.0
 *
 * Handles:
 *  - OAuth 2.0 Desktop App flow (localhost redirect, code exchange)
 *  - Access token refresh via refresh_token
 *  - Fetching daily analytics from YouTube Analytics API
 *  - Syncing data into local DB via youtube.addStats()
 *
 * No external HTTP dependencies — uses Node.js native https + http modules.
 */

const https = require('https');
const http  = require('http');
const { URLSearchParams } = require('url');

const GOOGLE_AUTH_HOST   = 'accounts.google.com';
const GOOGLE_TOKEN_HOST  = 'oauth2.googleapis.com';
const YT_ANALYTICS_HOST  = 'youtubeanalytics.googleapis.com';
const REDIRECT_PORT      = 8085;
const REDIRECT_PATH      = '/oauth2callback';
const REDIRECT_URI       = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;
const OAUTH_TIMEOUT_MS   = 3 * 60 * 1000; // 3 minutes to complete browser auth

const SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly'
].join(' ');

const ANALYTICS_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
  'estimatedRevenue',
  'rpm',
  'cpm',
  'impressionClickThroughRate'
].join(',');

// ── Low-level HTTP helpers ─────────────────────────────────────────────────

function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'GET', headers };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(hostname, path, bodyStr, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...extraHeaders
    };
    const options = { hostname, path, method: 'POST', headers };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
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
async function startOAuthFlow(clientId, clientSecret, win) {
  const { shell } = require('electron');

  // Build auth URL
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

  // Start local callback server
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
                <h2>Połączono z YouTube!</h2>
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

  // Exchange code for tokens
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

/**
 * Gets a fresh access_token using the stored refresh_token.
 * Returns: { access_token, expires_in }
 */
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

// ── YouTube Analytics API ─────────────────────────────────────────────────

/**
 * Fetches daily analytics data from YouTube Analytics API v2.
 * Returns an array of day records mapped to youtube_stats columns.
 */
async function fetchAnalytics(accessToken, startDate, endDate) {
  const params = new URLSearchParams({
    ids:        'channel==MINE',
    startDate,
    endDate,
    metrics:    ANALYTICS_METRICS,
    dimensions: 'day',
    sort:       'day'
  });

  const path = '/v2/reports?' + params.toString();
  const data = await httpsGet(
    YT_ANALYTICS_HOST,
    path,
    { Authorization: 'Bearer ' + accessToken }
  );

  if (!data.rows || data.rows.length === 0) return [];

  // Map column headers to indices
  const colIndex = {};
  (data.columnHeaders || []).forEach((col, i) => {
    colIndex[col.name] = i;
  });

  return data.rows.map(row => ({
    date:                row[colIndex['day']],
    views:               Math.round(row[colIndex['views']] || 0),
    watch_time_hours:    Math.round(((row[colIndex['estimatedMinutesWatched']] || 0) / 60) * 100) / 100,
    subscribers_gained:  Math.round(row[colIndex['subscribersGained']] || 0),
    subscribers_lost:    Math.round(row[colIndex['subscribersLost']] || 0),
    estimated_revenue:   Math.round((row[colIndex['estimatedRevenue']] || 0) * 100) / 100,
    rpm:                 Math.round((row[colIndex['rpm']] || 0) * 100) / 100,
    cpm:                 Math.round((row[colIndex['cpm']] || 0) * 100) / 100,
    ctr:                 Math.round((row[colIndex['impressionClickThroughRate']] || 0) * 10000) / 10000,
    currency:            'EUR'
  }));
}

// ── Sync Orchestration ────────────────────────────────────────────────────

/**
 * Full sync orchestration:
 *  1. Refresh access token
 *  2. Determine date range
 *  3. Fetch analytics
 *  4. Save to DB via youtube.addStats()
 * Returns: { rowsSynced, dateFrom, dateTo }
 */
async function syncStats(year, clientId, clientSecret, refreshToken) {
  const settings = require('./settings');
  const youtube  = require('./youtube');

  // 1. Get fresh access token
  const { access_token } = await refreshAccessToken(clientId, clientSecret, refreshToken);

  // 2. Determine date range
  const today        = new Date();
  const currentYear  = today.getFullYear();
  const isCurrentYear = (year === currentYear);

  let startDate, endDate;

  if (isCurrentYear) {
    const lastSyncTs = parseInt(settings.get('yt_last_sync') || '0');
    if (lastSyncTs > 0) {
      // Fetch last 30 days (to catch revenue finalization corrections)
      const from = new Date(Math.min(lastSyncTs - 7 * 86400 * 1000, today.getTime() - 30 * 86400 * 1000));
      // But not before Jan 1 of current year
      const jan1 = new Date(currentYear, 0, 1);
      const effectiveFrom = from < jan1 ? jan1 : from;
      startDate = effectiveFrom.toISOString().slice(0, 10);
    } else {
      // First sync of current year — fetch full year
      startDate = `${year}-01-01`;
    }
    endDate = today.toISOString().slice(0, 10);
  } else {
    // Past year — always fetch full year
    startDate = `${year}-01-01`;
    endDate   = `${year}-12-31`;
  }

  // 3. Fetch analytics
  const rows = await fetchAnalytics(access_token, startDate, endDate);

  // 4. Save each day to DB
  for (const row of rows) {
    await youtube.addStats(row);
  }

  // Mark first sync done (for current year)
  if (isCurrentYear) {
    settings.set('yt_first_sync_done', 'true');
  }

  return {
    rowsSynced: rows.length,
    dateFrom:   startDate,
    dateTo:     endDate
  };
}

module.exports = { startOAuthFlow, refreshAccessToken, fetchAnalytics, syncStats };
