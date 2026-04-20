// spotify.js — Spotify OAuth (redirect flow) + Web Playback SDK controller
// Imported by app.js as an ES module.

const CLIENT_ID    = 'da61dc149839439299554f1dc4455f1b';
const REDIRECT_URI = 'https://mybeachtrivia.com/spAuth';
const TOKEN_FN_URL =
  'https://us-central1-beach-trivia-website.cloudfunctions.net/spotifyTokenExchange';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

// ─── Token Storage ────────────────────────────────────────────────────────────

export function saveTokens({ accessToken, refreshToken, expiresIn }) {
  const expiresAt = Date.now() + expiresIn * 1000 - 60_000; // 1-min buffer
  sessionStorage.setItem(
    'sp:tokens',
    JSON.stringify({ accessToken, refreshToken, expiresAt })
  );
}

export function getStoredTokens() {
  try {
    const raw = sessionStorage.getItem('sp:tokens');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSpotifySession() {
  sessionStorage.removeItem('sp:tokens');
  localStorage.removeItem('sp:state');
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Refresh failed ${res.status}: ${body?.error || 'unknown'}`);
  }
  const data = await res.json();
  const newRefreshToken = data.refresh_token || refreshToken;
  saveTokens({
    accessToken: data.access_token,
    refreshToken: newRefreshToken,
    expiresIn: data.expires_in || 3600,
  });
  return data.access_token;
}

/**
 * Returns a valid access token; auto-refreshes if expired.
 * Throws if not connected or if refresh fails.
 */
export async function getValidToken() {
  const tokens = getStoredTokens();
  if (!tokens) throw new Error('Not connected to Spotify');

  if (Date.now() < tokens.expiresAt) return tokens.accessToken;

  // Expired — try refresh
  if (!tokens.refreshToken) {
    clearSpotifySession();
    throw new Error('Spotify session expired. Please reconnect.');
  }

  try {
    return await refreshAccessToken(tokens.refreshToken);
  } catch (e) {
    clearSpotifySession();
    throw new Error('Could not refresh Spotify token. Please reconnect.');
  }
}

// ─── OAuth Initiation (redirect flow) ────────────────────────────────────────

export function initiateSpotifyAuth() {
  const state = crypto.randomUUID();
  localStorage.setItem('sp:state', state);
  // Save current page URL so spAuth.html can return here (preserves ?companion=1 etc.)
  localStorage.setItem('sp:returnUrl', location.href);

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    redirect_uri:  REDIRECT_URI,
    state,
    scope:         SCOPES,
    show_dialog:   'false',
  });

  window.location.assign(
    'https://accounts.spotify.com/authorize?' + params.toString()
  );
}

// ─── Spotify API Helper ───────────────────────────────────────────────────────

export async function spotifyApi(path, options = {}) {
  const token = await getValidToken();
  const res = await fetch('https://api.spotify.com/v1' + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Spotify API ${res.status}`);
  return json;
}

export async function getSpotifyUser() {
  return spotifyApi('/me');
}

// ─── SDK Loader ───────────────────────────────────────────────────────────────

function loadSpotifySDK() {
  return new Promise((resolve, reject) => {
    if (window.Spotify) { resolve(); return; }

    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (typeof prev === 'function') prev();
      resolve();
    };

    if (!document.querySelector('script[src*="sdk.scdn.co"]')) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load Spotify SDK'));
      document.head.appendChild(script);
    }
  });
}

// ─── SpotifyController ────────────────────────────────────────────────────────

export class SpotifyController {
  constructor() {
    this.player   = null;
    this.deviceId = null;
    this.state    = null;

    // Public callbacks — assign before calling init()
    this.onReady       = null; // (deviceId: string) => void
    this.onStateChange = null; // (state | null) => void
    this.onError       = null; // (message: string) => void
  }

  async init(getToken) {
    this._getToken = getToken;

    await loadSpotifySDK();

    this.player = new window.Spotify.Player({
      name: 'Music Bingo Host',
      getOAuthToken: async (cb) => {
        try {
          cb(await this._getToken());
        } catch (e) {
          console.error('[SpotifyController] getOAuthToken failed:', e);
          this.onError?.('Token error — try reconnecting Spotify.');
        }
      },
      volume: 0.8,
    });

    this.player.addListener('ready', ({ device_id }) => {
      console.log('[SpotifyController] ready, device:', device_id);
      this.deviceId = device_id;
      this.onReady?.(device_id);
    });

    this.player.addListener('not_ready', ({ device_id }) => {
      console.warn('[SpotifyController] device offline:', device_id);
      this.onError?.('Spotify device went offline. Try refreshing the page.');
    });

    this.player.addListener('player_state_changed', (state) => {
      this.state = state;
      this.onStateChange?.(state);
    });

    this.player.addListener('initialization_error', ({ message }) => {
      console.error('[SpotifyController] init error:', message);
      this.onError?.('Initialization error: ' + message);
    });

    this.player.addListener('authentication_error', ({ message }) => {
      console.error('[SpotifyController] auth error:', message);
      clearSpotifySession();
      this.onError?.('Spotify authentication failed — please reconnect.');
    });

    this.player.addListener('account_error', ({ message }) => {
      console.error('[SpotifyController] account error:', message);
      this.onError?.('Spotify Premium is required for in-browser playback.');
    });

    const connected = await this.player.connect();
    if (!connected) throw new Error('Spotify player failed to connect.');
    return this;
  }

