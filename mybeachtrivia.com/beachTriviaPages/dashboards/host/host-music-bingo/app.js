// app.js — Host Music Bingo (redirect Spotify OAuth, CSS-class based)
import {
  fetchPlaylists,
  fetchPlaylistData,
  parsePlaylistTracks,
  createGame,
  getGame,
  updateGameSongIndex,
  updateGameStatus,
  requireEmployee,
  watchSessionPlayerStats,
  setGameSessionPlayerStats,
  createSession,
  startRound,
  endRound,
  endSession,
} from './data.js?v=3';
import { renderJoinQRCode } from './qr.js';
import {
  SpotifyController,
  SpotifyCompanionController,
  initiateSpotifyAuth,
  getValidToken,
  getStoredTokens,
  clearSpotifySession,
  getSpotifyUser,
  spotifyApi,
} from './spotify.js?v=9';

// ------- Spotify loading overlay -------
let _overlayPlaylistsDone = false;
let _overlayPlayerDone    = false;
let _overlayActive        = false;

function showSpotifyOverlay() {
  const el = document.getElementById('sp-loading-overlay');
  if (!el) return;
  _overlayActive = true;
  el.classList.remove('sp-loading-overlay--hidden');
  el.removeAttribute('aria-hidden');
}

function checkHideSpotifyOverlay() {
  if (!_overlayActive) return;
  if (!_overlayPlaylistsDone || !_overlayPlayerDone) return;
  const el = document.getElementById('sp-loading-overlay');
  if (!el) return;
  el.classList.add('sp-loading-overlay--hidden');
  el.setAttribute('aria-hidden', 'true');
  _overlayActive = false;
}

// ------- Config -------
const WEBAPP_JOIN_BASE =
  'https://beach-trivia-website.web.app/play-music-bingo/index.html';
const JOIN_VERSION = 9;

// ------- Element lookups (match host-music-bingo.html) -------
const els = {
  // Setup form
  playlist:       document.querySelector('#playlist-select'),
  gameName:       document.querySelector('#game-name'),
  gameNameField:  document.querySelector('#game-name-field'),
  startBtn:       document.querySelector('#start-game-btn'),
  setupForm:      document.querySelector('#setup-form'),
  setupEyebrow:   document.querySelector('#setup-eyebrow'),
  setupTitle:     document.querySelector('#setup-title'),
  sessionControls: document.querySelector('#session-controls'),

  // Join / QR UI
  qrBox:           document.querySelector('#qr-code-container'),
  copyJoinBtn:     document.querySelector('#copy-join-link-btn'),
  joinLinkDisplay: document.querySelector('#join-link-display'),

  // Game panel
  gameSection:     document.querySelector('#game-section'),
  gameSectionJoin: document.querySelector('#game-section-join'),
  gameInfoRow:     document.querySelector('#game-info-row'),
  playerCountPill: document.querySelector('#player-count-pill'),
  currentGameName: document.querySelector('#current-game-name'),
  currentPlaylist: document.querySelector('#current-playlist'),
  gameId:          document.querySelector('#game-id'),
  currentSong:     document.querySelector('#current-song'),
  playerCountActive: document.querySelector('#player-count-active'),
  playerCountJoined: document.querySelector('#player-count-joined'),

  // Bingo transport
  playBtn:   document.querySelector('#play-song-btn'),
  nextBtn:   document.querySelector('#next-song-btn'),
  pauseBtn:  document.querySelector('#pause-game-btn'),
  resumeBtn: document.querySelector('#resume-game-btn'),
  endRoundBtn: document.querySelector('#end-round-btn'),
  endBtn:      document.querySelector('#end-game-btn'),

  // Played-log tabs
  playedLogTabs:  document.querySelector('#played-log-tabs'),
  playedLogTitle: document.querySelector('#played-log-title'),

  // Spotify auth card
  connectBtn:    document.querySelector('#spotify-connect-btn'),
  disconnectBtn: document.querySelector('#spotify-disconnect-btn'),
  connectedRow:  document.querySelector('#spotify-connected-row'),
  displayName:   document.querySelector('#spotify-display-name'),
  statusText:    document.querySelector('#spotify-status-text'),
  playerStatus:  document.querySelector('#sp-player-status'),

  // Spotify player section
  playerSection: document.querySelector('#spotify-player-section'),
  trackName:     document.querySelector('#sp-track-name'),
  artistName:    document.querySelector('#sp-artist-name'),
  playPauseBtn:  document.querySelector('#sp-play-pause-btn'),
  playIcon:      document.querySelector('#sp-play-icon'),
  pauseIcon:     document.querySelector('#sp-pause-icon'),
  prevBtn:       document.querySelector('#sp-prev-btn'),
  nextSpBtn:     document.querySelector('#sp-next-btn'),
  seekSlider:    document.querySelector('#sp-seek'),
  currentTime:   document.querySelector('#sp-current-time'),
  duration:      document.querySelector('#sp-duration'),
  volumeSlider:  document.querySelector('#sp-volume'),
  volumeLabel:   document.querySelector('#sp-volume-label'),

  // Played log
  playedLogSection: document.querySelector('#played-log-section'),
  playedLogList:    document.querySelector('#played-log-list'),
  playedLogCount:   document.querySelector('#played-log-count'),

  // Mobile companion modal
  mobileCompanionBtn: document.querySelector('#mobile-companion-btn'),
  mobileModal:        document.querySelector('#mobile-modal'),
  mobileModalClose:   document.querySelector('#mobile-modal-close'),
  companionQrBtn:     document.querySelector('#companion-qr-btn'),
  companionQrModal:   document.querySelector('#companion-qr-modal'),
  companionQrClose:   document.querySelector('#companion-qr-close'),
  companionQrCopy:    document.querySelector('#companion-qr-copy'),
  companionQrBox:     document.querySelector('#companion-qr-box'),
  mobConnectBtn:      document.querySelector('#mob-connect-btn'),
  mobAuthPrompt:      document.querySelector('#mob-auth-prompt'),
  mobPlayerUi:        document.querySelector('#mob-player-ui'),
  mobPlayPauseBtn:    document.querySelector('#mob-play-pause-btn'),
  mobPlayIcon:        document.querySelector('#mob-play-icon'),
  mobPauseIcon:       document.querySelector('#mob-pause-icon'),
  mobPrevBtn:         document.querySelector('#mob-prev-btn'),
  mobNextBtn:         document.querySelector('#mob-next-btn'),
  mobVolumeSlider:    document.querySelector('#mob-volume'),
  mobTrackName:       document.querySelector('#mob-track-name'),
  mobArtistName:      document.querySelector('#mob-artist-name'),
  mobLogList:         document.querySelector('#mob-log-list'),

  mobSeekSlider:     document.querySelector('#mob-seek'),
  mobCurrentTime:    document.querySelector('#mob-current-time'),
  mobDuration:       document.querySelector('#mob-duration'),

  // Mobile toggles
  mobShuffleToggle:    document.querySelector('#mob-shuffle'),
  mobFadeToggle:       document.querySelector('#mob-fade'),
  mobRandomStartToggle:document.querySelector('#mob-random-start'),

  randomStartToggle: document.querySelector('#sp-random-start'),
  fadeToggle:        document.querySelector('#sp-fade'),

  forms: Array.from(document.querySelectorAll('form')),
};

// ─── State ────────────────────────────────────────────────────────────────────

let activeGame      = null;
let spotifyCtrl     = null;
let seekDragging    = false;
let positionTimer   = null;
let playedSongs     = []; // { title, artist }
let playlistTracks  = []; // { title, artist, uri } — loaded when game starts

/** While set, main-player title/artist stay frozen until SDK reports this URI (avoids fade cross-talk flicker). */
let playTransition  = null; // { uri, title, artist, logged: boolean } | null

// Prevent duplicate logging when using mobile controls / SDK fallbacks.
let _lastLoggedUri = null;

// ─── Session / Round state ────────────────────────────────────────────────────
let sessionState    = 'idle'; // 'idle' | 'round-active' | 'between-rounds'
let activeSession   = null;
let currentRoundNumber = 0;
let usedPlaylistIds = new Set();
let roundHistory    = []; // [{ roundNumber, name, songs: [{title,artist}] }]
let activeRoundTab  = 0;  // roundNumber of the tab currently displayed

// ─── Auto-advance tracking ────────────────────────────────────────────────────
let _aaLastUri    = null;  // URI seen in last state update
let _aaWasPlaying = false; // was not-paused in last state update
let _aaLastPos    = 0;     // position (ms) seen in last state update
let _aaPending    = false; // debounce — prevents double-fire within 4 s

