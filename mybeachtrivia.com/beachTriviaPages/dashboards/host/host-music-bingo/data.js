// data.js — simple in-memory data layer you can replace with Firebase

// Mock playlists
const playlists = [
    {
      id: 'pl-80s',
      name: '80s Bangers',
      songs: Array.from({ length: 25 }, (_, i) => ({ title: `80s Track ${i+1}`, artist: 'Various' })),
    },
    {
      id: 'pl-90s',
      name: '90s Hits',
      songs: Array.from({ length: 25 }, (_, i) => ({ title: `90s Track ${i+1}`, artist: 'Various' })),
    },
  ];
  
  const games = new Map();
  
  export async function fetchPlaylists() {
    // replace with Firestore later
    return playlists;
  }
  
  export async function createGame({ playlistId, name, playerLimit }) {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');
  
    const id = 'g_' + Math.random().toString(36).slice(2, 9);
    const game = {
      id,
      name: name || 'Music Bingo',
      playlistId,
      playlistName: pl.name,
      status: 'active',
      playerLimit: playerLimit ?? null,
      playerCount: 0,
      currentSongIndex: -1,
      createdAt: new Date().toISOString(),
    };
    games.set(id, game);
    return structuredClone(game);
  }
  
  export async function getGame(id) {
    const g = games.get(id);
    if (!g) throw new Error('Game not found');
    return structuredClone(g);
  }
  
  export async function updateGameStatus(id, status) {
    const g = games.get(id);
    if (!g) throw new Error('Game not found');
    g.status = status;
    games.set(id, g);
    return structuredClone(g);
  }
  
  export async function updateGameSongIndex(id, index) {
    const g = games.get(id);
    if (!g) throw new Error('Game not found');
    const pl = playlists.find(p => p.id === g.playlistId);
    const max = (pl?.songs?.length ?? 0) - 1;
    g.currentSongIndex = Math.max(0, Math.min(index, max));
    games.set(id, g);
    return structuredClone(g);
  }
  
  export async function getPlayerCount(id) {
    const g = games.get(id);
    if (!g) return 0;
    return g.playerCount ?? 0; // keep 0 for now
  }