  togglePlay()     { return this.player?.togglePlay(); }
  nextTrack()      { return this.player?.nextTrack(); }
  previousTrack()  { return this.player?.previousTrack(); }
  getCurrentState(){ return this.player?.getCurrentState(); }

  setVolume(pct) {
    // pct: 0–100
    return this.player?.setVolume(Math.max(0, Math.min(1, pct / 100)));
  }

  seek(positionMs) {
    return this.player?.seek(positionMs);
  }

  /** Play a specific Spotify URI (track/episode) on this device.
   *  Retries up to 3 times on 404 "Device not found" — the SDK fires
   *  `ready` before Spotify's backend finishes registering the device. */
  async playUri(uri, positionMs = 0) {
    const MAX_ATTEMPTS = 4;
    const BASE_DELAY_MS = 1200;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const token = await this._getToken();
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
        }
      );

      if (res.status === 204 || res.ok) return; // success

      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `playUri failed: ${res.status}`;

      // Retry on 404 (device not yet registered server-side)
      if (res.status === 404 && attempt < MAX_ATTEMPTS - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 1.2 s, 2.4 s, 4.8 s
        console.warn(`[SpotifyController] playUri 404, retrying in ${delay}ms… (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error(msg);
    }
  }

  disconnect() {
    this.player?.disconnect();
    this.player   = null;
    this.deviceId = null;
    this.state    = null;
  }
}

// ─── SpotifyCompanionController ───────────────────────────────────────────────
// REST-API-only controller for companion/phone mode.
// No SDK player is created — all commands target the currently active device.

export class SpotifyCompanionController {
  constructor() {
    this.deviceId  = null; // populated from /me/player polling
    this.state     = null;
    this._getToken = null;
    this._pollTimer     = null;
    this._lastPollTime  = null;

    this.onReady       = null;
    this.onStateChange = null;
    this.onError       = null;
  }

  async init(getToken) {
    this._getToken = getToken;
    // Fire onReady immediately — no SDK player needed
    this.onReady?.(null);
    this._startPolling();
  }

  _startPolling() {
    this._stopPolling();
    this._pollState(); // immediate first poll
    this._pollTimer = setInterval(() => this._pollState(), 1500);
  }

  _stopPolling() {
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  }

  async _pollState() {
    try {
      const token = await this._getToken();
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 204 || !res.ok) return; // no active device / error
      const data = await res.json();
      this.deviceId = data?.device?.id || this.deviceId || null;
      this.state = this._toSdkState(data);
      this._lastPollTime = Date.now();
      this.onStateChange?.(this.state);
    } catch (_) { /* ignore poll errors */ }
  }

  // Convert Spotify REST state → SDK-compatible shape expected by updateSpotifyState
  _toSdkState(data) {
    const item = data?.item;
    return {
      paused:   !data.is_playing,
      position: data.progress_ms ?? 0,
      duration: item?.duration_ms ?? 0,
      track_window: item ? {
        current_track: {
          name:    item.name,
          uri:     item.uri,
          artists: item.artists ?? [],
        },
      } : null,
    };
  }

  // Force an immediate REST poll (called by maybeApplyRandomStartToCurrentTrack)
  async refreshState() {
    await this._pollState();
  }

  // Interpolate position between polls for smooth seek bar
  async getCurrentState() {
    if (!this.state) return null;
    if (this.state.paused || !this._lastPollTime) return this.state;
    const elapsed = Date.now() - this._lastPollTime;
    return {
      ...this.state,
      position: Math.min(this.state.position + elapsed, this.state.duration),
    };
  }

  async play() { await this._call('/me/player/play', 'PUT', {}); }
  async pause() { await this._call('/me/player/pause', 'PUT'); }

  async playUri(uri, positionMs = 0) {
    await this._call('/me/player/play', 'PUT', {
      uris: [uri],
      position_ms: positionMs,
    });
  }

  async togglePlay() {
    const paused = this.state?.paused ?? true;
    if (paused) await this.play();
    else await this.pause();
  }

  async nextTrack()     { await this._call('/me/player/next',     'POST'); }
  async previousTrack() { await this._call('/me/player/previous', 'POST'); }

  async seek(positionMs) {
    await this._call('/me/player/seek?position_ms=' + Math.round(positionMs), 'PUT');
  }

  setVolume(pct) {
    const vol = Math.max(0, Math.min(100, Math.round(pct)));
    return this._call('/me/player/volume?volume_percent=' + vol, 'PUT');
  }

  _withDevice(path) {
    if (!this.deviceId) return path;
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}device_id=${encodeURIComponent(this.deviceId)}`;
  }

  async _call(path, method, body = null) {
    try {
      const token = await this._getToken();
      const fullPath = this._withDevice(path);
      const res = await fetch('https://api.spotify.com/v1' + fullPath, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!(res.status === 204 || res.ok)) {
        const t = await res.text().catch(() => '');
        console.warn('[SpotifyCompanionController] API', method, fullPath, res.status, t);
      }
      return res.status;
    } catch (e) {
      this.onError?.('Spotify API error: ' + (e?.message || e));
      return 0;
    }
  }

  disconnect() {
    this._stopPolling();
    this.state = null;
  }
}
