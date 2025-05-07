const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors')({ origin: true });
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Initialize Firebase admin
admin.initializeApp();

// Create Express app
const app = express();
app.use(cors);
app.use(cookieParser());

// Environment configuration
// IMPORTANT: Set these using Firebase Functions environment variables:
// firebase functions:config:set spotify.client_id="YOUR_CLIENT_ID" spotify.client_secret="YOUR_CLIENT_SECRET"
const getConfig = () => {
  return {
    CLIENT_ID: functions.config().spotify?.client_id || process.env.SPOTIFY_CLIENT_ID,
    CLIENT_SECRET: functions.config().spotify?.client_secret || process.env.SPOTIFY_CLIENT_SECRET,
    REDIRECT_URI: functions.config().spotify?.redirect_uri || "https://beach-trivia-website.web.app/spotifyCallback",
    SCOPES: [
      'streaming',
      'user-read-email',
      'user-read-private',
      'user-modify-playback-state',
      'user-read-playback-state',
      'user-read-currently-playing'
    ],
    ALLOWED_ORIGINS: [
      'https://mybeachtrivia.com',
      'https://beach-trivia-website.web.app',
      'https://beach-trivia-website.firebaseapp.com',
      'http://localhost:5050'  // For local development
    ]
  };
};

// Generate a random string for state parameter
function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

// Redirect to Spotify authorization page
app.get('/spotifyLogin', (req, res) => {
  try {
    const config = getConfig();
    
    // Generate random state for CSRF protection
    const state = generateRandomString(16);
    
    // Store state in database for verification (more secure than cookies for serverless)
    const stateRef = admin.database().ref(`spotify_states/${state}`);
    stateRef.set({
      created: admin.database.ServerValue.TIMESTAMP,
      // Add IP or other info for additional security if needed
      ip: req.ip
    });
    
    // Build the Spotify authorization URL
    const authorizeUrl = 'https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: config.CLIENT_ID,
        scope: config.SCOPES.join(' '),
        redirect_uri: config.REDIRECT_URI,
        state: state
      });
    
    console.log(`Redirecting to Spotify authorization: ${authorizeUrl}`);
    
    // Redirect to Spotify
    res.redirect(authorizeUrl);
  } catch (error) {
    console.error('Error in spotifyLogin:', error);
    res.status(500).send('Failed to initiate Spotify login');
  }
});

// Handle callback from Spotify
app.get('/spotifyCallback', async (req, res) => {
  try {
    const config = getConfig();
    const { code, state, error } = req.query;
    
    // Handle authorization errors from Spotify
    if (error) {
      console.error('Spotify authorization error:', error);
      return res.redirect(`/spotify-callback.html?error=${encodeURIComponent(error)}`);
    }
    
    // Verify state parameter to prevent CSRF attacks
    if (!state) {
      console.error('No state parameter provided');
      return res.redirect('/spotify-callback.html?error=invalid_state');
    }
    
    // Verify state from database
    const stateRef = admin.database().ref(`spotify_states/${state}`);
    const stateSnapshot = await stateRef.once('value');
    const stateData = stateSnapshot.val();
    
    if (!stateData) {
      console.error('Invalid state parameter');
      return res.redirect('/spotify-callback.html?error=invalid_state');
    }
    
    // Delete the used state to prevent replay attacks
    await stateRef.remove();
    
    // Check for authorization code
    if (!code) {
      console.error('No authorization code provided');
      return res.redirect('/spotify-callback.html?error=missing_code');
    }
    
    // Exchange authorization code for tokens
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      data: querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.REDIRECT_URI,
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Extract tokens and expiration
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Generate a secure token ID for this session
    const tokenId = generateRandomString(32);
    
    // Store tokens securely in Firebase Database
    // This prevents exposing the client secret while allowing token refresh
    await admin.database().ref(`spotify_tokens/${tokenId}`).set({
      refresh_token: refresh_token,
      created_at: admin.database.ServerValue.TIMESTAMP
    });
    
    // Redirect to callback page with token data
    // We only pass what the client needs to know
    const callbackUrl = `/spotify-callback.html?` + 
      querystring.stringify({
        success: 'true',
        access_token: access_token,
        expires_in: expires_in,
        token_id: tokenId
      });
    
    console.log('Redirecting to callback with tokens');
    res.redirect(callbackUrl);
    
  } catch (error) {
    console.error('Error in spotifyCallback:', error.response?.data || error.message);
    res.redirect('/spotify-callback.html?error=token_exchange_failed');
  }
});

// Refresh access token
app.post('/refreshToken', async (req, res) => {
  try {
    const config = getConfig();
    const { token_id } = req.body;
    
    if (!token_id) {
      return res.status(400).json({ error: 'No token ID provided' });
    }
    
    // Get refresh token from database
    const tokenRef = admin.database().ref(`spotify_tokens/${token_id}`);
    const tokenSnapshot = await tokenRef.once('value');
    const tokenData = tokenSnapshot.val();
    
    if (!tokenData || !tokenData.refresh_token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    // Request new access token from Spotify
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      data: querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refresh_token,
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Extract new tokens
    const { access_token, expires_in, refresh_token } = tokenResponse.data;
    
    // Update refresh token if a new one was provided
    if (refresh_token) {
      await tokenRef.update({ refresh_token: refresh_token });
    }
    
    // Update last used timestamp
    await tokenRef.update({ last_used: admin.database.ServerValue.TIMESTAMP });
    
    // Return the new access token and expiry to client
    res.json({
      access_token: access_token,
      expires_in: expires_in
    });
    
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Revoke tokens (for logout)
app.post('/revokeToken', async (req, res) => {
  try {
    const { token_id } = req.body;
    
    if (!token_id) {
      return res.status(400).json({ error: 'No token ID provided' });
    }
    
    // Remove token from database
    await admin.database().ref(`spotify_tokens/${token_id}`).remove();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking token:', error);
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

// Cleanup function to remove old state parameters (runs daily)
exports.cleanupSpotifyStates = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      const statesRef = admin.database().ref('spotify_states');
      const statesSnapshot = await statesRef.once('value');
      const states = statesSnapshot.val();
      
      if (!states) return null;
      
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      
      // Find and remove old states
      const updates = {};
      Object.keys(states).forEach(stateKey => {
        const state = states[stateKey];
        if (state.created < oneDayAgo) {
          updates[stateKey] = null;
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await statesRef.update(updates);
        console.log(`Removed ${Object.keys(updates).length} expired state parameters`);
      }
      
      return null;
    } catch (error) {
      console.error('Error cleaning up states:', error);
      return null;
    }
  });

// Cleanup function to remove very old tokens (runs weekly)
exports.cleanupSpotifyTokens = functions.pubsub
  .schedule('every 168 hours')
  .onRun(async (context) => {
    try {
      const tokensRef = admin.database().ref('spotify_tokens');
      const tokensSnapshot = await tokensRef.once('value');
      const tokens = tokensSnapshot.val();
      
      if (!tokens) return null;
      
      const now = Date.now();
      const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
      
      // Find and remove tokens not used in 6 months
      const updates = {};
      Object.keys(tokens).forEach(tokenKey => {
        const token = tokens[tokenKey];
        const lastUsed = token.last_used || token.created_at;
        
        if (lastUsed < sixMonthsAgo) {
          updates[tokenKey] = null;
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await tokensRef.update(updates);
        console.log(`Removed ${Object.keys(updates).length} expired tokens`);
      }
      
      return null;
    } catch (error) {
      console.error('Error cleaning up tokens:', error);
      return null;
    }
  });

// Export the Express app as Cloud Functions
exports.spotify = functions.https.onRequest(app);