const LS_RANDOM_START = 'mb:randomStart';
const LS_FADE = 'mb:fade';
const LS_PLAYLIST_ID = 'mb:playlistId';
const LS_PLAYED_SONGS = 'mb:playedSongs';

function isRandomStartEnabled() {
  // Use checkbox as source of truth, but fall back to persisted value if the UI
  // is temporarily out of sync (e.g. hidden section not yet interacted with).
  if (els.randomStartToggle && typeof els.randomStartToggle.checked === 'boolean') {
    return els.randomStartToggle.checked;
  }
  try {
    return localStorage.getItem(LS_RANDOM_START) !== '0';
  } catch {
    return false;
  }
}

function isFadeEnabled() {
  if (els.fadeToggle && typeof els.fadeToggle.checked === 'boolean') {
    return els.fadeToggle.checked;
  }
  try {
    return localStorage.getItem(LS_FADE) !== '0';
  } catch {
    return true;
  }
}

function getTargetVolumePct() {
  const v = parseInt(els.volumeSlider?.value || els.mobVolumeSlider?.value || '75', 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 75;
}

let _fadeSeq = 0;
let _currentVolumePct = getTargetVolumePct();

// Updates the Spotify SDK volume without touching UI controls.
// Used internally by fadeTo so the slider stays pinned to the user's chosen level.
// For companion mode (REST API) we fire-and-forget so network latency doesn't
// stretch the fade duration — the timing loop in fadeTo drives the animation.
async function setAudioVolume(pct) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  _currentVolumePct = clamped;
  if (isSpotifyCompanionCtrl()) {
    spotifyCtrl?.setVolume(clamped).catch(() => {});
  } else {
    await spotifyCtrl?.setVolume(clamped).catch(() => {});
  }
}

// Updates both SDK volume and the UI controls (slider + label).
// Call this for user-driven changes and when restoring to the target after a fade.
async function setVolumePct(pct) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  _currentVolumePct = clamped;
  if (els.volumeSlider) els.volumeSlider.value = String(clamped);
  if (els.mobVolumeSlider) els.mobVolumeSlider.value = String(clamped);
  if (els.volumeLabel) els.volumeLabel.textContent = String(clamped);
  await spotifyCtrl?.setVolume(clamped).catch(() => {});
}

// Animates volume between _currentVolumePct and targetPct.
// Uses setAudioVolume (no UI) so the slider stays at the user's set value.
//
// SDK mode:      ~60 ms between steps — smooth audio-node animation.
// Companion mode: ~400 ms between steps — each step is a REST API call;
//   too many calls in quick succession triggers Spotify's 429 rate limit
//   and cascades into playUri / polling failures.
async function fadeTo(targetPct, durationMs = 800) {
  if (!spotifyCtrl) return;
  const seq = ++_fadeSeq;
  const startPct = _currentVolumePct;
  const endPct = Math.max(0, Math.min(100, targetPct));
  // Companion: 150 ms between steps → ~6–8 calls/sec, smooth enough to match
  // the SDK curve without triggering Spotify's 429 rate limit (which hit at ~16/sec).
  const stepInterval = isSpotifyCompanionCtrl() ? 150 : 60;
  const steps = Math.max(isSpotifyCompanionCtrl() ? 8 : 8, Math.floor(durationMs / stepInterval));
  const stepDelay = Math.floor(durationMs / steps);
  for (let i = 1; i <= steps; i++) {
    if (seq !== _fadeSeq) return; // cancelled by a newer fade
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pct = Math.round(startPct + (endPct - startPct) * eased);
    await setAudioVolume(pct);
    await new Promise((r) => setTimeout(r, stepDelay));
  }
  if (seq === _fadeSeq) await setAudioVolume(endPct);
}

async function logSpotifyNow(label) {
  if (!spotifyCtrl) {
    console.log(`[dbg][${label}] spotifyCtrl = null`);
    return;
  }
  const stPoll = await spotifyCtrl.getCurrentState().catch(() => null);
  const uri = stPoll?.track_window?.current_track?.uri || null;
  const name = stPoll?.track_window?.current_track?.name || null;
  const pos = stPoll?.position ?? null;
  const dur = stPoll?.duration ?? null;
  console.log(`[dbg][${label}]`, { uri, name, pos, dur, paused: stPoll?.paused ?? null });
}

async function manualAdvanceFromPlaylist(delta = 1) {
  if (!spotifyCtrl) return false;
  await ensurePlaylistTracksLoaded();
  if (!playlistTracks.length) {
    console.warn('[dbg][manualAdvance] no playlistTracks loaded');
    return false;
  }
  const stPoll = await spotifyCtrl.getCurrentState().catch(() => null);
  const curUri = stPoll?.track_window?.current_track?.uri || null;
  const curIdx = curUri ? playlistTracks.findIndex((t) => t?.uri === curUri) : -1;
  const base = curIdx >= 0 ? curIdx : -1;
  const nextIdx = (base + delta + playlistTracks.length) % playlistTracks.length;
  const next = playlistTracks[nextIdx];
  console.log('[dbg][manualAdvance]', { curUri, curIdx, nextIdx, nextUri: next?.uri });
  if (!next?.uri) return false;
  const startMode = isRandomStartEnabled() ? 'random' : 0;
  beginPlayTransition(next);
  try {
    await playTrackAtPosition(next.uri, startMode);
  } catch (e) {
    playTransition = null;
    console.warn('[dbg][manualAdvance] play failed:', e?.message || e);
  }
  await resolvePlayTransitionAfterPlay(next);
  await new Promise((r) => setTimeout(r, 250));
  await logSpotifyNow('after manualAdvance');
  return true;
}

// ─── RTDB Player Watcher ──────────────────────────────────────────────────────

let stopWatchingPlayers = null;

