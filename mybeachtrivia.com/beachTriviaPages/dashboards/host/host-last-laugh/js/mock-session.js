export function copyDisplayLink(gameId) {
    const url = `${window.location.origin}/beachTriviaPages/games/last-laugh/display.html?gameId=${encodeURIComponent(gameId)}`;
    return navigator.clipboard.writeText(url);
  }