// mybeachtrivia.com/functions_gcfv1/spotify.js
//
// Spotify server-side token exchange for the Music Bingo host console
// (beachTriviaPages/dashboards/host/host-music-bingo/spotify.js →
//  /spAuth + /spotifyCallback). Handles both the authorization_code and
// refresh_token grants so the client never holds the client secret.
//
//   POST https://us-central1-beach-trivia-website.cloudfunctions.net/spotifyTokenExchange
//   body: { code, redirectUri } | { refreshToken }
//
// SPOTIFY_CLIENT_SECRET must be set in functions_gcfv1/.env.
//
// NOTE (2026-09-01): recovered verbatim from the deployed artifact
// (gs://gcf-sources-459479368322-us-central1/spotifyTokenExchange-…/version-4)
// after the definition was dropped from index.js in an earlier refactor while
// the function stayed live. See CLAUDE.md "sourceless functions".

const functions = require("firebase-functions/v1");

const SPOTIFY_CLIENT_ID = "da61dc149839439299554f1dc4455f1b";
const SPOTIFY_ALLOWED_ORIGINS = [
  "https://mybeachtrivia.com",
  "https://beach-trivia-website.web.app",
  "https://beach-trivia-website.firebaseapp.com",
];

exports.spotifyTokenExchange = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    // CORS
    const origin = req.headers.origin || "";
    const allowedOrigin = SPOTIFY_ALLOWED_ORIGINS.includes(origin)
      ? origin
      : SPOTIFY_ALLOWED_ORIGINS[0];
    res.set("Access-Control-Allow-Origin", allowedOrigin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientSecret) {
      functions.logger.error("[spotifyTokenExchange] SPOTIFY_CLIENT_SECRET not configured");
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${clientSecret}`).toString("base64");
    const body = req.body || {};

    let params;
    if (body.refreshToken) {
      // Refresh flow
      if (typeof body.refreshToken !== "string") {
        res.status(400).json({ error: "refreshToken must be a string" }); return;
      }
      params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: body.refreshToken,
      });
    } else {
      // Initial authorization_code flow
      const { code, redirectUri } = body;
      if (!code || !redirectUri) {
        res.status(400).json({ error: "Missing code or redirectUri" }); return;
      }
      params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });
    }

    try {
      const spotifyRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await spotifyRes.json();

      if (!spotifyRes.ok) {
        functions.logger.warn("[spotifyTokenExchange] Spotify error:", data);
        res.status(spotifyRes.status).json({
          error: data.error_description || data.error || "Token exchange failed",
        });
        return;
      }

      res.status(200).json({
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        expires_in: data.expires_in,
      });
    } catch (e) {
      functions.logger.error("[spotifyTokenExchange] fetch failed:", e);
      res.status(500).json({ error: "Token exchange request failed" });
    }
  });