function attachPlayerWatcher(gameId) {
  if (stopWatchingPlayers) { stopWatchingPlayers(); stopWatchingPlayers = null; }

  stopWatchingPlayers = watchSessionPlayerStats(gameId, async ({ active, totalJoined }) => {
    if (els.playerCountActive) els.playerCountActive.textContent = String(active);
    if (els.playerCountJoined) els.playerCountJoined.textContent = String(totalJoined);
    try {
      await setGameSessionPlayerStats(gameId, { active, totalJoined });
    } catch (e) {
      console.debug('setGameSessionPlayerStats failed:', e?.message || e);
    }
  });
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Join-link / QR helpers ───────────────────────────────────────────────────

function ensureJoinLinkDisplay() {
  if (!els.joinLinkDisplay) {
    const host = els.qrBox?.parentElement || document.body;
    const p = document.createElement('p');
    p.id = 'join-link-display';
    p.className = 'join-url';
    host.appendChild(p);
    els.joinLinkDisplay = p;
  }
}

function renderJoinLink(url) {
  if (!els.qrBox) return;
  els.qrBox.innerHTML = '';
  try {
    renderJoinQRCode(els.qrBox, url, 196);
  } catch (e) {
    console.warn('QR render failed:', e);
  }
}

function wireCopyJoin() {
  if (!els.copyJoinBtn) return;
  els.copyJoinBtn.addEventListener('click', async () => {
    ensureJoinLinkDisplay();
    try {
      const value = (els.joinLinkDisplay?.innerText || els.joinLinkDisplay?.textContent || '').trim();
      if (!value) { alert('No join link available yet.'); return; }
      await navigator.clipboard.writeText(value);
      const orig = els.copyJoinBtn.textContent;
      els.copyJoinBtn.textContent = 'Copied!';
      setTimeout(() => (els.copyJoinBtn.textContent = orig), 1200);
    } catch (e) {
      console.error('Copy failed:', e);
      alert('Copy failed. Please try again.');
    }
  });
}

function updateGameUI(game, playlistName) {
  activeGame = game;
  els.gameSection?.classList.remove('hidden');
  els.gameSectionJoin?.classList.remove('hidden');
  els.gameInfoRow?.classList.remove('hidden');
  els.playerCountPill?.classList.remove('hidden');
  // endBtn visibility is managed by setSessionState — don't override it here

  if (els.currentGameName) els.currentGameName.textContent = game.name || 'Music Bingo Game';
  if (els.currentPlaylist) els.currentPlaylist.textContent = playlistName || game.playlistName || game.playlistId || '';
  if (els.gameId)          els.gameId.textContent = game.id || '';
  if (els.currentSong) {
    const idx = game.currentSongIndex;
    els.currentSong.textContent =
      typeof idx === 'number' && idx >= 0
        ? `Song ${idx + 1}`
        : 'Not started';
  }
  if (els.playerCountActive) els.playerCountActive.textContent = String(game.playerCount ?? 0);
  if (els.playerCountJoined) {
    els.playerCountJoined.textContent = String(game.sessionJoinTotal ?? 0);
  }

  const joinUrl = (typeof activeSession !== 'undefined' && activeSession)
    ? `${WEBAPP_JOIN_BASE}?sessionId=${encodeURIComponent(activeSession.id)}&v=${JOIN_VERSION}`
    : `${WEBAPP_JOIN_BASE}?gameId=${encodeURIComponent(game.id)}&v=${JOIN_VERSION}`;
  ensureJoinLinkDisplay();
  els.joinLinkDisplay.textContent = joinUrl;
  window.currentJoinLink = joinUrl;
  renderJoinLink(joinUrl);
}

// ─── Played-log ───────────────────────────────────────────────────────────────

function renderPlayedLogList(list, songs) {
  if (!list) return;
  const src = songs || playedSongs;
  list.innerHTML = '';
  if (!src.length) {
    const empty = document.createElement('p');
    empty.className = 'hc-muted hc-log-empty';
    empty.textContent = 'No songs played yet';
    list.appendChild(empty);
    return;
  }
  src.forEach(({ title, artist }, index) => {
    const item = document.createElement('div');
    item.className = 'hc-log-item';

    const badge = document.createElement('span');
    badge.className = 'hc-log-index';
    badge.textContent = String(src.length - index);

    const copy = document.createElement('div');
    copy.className = 'hc-log-copy';

    const track = document.createElement('span');
    track.className = 'hc-log-track';
    track.textContent = title || 'Unknown track';

    const artistEl = document.createElement('span');
    artistEl.className = 'hc-log-artist';
    artistEl.textContent = artist || 'Unknown artist';

    copy.appendChild(track);
    copy.appendChild(artistEl);
    item.appendChild(badge);
    item.appendChild(copy);
    list.appendChild(item);
  });
}

/** True when the user is browsing an archived round tab (not the live round). */
function isViewingHistoricalRound() {
  return roundHistory.some(r => r.roundNumber === activeRoundTab);
}

function addToPlayedLog(title, artist) {
  // Always record the song — no render guard on the data.
  playedSongs.unshift({ title, artist });
  // Persist so the companion tab can read it on open.
  try { localStorage.setItem(LS_PLAYED_SONGS, JSON.stringify(playedSongs)); } catch { /* ignore */ }

  // Keep the current round view fresh immediately after a track advance.
  // Historical tabs remain frozen until the user clicks them again.
  if (!isViewingHistoricalRound()) {
    renderActiveRoundTab();
    renderPlayedLogList(els.mobLogList, playedSongs);
  }

  els.playedLogSection?.classList.remove('hidden');
}

function setNowPlayingFromPlayTransition() {
  if (!playTransition) return;
  const title = playTransition.title || '—';
  const artist = playTransition.artist || '—';
  if (els.trackName) els.trackName.textContent = title;
  if (els.artistName) els.artistName.textContent = artist;
  if (els.mobTrackName) els.mobTrackName.textContent = title;
  if (els.mobArtistName) els.mobArtistName.textContent = artist;
}

function logSdkTrackIfNew(sdkTrack) {
  const uri = sdkTrack?.uri || null;
  if (!uri || uri === _lastLoggedUri) return;
  _lastLoggedUri = uri;
  const title  = sdkTrack?.name || '—';
  const artist = sdkTrack?.artists?.map((a) => a.name).join(', ') || '—';
  addToPlayedLog(title, artist);
}

function beginPlayTransition(playlistTrack) {
  if (!playlistTrack?.uri) return;
  playTransition = {
    uri: playlistTrack.uri,
    title: playlistTrack.title || '',
    artist: playlistTrack.artist || '',
    logged: false,
  };
}

/** When SDK shows the target track: reveal title/artist + session log once, then clear transition. */
function finalizePlayTransitionFromSdkTrack(sdkTrack) {
  if (!playTransition || !sdkTrack || sdkTrack.uri !== playTransition.uri) return;
  if (!playTransition.logged) {
    addToPlayedLog(playTransition.title, playTransition.artist);
    playTransition.logged = true;
  }
  _lastLoggedUri = sdkTrack?.uri || _lastLoggedUri;
  const title =
    sdkTrack.name || playTransition.title || '—';
  const artist =
    sdkTrack.artists?.map((a) => a.name).join(', ') || playTransition.artist || '—';
  if (els.trackName) els.trackName.textContent = title;
  if (els.artistName) els.artistName.textContent = artist;
  if (els.mobTrackName) els.mobTrackName.textContent = title;
  if (els.mobArtistName) els.mobArtistName.textContent = artist;
  playTransition = null;
}

function applySpotifyTransportUi(state) {
  const { paused, position, duration } = state;
  const playing = !paused;
  if (els.playIcon) els.playIcon.classList.toggle('hidden', playing);
  if (els.pauseIcon) els.pauseIcon.classList.toggle('hidden', !playing);
  if (els.mobPlayIcon) els.mobPlayIcon.classList.toggle('hidden', playing);
  if (els.mobPauseIcon) els.mobPauseIcon.classList.toggle('hidden', !playing);

  if (!seekDragging && els.seekSlider) {
    const pct = duration > 0 ? (position / duration) * 1000 : 0;
    els.seekSlider.value = String(Math.round(pct));
  }
  if (!seekDragging && els.mobSeekSlider) {
    const pct = duration > 0 ? (position / duration) * 1000 : 0;
    els.mobSeekSlider.value = String(Math.round(pct));
  }
  if (els.currentTime) els.currentTime.textContent = fmtTime(position);
  if (els.duration) els.duration.textContent = fmtTime(duration);
  if (els.mobCurrentTime) els.mobCurrentTime.textContent = fmtTime(position);
  if (els.mobDuration) els.mobDuration.textContent = fmtTime(duration);
}

// ─── Spotify status text ──────────────────────────────────────────────────────

function setSpotifyStatus(text) {
  if (els.statusText)   els.statusText.textContent   = text;
  if (els.playerStatus) els.playerStatus.textContent = text;
}

// ─── Auto-advance on natural track end ───────────────────────────────────────

async function handleAutoAdvance() {
  if (_aaPending) return;
  _aaPending = true;
  setTimeout(() => { _aaPending = false; }, 4000);
  console.log('[app] auto-advance: natural track end detected');
  if (activeGame) {
    await handleNextSong();
  } else {
    // No active game — advance within the loaded playlist
    const ok = await manualAdvanceFromPlaylist(1);
    if (!ok) console.warn('[app] auto-advance: no playlist tracks to advance to');
  }
}

/**
 * Called on every state update to detect a naturally-ended track.
 *
 * SDK controller:  fires player_state_changed with paused:true, position≈0
 *                  when a track finishes (Spotify resets position to the start).
 * Companion (REST): polls /me/player and reports is_playing:false with
 *                  progress_ms near duration_ms when playback stops.
 * Both are handled here without knowing which controller is active.
 */
function checkNaturalTrackEnd(state) {
  const uri    = state.track_window?.current_track?.uri ?? null;
  const paused = state.paused ?? true;
  const pos    = state.position ?? 0;
  const dur    = state.duration ?? 0;

  const wasPlaying = _aaWasPlaying;
  const lastUri    = _aaLastUri;
  const lastPos    = _aaLastPos;

  // Update tracking for the next call
  _aaLastUri    = uri;
  _aaWasPlaying = !paused;
  _aaLastPos    = pos;

  // Don't trigger while a track transition we initiated is in flight
  if (playTransition) return;
  // Must have been playing, must be paused now, same track
  if (!wasPlaying || !paused || !uri || uri !== lastUri) return;
  // Must have had meaningful playback before this pause
  if (lastPos < 5000) return;

  // SDK: position resets to ~0 at natural end
  const sdkEnd  = pos < 500;
  // Companion (REST): position stays near the end of the track
  const restEnd = dur > 0 && pos >= dur - 3000;

  if (sdkEnd || restEnd) handleAutoAdvance();
}

// ─── Spotify player-state UI update ──────────────────────────────────────────

function updateSpotifyState(state) {
  if (!state) {
    if (els.playIcon)    els.playIcon.classList.remove('hidden');
    if (els.pauseIcon)   els.pauseIcon.classList.add('hidden');
    if (els.mobPlayIcon) els.mobPlayIcon.classList.remove('hidden');
    if (els.mobPauseIcon)els.mobPauseIcon.classList.add('hidden');
    return;
  }

  const { paused, track_window, position, duration } = state;
  const track = track_window?.current_track;
  const curUri = track?.uri ?? null;

  if (playTransition && track && curUri === playTransition.uri) {
    finalizePlayTransitionFromSdkTrack(track);
  }

  if (playTransition) {
    applySpotifyTransportUi(state);
    return;
  }

  if (track) {
    const title  = track.name || '—';
    const artist = track.artists?.map((a) => a.name).join(', ') || '—';

    if (els.trackName)    els.trackName.textContent    = title;
    if (els.artistName)   els.artistName.textContent   = artist;
    if (els.mobTrackName) els.mobTrackName.textContent = title;
    if (els.mobArtistName)els.mobArtistName.textContent= artist;

    // Fallback logging for any track change path that bypasses playTransition.
    logSdkTrackIfNew(track);
  }

  applySpotifyTransportUi(state);
  checkNaturalTrackEnd(state);
}

// ─── Seek position polling (0.5 s) ───────────────────────────────────────────

function startPositionPolling() {
  clearInterval(positionTimer);
  positionTimer = setInterval(async () => {
    if (!spotifyCtrl || seekDragging) return;
    const state = await spotifyCtrl.getCurrentState().catch(() => null);
    if (state) updateSpotifyState(state);
  }, 500);
}

function stopPositionPolling() {
  clearInterval(positionTimer);
  positionTimer = null;
}

// ─── initSpotify ─────────────────────────────────────────────────────────────

async function initSpotify() {
  setSpotifyStatus('Connecting…');

  const isCompanion = new URLSearchParams(location.search).get('companion') === '1';

  try {
    spotifyCtrl = isCompanion ? new SpotifyCompanionController() : new SpotifyController();

    spotifyCtrl.onReady = async (deviceId) => {
      console.log('[app] Spotify ready, device:', deviceId);
      _overlayPlayerDone = true;
      checkHideSpotifyOverlay();
      setSpotifyStatus('Connected');
      els.playerSection?.classList.remove('hidden');
      startPositionPolling();
      // Ensure volume isn't left at 0 by a prior fade.
      await setVolumePct(getTargetVolumePct());

      // Fetch and display Spotify user name
      try {
        const me = await getSpotifyUser();
        if (els.displayName) els.displayName.textContent = me?.display_name || me?.email || 'Spotify';
        els.connectedRow?.classList.remove('hidden');
        els.connectBtn?.classList.add('hidden');
        if (els.mobAuthPrompt) els.mobAuthPrompt.classList.add('hidden');
        if (els.mobPlayerUi)   els.mobPlayerUi.classList.remove('hidden');
      } catch (e) {
        console.warn('[app] Could not fetch Spotify user:', e);
      }
    };

    spotifyCtrl.onStateChange = (state) => updateSpotifyState(state);

    spotifyCtrl.onError = (msg) => {
      console.error('[app] Spotify error:', msg);
      setSpotifyStatus('⚠ ' + msg);
    };

    await spotifyCtrl.init(getValidToken);

  } catch (e) {
    console.error('[app] initSpotify failed:', e);
    setSpotifyStatus('Connection failed — try reconnecting');
    spotifyCtrl = null;
    _overlayPlayerDone = true;
    checkHideSpotifyOverlay();
  }
}

// ─── disconnectSpotify ────────────────────────────────────────────────────────

function disconnectSpotify() {
  spotifyCtrl?.disconnect();
  spotifyCtrl = null;
  stopPositionPolling();
  playTransition = null;
  clearSpotifySession();

  els.playerSection?.classList.add('hidden');
  els.connectedRow?.classList.add('hidden');
  els.connectBtn?.classList.remove('hidden');
  if (els.displayName)  els.displayName.textContent  = '';
  if (els.trackName)    els.trackName.textContent    = '—';
  if (els.artistName)   els.artistName.textContent   = '—';
  if (els.mobAuthPrompt) els.mobAuthPrompt.classList.remove('hidden');
  if (els.mobPlayerUi)   els.mobPlayerUi.classList.add('hidden');
  setSpotifyStatus('Connect to control music');
}

// ─── Wire Spotify controls ────────────────────────────────────────────────────



async function setSpotifyShuffle(on) {
  try {
    const deviceId = spotifyCtrl?.deviceId;
    const qs = new URLSearchParams({ state: on ? 'true' : 'false' });
    if (deviceId) qs.set('device_id', deviceId);
    await spotifyApi('/me/player/shuffle?' + qs.toString(), { method: 'PUT' });
  } catch (e) {
    console.warn('[app] setSpotifyShuffle failed:', e?.message || e);
  }
}

function isCompanionMode() {
  try {
    return new URLSearchParams(location.search).get('companion') === '1';
  } catch {
    return false;
  }
}

function getCompanionRemoteUrl() {
  // Always point at the extensionless canonical route (Firebase rewrite → .html)
  const base = new URL(location.origin + '/beachTriviaPages/dashboards/host/host-music-bingo/host-music-bingo');
  base.searchParams.set('companion', '1');
  return base.toString();
}

function isSpotifyCompanionCtrl() {
  return spotifyCtrl?.constructor?.name === 'SpotifyCompanionController';
}

async function companionEnsurePlaying() {
  if (!isSpotifyCompanionCtrl() || !spotifyCtrl) return;
  // Poll a few times — Spotify can briefly report paused right after /next.
  for (let i = 0; i < 12; i++) {
    await spotifyCtrl.refreshState?.();
    const st = await spotifyCtrl.getCurrentState().catch(() => null);
    if (st && !st.paused) return;
    // Force play only; never toggle here or we can flip back to pause.
    await (spotifyCtrl.play?.() ?? spotifyCtrl.togglePlay?.()).catch(() => {});
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function companionAdvance(delta) {
  if (!spotifyCtrl) return;

  // Capture URI *before* skip — required for maybeApplyRandomStartToCurrentTrack(prevUri).
  const before = await spotifyCtrl.getCurrentState().catch(() => null);
  const prevUri = before?.track_window?.current_track?.uri ?? null;

  // Always try playlist-based advance first — it's reliable and avoids the
  // jarring restart that POST /me/player/next causes when context_uri is null.
  const ok = await manualAdvanceFromPlaylist(delta > 0 ? 1 : -1);
  if (ok) return;

  // No playlist tracks available — fall back to native Spotify next/prev.
  // Resume first since REST transport is unreliable when paused.
  if (before?.paused) {
    await (spotifyCtrl.play?.() ?? spotifyCtrl.togglePlay?.()).catch(() => {});
    await new Promise((r) => setTimeout(r, 220));
  }

  if (delta > 0) await spotifyCtrl.nextTrack().catch(console.error);
  else await spotifyCtrl.previousTrack().catch(console.error);

  await new Promise((r) => setTimeout(r, 250));
  await companionEnsurePlaying();

  await maybeApplyRandomStartToCurrentTrack(prevUri);

  await spotifyCtrl.refreshState?.();
  const st = await spotifyCtrl.getCurrentState().catch(() => null);
  const cur = st?.track_window?.current_track;
  if (cur) {
    const title = cur.name || '—';
    const artist = cur.artists?.map((a) => a.name).join(', ') || '—';
    if (els.trackName) els.trackName.textContent = title;
    if (els.artistName) els.artistName.textContent = artist;
    if (els.mobTrackName) els.mobTrackName.textContent = title;
    if (els.mobArtistName) els.mobArtistName.textContent = artist;
    logSdkTrackIfNew(cur);
  }
}

function wireSpotifyControls() {
  // Auth
  els.connectBtn?.addEventListener('click',    () => initiateSpotifyAuth());
  els.mobConnectBtn?.addEventListener('click', () => initiateSpotifyAuth());
  els.disconnectBtn?.addEventListener('click', () => disconnectSpotify());


  // Shuffle (Spotify) — desktop + mobile
  const shuffleEls = [document.querySelector('#sp-shuffle'), els.mobShuffleToggle].filter(Boolean);
  const getShuffle = () => !!document.querySelector('#sp-shuffle')?.checked;

  // Keep mobile in sync with desktop initial state
  if (els.mobShuffleToggle && document.querySelector('#sp-shuffle')) {
    els.mobShuffleToggle.checked = getShuffle();
  }

  shuffleEls.forEach((el) => {
    el.addEventListener('change', async () => {
      const on = !!el.checked;
      const desk = document.querySelector('#sp-shuffle');
      if (desk && desk !== el) desk.checked = on;
      if (els.mobShuffleToggle && els.mobShuffleToggle !== el) els.mobShuffleToggle.checked = on;
      await setSpotifyShuffle(on);
    });
  });

  // Fade — mobile mirrors desktop + persistence
  if (els.mobFadeToggle && els.fadeToggle) {
    els.mobFadeToggle.checked = !!els.fadeToggle.checked;
    els.mobFadeToggle.addEventListener('change', () => {
      els.fadeToggle.checked = !!els.mobFadeToggle.checked;
      els.fadeToggle.dispatchEvent(new Event('change'));
    });
    els.fadeToggle.addEventListener('change', () => {
      els.mobFadeToggle.checked = !!els.fadeToggle.checked;
    });
  }

  // Random start — mobile mirrors desktop + persistence
  if (els.mobRandomStartToggle && els.randomStartToggle) {
    els.mobRandomStartToggle.checked = !!els.randomStartToggle.checked;
    els.mobRandomStartToggle.addEventListener('change', () => {
      els.randomStartToggle.checked = !!els.mobRandomStartToggle.checked;
      els.randomStartToggle.dispatchEvent(new Event('change'));
    });
    els.randomStartToggle.addEventListener('change', () => {
      els.mobRandomStartToggle.checked = !!els.randomStartToggle.checked;
    });
  }

  // Persist + debug random-start toggle (forced default ON)
  if (els.randomStartToggle) {
    try {
      // Force ON every load (matches desktop + mobile expectation).
      els.randomStartToggle.checked = true;
      localStorage.setItem(LS_RANDOM_START, '1');
    } catch { /* ignore */ }

    // Ensure mobile mirrors immediately.
    if (els.mobRandomStartToggle) els.mobRandomStartToggle.checked = true;

    els.randomStartToggle.addEventListener('change', () => {
      const on = !!els.randomStartToggle.checked;
      console.log('[app] Rand. start toggled:', on);
      try {
        localStorage.setItem(LS_RANDOM_START, on ? '1' : '0');
      } catch { /* ignore */ }
    });
  }

  // Persist fade toggle (default on)
  if (els.fadeToggle) {
    try {
      const saved = localStorage.getItem(LS_FADE);
      if (saved === '1') els.fadeToggle.checked = true;
      if (saved === '0') els.fadeToggle.checked = false;
    } catch { /* ignore */ }
    els.fadeToggle.addEventListener('change', () => {
      const on = !!els.fadeToggle.checked;
      console.log('[app] Fade toggled:', on);
      try {
        localStorage.setItem(LS_FADE, on ? '1' : '0');
      } catch { /* ignore */ }
    });
  }

  // Desktop transport — if nothing is playing yet, use the same shared start helper
  // so the random-start toggle is respected here too
  els.playPauseBtn?.addEventListener('click', async () => {
    if (!spotifyCtrl) return;
    const state = await spotifyCtrl.getCurrentState().catch(() => null);
    if (!state) {
      await startSelectedSong();
    } else {
      const wasPaused = state.paused;
      if (!wasPaused && isFadeEnabled()) {
        await fadeTo(0, 1000);
      }
      await spotifyCtrl.togglePlay().catch(console.error);
      if (wasPaused && isFadeEnabled()) {
        await fadeTo(getTargetVolumePct(), 1300);
      } else if (!wasPaused) {
        await setVolumePct(getTargetVolumePct());
      }
    }
  });
  els.prevBtn?.addEventListener('click',   () => spotifyCtrl?.previousTrack().catch(console.error));
  els.nextSpBtn?.addEventListener('click', async () => {
    console.log('[dbg][click] sp-next-btn');
    await logSpotifyNow('before sp-next');
    if (activeGame) {
      await handleNextSong();
      const st = await spotifyCtrl?.getCurrentState().catch(() => null);
      const cur = st?.track_window?.current_track;
      if (cur) logSdkTrackIfNew(cur);
      return;
    }
    if (!spotifyCtrl) return;
    // SDK nextTrack() does not reliably work when we're playing single-track URIs.
    // When no game is active, advance within the selected playlist ourselves.
    const ok = await manualAdvanceFromPlaylist(1);
    if (!ok) {
      const prevSt0 = await spotifyCtrl.getCurrentState().catch(() => null);
      const prevUri0 = prevSt0?.track_window?.current_track?.uri ?? null;
      if (isFadeEnabled()) await fadeTo(0, 1200);
      await spotifyCtrl.nextTrack().catch(console.error);
      await new Promise((r) => setTimeout(r, 250));
      await logSpotifyNow('after sp-next (fallback)');
      if (isFadeEnabled()) await fadeTo(getTargetVolumePct(), 1500);
      await maybeApplyRandomStartToCurrentTrack(prevUri0);
    }
  });
  // Mobile transport — companion mode uses direct Spotify transport; otherwise delegate to desktop.
  els.mobPlayPauseBtn?.addEventListener('click', async () => {
    if (isCompanionMode()) {
      if (!spotifyCtrl) return;
      const state = await spotifyCtrl.getCurrentState().catch(() => null);
      if (!state) {
        await startSelectedSong();
        return;
      }
      const wasPaused = state.paused;
      if (!wasPaused && isFadeEnabled()) {
        await fadeTo(0, 1000);
      }
      await spotifyCtrl.togglePlay().catch(console.error);
      if (wasPaused && isFadeEnabled()) {
        await fadeTo(getTargetVolumePct(), 1300);
      } else if (!wasPaused) {
        await setVolumePct(getTargetVolumePct());
      }
      return;
    }
    els.playPauseBtn?.click();
  });

  els.mobPrevBtn?.addEventListener('click', async () => {
    if (isCompanionMode()) {
      await companionAdvance(-1);
      return;
    }
    els.prevBtn?.click();
  });

  els.mobNextBtn?.addEventListener('click', async () => {
    if (isCompanionMode()) {
      await companionAdvance(1);
      return;
    }
    els.nextSpBtn?.click();
  });

  // Volume (desktop + mobile stay in sync)
  const applyVolume = async (pct) => {
    await setVolumePct(pct);
  };

  els.volumeSlider?.addEventListener('input', () =>
    applyVolume(parseInt(els.volumeSlider.value, 10)));
  els.mobVolumeSlider?.addEventListener('input', () =>
    applyVolume(parseInt(els.mobVolumeSlider.value, 10)));

  // Seek
  els.seekSlider?.addEventListener('mousedown',  () => { seekDragging = true; });
  els.seekSlider?.addEventListener('touchstart', () => { seekDragging = true; }, { passive: true });
  els.seekSlider?.addEventListener('change', async () => {
    seekDragging = false;
    if (!spotifyCtrl?.state) return;
    const pct   = parseInt(els.seekSlider.value, 10); // 0–1000
    const posMs = Math.round((pct / 1000) * spotifyCtrl.state.duration);
    await spotifyCtrl.seek(posMs).catch(console.error);
  });

  els.mobSeekSlider?.addEventListener('mousedown',  () => { seekDragging = true; });
  els.mobSeekSlider?.addEventListener('touchstart', () => { seekDragging = true; }, { passive: true });
  els.mobSeekSlider?.addEventListener('change', async () => {
    seekDragging = false;
    if (!spotifyCtrl?.state) return;
    const pct   = parseInt(els.mobSeekSlider.value, 10); // 0–1000
    const posMs = Math.round((pct / 1000) * spotifyCtrl.state.duration);
    await spotifyCtrl.seek(posMs).catch(console.error);
  });

  // Mobile companion modal
  els.mobileCompanionBtn?.addEventListener('click', () =>
    els.mobileModal?.classList.remove('hidden'));
  els.mobileModalClose?.addEventListener('click', () =>
    els.mobileModal?.classList.add('hidden'));
  els.mobileModal?.addEventListener('click', (e) => {
    if (e.target === els.mobileModal) els.mobileModal.classList.add('hidden');
  });

  // Companion QR button — show QR code pointing to this page in phone mode
  els.companionQrBtn?.addEventListener('click', () => {
    if (!els.companionQrModal || !els.companionQrBox) return;
    const url = getCompanionRemoteUrl();
    els.companionQrBox.innerHTML = '';
    renderJoinQRCode(els.companionQrBox, url, 200);
    els.companionQrModal.classList.remove('hidden');
  });
  els.companionQrClose?.addEventListener('click', () =>
    els.companionQrModal?.classList.add('hidden'));
  els.companionQrModal?.addEventListener('click', (e) => {
    if (e.target === els.companionQrModal) els.companionQrModal.classList.add('hidden');
  });
  els.companionQrCopy?.addEventListener('click', () => {
    const url = getCompanionRemoteUrl();
    navigator.clipboard.writeText(url).then(() => {
      const btn = els.companionQrCopy;
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  });
}

// ─── Session / Round helpers ──────────────────────────────────────────────────

function setSessionState(state) {
  sessionState = state;

  const isIdle          = state === 'idle';
  const isRoundActive   = state === 'round-active';
  const isBetweenRounds = state === 'between-rounds';

  // ── Sidebar setup card ───────────────────────────────────────────
  // idle / between-rounds: show the form so the host can pick a playlist
  // round-active: hide the form, show End Round + End Game instead
  els.setupForm?.classList.toggle('hidden', isRoundActive);
  els.sessionControls?.classList.toggle('hidden', !isRoundActive);

  // Game-name field only makes sense when starting the very first round
  els.gameNameField?.classList.toggle('hidden', isBetweenRounds);

  // Label + title change based on state
  if (els.setupEyebrow) els.setupEyebrow.textContent = isBetweenRounds ? 'Round Over' : 'Setup';
  if (els.setupTitle)   els.setupTitle.textContent   = isBetweenRounds ? 'Start Next Round' : 'New Game';
  if (els.startBtn)     els.startBtn.textContent     = isBetweenRounds ? 'Start Next Round' : 'Start Game';

  // End Round only visible when a round is actively running
  els.endRoundBtn?.classList.toggle('hidden', !isRoundActive);
  // End Game visible whenever a session exists (round-active OR between-rounds)
  els.endBtn?.classList.toggle('hidden', isIdle);
}

function updatePlaylistUsedState() {
  if (!els.playlist) return;
  Array.from(els.playlist.options).forEach((opt) => {
    opt.disabled = usedPlaylistIds.has(opt.value);
  });
}

// ─── Round tab helpers ────────────────────────────────────────────────────────

function addRoundTab(roundNumber, name, makeActive) {
  if (!els.playedLogTabs) return;
  els.playedLogTabs.classList.remove('hidden');

  // Deactivate all existing tabs before marking the new one active
  if (makeActive) {
    els.playedLogTabs.querySelectorAll('.hc-log-tab').forEach(t => t.classList.remove('active'));
  }

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'hc-log-tab' + (makeActive ? ' active' : '');
  tab.dataset.round = String(roundNumber);
  tab.textContent = name || `Round ${roundNumber}`;

  tab.addEventListener('click', () => {
    activeRoundTab = roundNumber;
    Array.from(els.playedLogTabs.querySelectorAll('.hc-log-tab')).forEach(t =>
      t.classList.toggle('active', t === tab));
    renderActiveRoundTab();
  });

  els.playedLogTabs.appendChild(tab);
  if (makeActive) {
    activeRoundTab = roundNumber;
    renderActiveRoundTab();
  }
}

function renderActiveRoundTab() {
  const round = roundHistory.find(r => r.roundNumber === activeRoundTab);
  const songs = round ? round.songs : playedSongs;
  const title = round ? (round.name || `Round ${activeRoundTab}`) : 'This Round';

  if (els.playedLogTitle) els.playedLogTitle.textContent = title;
  renderPlayedLogList(els.playedLogList, songs);
  const n = songs.length;
  if (els.playedLogCount) els.playedLogCount.textContent = `${n} song${n !== 1 ? 's' : ''}`;
}

// ─── Bingo game event handlers ────────────────────────────────────────────────

async function handleStartGame(e) {
  e?.preventDefault();

  const playlistId   = els.playlist?.value || '';
  const playlistName = (els.playlist?.options[els.playlist.selectedIndex]?.textContent || '').trim();
  const name         = els.gameName?.value.trim() || 'Music Bingo Game';
  if (!playlistId) { alert('Please select a playlist.'); return; }

  try {
    await requireEmployee();

    if (sessionState === 'idle') {
      // ── Brand-new session + Round 1 ──────────────────────────────
      const session = await createSession({ name });
      activeSession      = session;
      currentRoundNumber = 1;
      usedPlaylistIds    = new Set([playlistId]);
      roundHistory       = [];
      playedSongs        = [];
      try { localStorage.removeItem(LS_PLAYED_SONGS); } catch { /* ignore */ }

      const game = await startRound({
        sessionId: session.id,
        roundNumber: 1,
        playlistId,
        playlistTitle: playlistName,
      });
      activeGame = game;

    } else if (sessionState === 'between-rounds') {
      // ── Next round in existing session ────────────────────────────
      currentRoundNumber++;
      usedPlaylistIds.add(playlistId);
      playedSongs = [];
      try { localStorage.removeItem(LS_PLAYED_SONGS); } catch { /* ignore */ }

      const game = await startRound({
        sessionId: activeSession.id,
        roundNumber: currentRoundNumber,
        playlistId,
        playlistTitle: playlistName,
      });
      activeGame = game;
    }

    updateGameUI({ ...activeGame, playerCount: 0, sessionJoinTotal: 0 }, playlistName);
    attachPlayerWatcher(activeGame.id);
    setSessionState('round-active');
    addRoundTab(currentRoundNumber, playlistName, true);
    updatePlaylistUsedState();

    // Load playlist tracks for Spotify queuing
    playlistTracks = [];
    try {
      const data = await fetchPlaylistData(playlistId);
      playlistTracks = parsePlaylistTracks(data);
      console.log('[app] Loaded', playlistTracks.length, 'tracks for Spotify');
      try { localStorage.setItem(LS_PLAYLIST_ID, playlistId); } catch { /* ignore */ }
    } catch (e) {
      console.warn('[app] Could not load playlist tracks:', e?.message || e);
    }
  } catch (err) {
    console.error('Error starting game/round:', err);
    alert('Error: ' + (err?.message || String(err)));
  }
}

async function handleEndRound(e) {
  e?.preventDefault();
  if (!activeGame || !activeSession) return;

  // Archive current round's songs to history
  roundHistory.push({
    roundNumber: currentRoundNumber,
    name: activeGame.playlistName || activeGame.name || `Round ${currentRoundNumber}`,
    songs: [...playedSongs],
  });

  await endRound(activeSession.id, activeGame.id);
  activeGame = null;
  if (stopWatchingPlayers) { stopWatchingPlayers(); stopWatchingPlayers = null; }
  setSessionState('between-rounds');
  updatePlaylistUsedState();
}

// ─── Shared song-start helpers ───────────────────────────────────────────────

async function ensurePlaylistTracksLoaded() {
  if (playlistTracks.length > 0) return playlistTracks;
  let playlistId = activeGame?.playlistId || els.playlist?.value || '';
  if (!playlistId) {
    try { playlistId = localStorage.getItem(LS_PLAYLIST_ID) || ''; } catch { /* ignore */ }
  }
  if (!playlistId) return [];
  try {
    const data = await fetchPlaylistData(playlistId);
    playlistTracks = parsePlaylistTracks(data);
    console.log('[app] ensurePlaylistTracksLoaded: loaded', playlistTracks.length, 'tracks');
    try { localStorage.setItem(LS_PLAYLIST_ID, playlistId); } catch { /* ignore */ }
  } catch (e) {
    console.warn('[app] ensurePlaylistTracksLoaded failed:', e?.message || e);
  }
  return playlistTracks;
}

function getInitialSongIndex() {
  // Always pick a random song — the game should never start on the same track twice
  if (!playlistTracks.length) return 0;
  return Math.floor(Math.random() * playlistTracks.length);
}

function randomStartPositionFromDuration(durationMs) {
  const maxStart = Math.max(0, (durationMs || 0) - 60_000);
  // Starting at 0 is a valid random outcome too.
  return maxStart > 0 ? Math.floor(Math.random() * (maxStart + 1)) : 0;
}

async function seekWithRetry(targetMs, attempts = 4) {
  if (!spotifyCtrl || !targetMs || targetMs <= 0) return;
  const isCompanion = isSpotifyCompanionCtrl();
  for (let i = 0; i < attempts; i++) {
    await spotifyCtrl.seek(targetMs).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    // Companion caches REST state — force a fresh poll before checking position.
    if (isCompanion) await spotifyCtrl.refreshState?.();
    const st = await spotifyCtrl.getCurrentState().catch(() => null);
    const pos = st?.position ?? 0;
    // Consider it good if we're within ~1s of target.
    if (Math.abs(pos - targetMs) <= 1000) return;
  }
}

async function resolvePlayTransitionAfterPlay(playlistTrack) {
  if (!playlistTrack?.uri || !playTransition || playTransition.uri !== playlistTrack.uri) return;
  const st = await spotifyCtrl?.getCurrentState().catch(() => null);
  const sdkTrack = st?.track_window?.current_track;
  if (sdkTrack?.uri === playlistTrack.uri) {
    finalizePlayTransitionFromSdkTrack(sdkTrack);
    return;
  }
  if (!playTransition.logged) {
    addToPlayedLog(playTransition.title, playTransition.artist);
    playTransition.logged = true;
  }
  _lastLoggedUri = sdkTrack?.uri || _lastLoggedUri;
  playTransition = null;
  if (st) updateSpotifyState(st);
}

async function startSelectedSong() {
  await ensurePlaylistTracksLoaded();
  if (!playlistTracks.length) return;

  const startIndex = getInitialSongIndex();

  // Update Firestore index (best-effort — don't block Spotify if write fails)
  if (activeGame?.id) {
    try {
      await updateGameSongIndex(activeGame.id, startIndex);
      const game = await getGame(activeGame.id);
      activeGame = game;
    } catch (err) {
      console.warn('[app] startSelectedSong: could not update game index:', err?.message || err);
      activeGame.currentSongIndex = startIndex;
    }
  }

  if (els.currentSong) els.currentSong.textContent = `Song ${startIndex + 1}`;

  const track = playlistTracks[startIndex];
  if (spotifyCtrl && track?.uri) {
    const startMode = isRandomStartEnabled() ? 'random' : 0;
    console.log('[app] startSelectedSong: playing', track.uri, 'startMode =', startMode, 'checked =', !!els.randomStartToggle?.checked);
    beginPlayTransition(track);
    try {
      await playTrackAtPosition(track.uri, startMode);
    } catch (err) {
      console.warn('[app] startSelectedSong: play failed:', err?.message || err);
      playTransition = null;
      return;
    }
    await resolvePlayTransitionAfterPlay(track);
  }
}

// Poll getCurrentState() until the given track URI is active and playing,
// or until timeoutMs elapses. Returns true if the track became active.
async function waitForTrackActive(uri, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  const isCompanion = isSpotifyCompanionCtrl();
  while (Date.now() < deadline) {
    // Companion uses a REST polling cache — force a fresh API poll each iteration.
    if (isCompanion) await spotifyCtrl.refreshState?.();
    const state = await spotifyCtrl.getCurrentState().catch(() => null);
    if (state && state.track_window?.current_track?.uri === uri) {
      return true;
    }
    await new Promise((r) => setTimeout(r, isCompanion ? 600 : 150));
  }
  console.warn('[app] waitForTrackActive: timed out waiting for', uri);
  return false;
}

// Floor for track-switch fades. Must stay above 0 — setVolume(0) before playUri
// causes the Spotify SDK to permanently mute the device (the new track's audio
// node inherits the zero gain). 2% is inaudible but avoids that bug.
const FADE_FLOOR_PCT = 2;

// Two-stage playback: start the track at 0, wait until the SDK confirms it
// is active on this device, then seek to the desired offset.
// Spotify does not reliably honor position_ms in the initial play command
// on Web Playback SDK devices, so the explicit seek is the reliable path.
async function playTrackAtPosition(uri, positionMsOrMode) {
  const target = getTargetVolumePct();

  // Detect whether a different track is currently playing so we can fade it out.
  const st0 = await spotifyCtrl.getCurrentState().catch(() => null);
  const curUri = st0?.track_window?.current_track?.uri;
  const isSwitching = !!(curUri && curUri !== uri);

  // Fade out to floor before switching tracks so the start-from-0 is inaudible.
  if (isSwitching && isFadeEnabled()) {
    await fadeTo(FADE_FLOOR_PCT, 1600);
  }

  await spotifyCtrl.playUri(uri, 0);

  // PLAYURI_NOW_PLAYING_SYNC
  // Swap Now Playing immediately once playUri is accepted (waitForTrackActive can lag).
  setNowPlayingFromPlayTransition();

  // EARLY_PLAYTRANSITION_LOG
  // Log to session history as soon as playback is triggered (don't wait for fade-in).
  if (playTransition && playTransition.uri === uri && !playTransition.logged) {
    addToPlayedLog(playTransition.title, playTransition.artist);
    playTransition.logged = true;
  }

  console.log('[app] playTrackAtPosition: waiting for track to become active…');
  const active = await waitForTrackActive(uri);

  // ACTIVE_TRACK_NOW_PLAYING_SYNC
  // Update Now Playing as soon as the new track is active (at fade-floor), not after fade-in completes.
  setNowPlayingFromPlayTransition();

  // Let the SDK finish delivering player_state_changed events before touching volume.
  await new Promise((r) => setTimeout(r, 200));

  // Keep volume at floor while we seek — hides the brief playback from position 0.
  if (!isSpotifyCompanionCtrl() && isFadeEnabled()) {
    await setAudioVolume(FADE_FLOOR_PCT); // re-confirm floor after track init
  }

  if (!active) {
    console.warn('[app] playTrackAtPosition: track did not become active; skipping seek');
    await (isFadeEnabled() && !isSpotifyCompanionCtrl() ? fadeTo(target, 1800) : setVolumePct(target));
    return;
  }

  // Re-check current track before seeking.
  const stateNow = await spotifyCtrl.getCurrentState().catch(() => null);
  const currentUri = stateNow?.track_window?.current_track?.uri;
  if (currentUri && currentUri !== uri) {
    console.warn('[app] playTrackAtPosition: current track mismatch; skipping seek', { currentUri, uri });
    await (isFadeEnabled() && !isSpotifyCompanionCtrl() ? fadeTo(target, 1800) : setVolumePct(target));
    return;
  }

  // Track is confirmed active — update the name + log immediately so it doesn't
  // wait for onStateChange (which may not fire until after the fade completes,
  // especially when starting from position 0 with no seek).
  const confirmedSdkTrack = stateNow?.track_window?.current_track;
  if (confirmedSdkTrack?.uri === uri) {
    finalizePlayTransitionFromSdkTrack(confirmedSdkTrack);
  }

  const shouldRandomStart = positionMsOrMode === 'random';
  const desiredPosMs = shouldRandomStart
    ? randomStartPositionFromDuration(stateNow?.duration || spotifyCtrl?.state?.duration || 0)
    : Number(positionMsOrMode || 0);

  if (desiredPosMs > 0) {
    try {
      console.log('[app] playTrackAtPosition: seeking to', desiredPosMs, 'ms');
      await seekWithRetry(desiredPosMs);
      // Brief pause so the seek lands before we start the fade-in.
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.warn('[app] playTrackAtPosition: seek failed:', e?.message || e);
    }
  }

  // Restore volume after seek.
  setNowPlayingFromPlayTransition();
  if (isFadeEnabled()) {
    await fadeTo(target, 1800);
  } else {
    await setVolumePct(target);
  }
}

async function maybeApplyRandomStartToCurrentTrack(prevUri = null) {
  if (!spotifyCtrl) return;
  if (!isRandomStartEnabled()) return;
  if (!prevUri) return; // never seek blindly in companion fallback paths

  // Poll until the track URI changes (handles REST-polling delay on companion).
  // Falls through immediately if prevUri is unknown (normal SDK mode).
  const deadline = Date.now() + 2500;
  let state, uri;
  do {
    await new Promise((r) => setTimeout(r, 300));
    if (typeof spotifyCtrl.refreshState === 'function') await spotifyCtrl.refreshState();
    state = await spotifyCtrl.getCurrentState().catch(() => null);
    uri   = state?.track_window?.current_track?.uri;
    if (!prevUri || uri !== prevUri) break;
  } while (Date.now() < deadline);

  if (!uri || uri === prevUri) return; // track didn't change — skip seek
  const posMs = randomStartPositionFromDuration(state?.duration || 0);
  if (posMs <= 0) return;
  await seekWithRetry(posMs).catch(console.error);
}

async function handlePlaySong(e) {
  e?.preventDefault();
  if (!activeGame) return;
  await startSelectedSong();
}

async function handleNextSong(e) {
  e?.preventDefault();
  console.log('[dbg][click] next-song-btn (bingo)');
  await logSpotifyNow('before bingo-next');
  // If the host page was refreshed, activeGame may not be hydrated anymore.
  // In that case, treat Next as a pure Spotify control.
  if (!activeGame) {
    if (!spotifyCtrl) return;
    const prevStB = await spotifyCtrl.getCurrentState().catch(() => null);
    const prevUriB = prevStB?.track_window?.current_track?.uri ?? null;
    await spotifyCtrl.nextTrack().catch(console.error);
    await new Promise((r) => setTimeout(r, 250));
    await logSpotifyNow('after bingo-next (spotify-only)');
    await maybeApplyRandomStartToCurrentTrack(prevUriB);
    return;
  }

  await ensurePlaylistTracksLoaded();
  if (!playlistTracks.length) return;

  const cur = Number.isFinite(activeGame.currentSongIndex) ? activeGame.currentSongIndex : -1;
  const nextIndex = (cur + 1) % playlistTracks.length;
  console.log('[app] handleNextSong:', {
    gameId: activeGame?.id,
    cur,
    nextIndex,
    randomStart: isRandomStartEnabled(),
    nextUri: playlistTracks?.[nextIndex]?.uri,
  });

  // Update Firestore index (best-effort — don't block playback if write fails)
  try {
    await updateGameSongIndex(activeGame.id, nextIndex);
    const game = await getGame(activeGame.id);
    activeGame = game;
  } catch (err) {
    console.warn('[app] handleNextSong: could not update game index:', err?.message || err);
    activeGame.currentSongIndex = nextIndex;
  }

  if (els.currentSong) els.currentSong.textContent = `Song ${nextIndex + 1}`;

  const track = playlistTracks[nextIndex];
  if (spotifyCtrl && track?.uri) {
    const startMode = isRandomStartEnabled() ? 'random' : 0;
    console.log('[dbg][bingo-next] attempting play', { uri: track.uri, startMode });
    beginPlayTransition(track);
    try {
      await playTrackAtPosition(track.uri, startMode);
    } catch (err) {
      console.warn('[app] handleNextSong: play failed:', err?.message || err);
      playTransition = null;
      await new Promise((r) => setTimeout(r, 250));
      await logSpotifyNow('after bingo-next play');
      return;
    }
    await resolvePlayTransitionAfterPlay(track);
    await new Promise((r) => setTimeout(r, 250));
    await logSpotifyNow('after bingo-next play');
  }
}

async function handlePauseGame(e) {
  e?.preventDefault();
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'paused');
}

async function handleResumeGame(e) {
  e?.preventDefault();
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'active');
}

async function handleEndGame(e) {
  e?.preventDefault();

  // End current round first (if one is active)
  if (activeGame) {
    await updateGameStatus(activeGame.id, 'ended');
    activeGame = null;
  }

  // End session
  if (activeSession) {
    try { await endSession(activeSession.id); } catch (_) {}
    activeSession = null;
  }

  if (stopWatchingPlayers) { stopWatchingPlayers(); stopWatchingPlayers = null; }

  // Reset session state
  sessionState       = 'idle';
  currentRoundNumber = 0;
  usedPlaylistIds    = new Set();
  roundHistory       = [];
  playedSongs        = [];
  activeRoundTab     = 0;
  try { localStorage.removeItem(LS_PLAYED_SONGS); } catch { /* ignore */ }

  setSessionState('idle');

  // Reset UI
  els.gameSection?.classList.add('hidden');
  els.gameSectionJoin?.classList.add('hidden');
  els.gameInfoRow?.classList.add('hidden');
  els.playerCountPill?.classList.add('hidden');
  if (els.playedLogTabs)  { els.playedLogTabs.innerHTML = ''; els.playedLogTabs.classList.add('hidden'); }
  if (els.playedLogSection) els.playedLogSection.classList.add('hidden');
  if (els.qrBox)           els.qrBox.innerHTML           = '';
  if (els.joinLinkDisplay) els.joinLinkDisplay.textContent = '';
  // startBtn text + sidebar state are reset by setSessionState('idle') above
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  console.log('Initializing Music Bingo Host...');

  // Companion phone mode: ?companion=1 — skip Firebase auth, fullscreen mobile controls only
  if (new URLSearchParams(location.search).get('companion') === '1') {
    document.body.classList.add('companion-mode');
    els.mobileModal?.classList.remove('hidden');
    wireSpotifyControls();

    // Pre-populate played log with songs from the main player tab.
    // The main player writes playedSongs to localStorage on every addToPlayedLog call.
    try {
      const raw = localStorage.getItem(LS_PLAYED_SONGS);
      if (raw) {
        playedSongs = JSON.parse(raw);
        renderPlayedLogList(els.mobLogList, playedSongs);
      }
    } catch { /* ignore */ }

    if (getStoredTokens()) {
      _overlayPlaylistsDone = true; // skip playlist step — companion doesn't need it
      showSpotifyOverlay();
      initSpotify();
    } else {
      // No tokens yet — show the Connect Spotify prompt
      if (els.mobAuthPrompt) els.mobAuthPrompt.classList.remove('hidden');
    }
    console.log('[app] Companion mode — skipping employee auth');
    return;
  }

  // Prevent accidental form-submit refresh
  els.forms.forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));

  // Require employee sign-in
  try {
    const me = await requireEmployee();
    console.log('[app] signed in as:', me.email || me.uid);
  } catch (e) {
    console.warn('[app] not signed in → redirecting to login:', e.message);
    const redirectTo = location.pathname + location.search + location.hash;
    location.assign('/login.html?redirect=' + encodeURIComponent(redirectTo));
    return;
  }

  // Populate playlists and load tracks on selection
  try {
    const playlists = await fetchPlaylists();
    _overlayPlaylistsDone = true;
    checkHideSpotifyOverlay();
    if (els.playlist) {
      els.playlist.innerHTML = '<option value="" disabled selected>Select a playlist...</option>';
      playlists.forEach((pl) => {
        const opt = document.createElement('option');
        opt.value       = pl.id;
        opt.textContent = pl.playlistTitle || pl.name || pl.id;
        els.playlist.appendChild(opt);
      });

      els.playlist.addEventListener('change', async () => {
        const id = els.playlist.value;
        if (!id) return;
        playlistTracks = [];
        try {
          const data = await fetchPlaylistData(id);
          playlistTracks = parsePlaylistTracks(data);
          console.log('[app] Loaded', playlistTracks.length, 'tracks for', id);
          try { localStorage.setItem(LS_PLAYLIST_ID, id); } catch { /* ignore */ }
        } catch (e) {
          console.warn('[app] Could not load playlist tracks:', e?.message || e);
        }
      });
    }
  } catch (err) {
    console.error('Failed to load playlists:', err);
    _overlayPlaylistsDone = true;
    checkHideSpotifyOverlay();
    if (els.playlist) {
      els.playlist.innerHTML =
        '<option value="" disabled selected>Error loading playlists — check console</option>';
    }
    const msg = String(err?.message || '');
    if (msg.toLowerCase().includes('log in') || msg.toLowerCase().includes('auth')) {
      alert('Please log in to access Music Bingo. You may need to visit the login page first.');
    }
  }

  // Wire bingo game controls
  els.startBtn?.addEventListener('click',    handleStartGame);
  els.playBtn?.addEventListener('click',     handlePlaySong);
  els.nextBtn?.addEventListener('click',     handleNextSong);
  els.pauseBtn?.addEventListener('click',    handlePauseGame);
  els.resumeBtn?.addEventListener('click',   handleResumeGame);
  els.endRoundBtn?.addEventListener('click', handleEndRound);

  // End Game — show confirmation modal instead of acting immediately
  const endGameModal   = document.querySelector('#end-game-modal');
  const endGameConfirm = document.querySelector('#end-game-confirm-btn');
  const endGameCancel  = document.querySelector('#end-game-cancel-btn');

  els.endBtn?.addEventListener('click', () => {
    endGameModal?.classList.remove('hidden');
  });
  endGameCancel?.addEventListener('click', () => {
    endGameModal?.classList.add('hidden');
  });
  endGameConfirm?.addEventListener('click', async () => {
    endGameModal?.classList.add('hidden');
    await handleEndGame();
  });
  // Close on backdrop click
  endGameModal?.addEventListener('click', (e) => {
    if (e.target === endGameModal) endGameModal.classList.add('hidden');
  });

  wireCopyJoin();
  wireSpotifyControls();

  // Auto-init Spotify if tokens already exist (returning from OAuth redirect)
  if (getStoredTokens()) {
    console.log('[app] Spotify tokens found — initializing player...');
    showSpotifyOverlay();
    initSpotify(); // intentionally not awaited
  }

  console.log('Music Bingo Host initialized');
}

init();