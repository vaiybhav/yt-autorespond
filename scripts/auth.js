/**
 * Authentication Helper Functions
 * 
 * This module provides functions for handling OAuth authentication with YouTube
 */

// Constants for OAuth flow
const OAUTH_CLIENT_ID = ''; // You will need to add your own client ID
const REDIRECT_URL = chrome.identity.getRedirectURL();
const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl' // Required for comment posting
];

// Start the OAuth authentication flow
function startAuthFlow() {
  return new Promise((resolve, reject) => {
    // Create the OAuth 2.0 authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
    
    authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URL);
    authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));
    
    // Launch the auth flow
    chrome.identity.launchWebAuthFlow(
      { 
        url: authUrl.toString(), 
        interactive: true 
      },
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (!redirectUrl) {
          reject(new Error('No redirect URL received'));
          return;
        }
        
        // Extract the access token from the redirect URL
        const url = new URL(redirectUrl);
        const params = new URLSearchParams(url.hash.substring(1)); // Remove '#' prefix
        const accessToken = params.get('access_token');
        const expiresIn = params.get('expires_in');
        
        if (!accessToken) {
          reject(new Error('No access token received'));
          return;
        }
        
        // Calculate expiration time
        const expirationTime = Date.now() + (parseInt(expiresIn, 10) * 1000);
        
        // Store the token in chrome.storage.local
        chrome.storage.local.set({
          'youtube_access_token': accessToken,
          'youtube_token_expiration': expirationTime
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          
          resolve(accessToken);
        });
      }
    );
  });
}

// Check if user is currently authenticated
async function isAuthenticated() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['youtube_access_token', 'youtube_token_expiration'], (data) => {
      const accessToken = data.youtube_access_token;
      const tokenExpiration = data.youtube_token_expiration;
      
      // Check if token exists and is not expired
      if (accessToken && tokenExpiration && Date.now() < tokenExpiration) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// Get the current access token (refreshing if needed)
async function getAccessToken() {
  const isAuth = await isAuthenticated();
  
  if (isAuth) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['youtube_access_token'], (data) => {
        resolve(data.youtube_access_token);
      });
    });
  }
  
  // Not authenticated or token expired, start a new auth flow
  return startAuthFlow();
}

// Clear stored tokens (logout)
async function clearAuthentication() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      ['youtube_access_token', 'youtube_token_expiration'], 
      () => {
        resolve();
      }
    );
  });
}

// Export functions
export {
  startAuthFlow,
  isAuthenticated,
  getAccessToken,
  clearAuthentication
}; 