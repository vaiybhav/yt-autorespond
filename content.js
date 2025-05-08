// Content script for YouTube Auto-Responder
// This script runs on YouTube pages and interacts with the page DOM

// Store the current video ID if we're on a video page
let currentVideoId = null;

// Check if we're on a video page on initial load
checkIfVideoPage();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkVideo') {
    currentVideoId = request.videoId;
    
    // Check if this video is in our target list
    checkIfTargetVideo(currentVideoId);
  }
  
  // Always return true to indicate success
  return true;
});

// Check if current page is a YouTube video
function checkIfVideoPage() {
  if (window.location.hostname === 'www.youtube.com' && window.location.pathname === '/watch') {
    const urlParams = new URLSearchParams(window.location.search);
    currentVideoId = urlParams.get('v');
    
    if (currentVideoId) {
      // Check if this video is in our target list
      checkIfTargetVideo(currentVideoId);
    }
  }
}

// Check if current video is in our target list
async function checkIfTargetVideo(videoId) {
  const data = await chrome.storage.sync.get(['targetVideoIds', 'isEnabled']);
  
  if (!data.isEnabled) {
    return;
  }
  
  const isTarget = data.targetVideoIds.includes(videoId);
  
  if (isTarget) {
    // If this is a target video, start monitoring for comments
    console.log(`Monitoring comments for video ID: ${videoId}`);
    
    // Send message to background script to fetch comments
    chrome.runtime.sendMessage({
      action: 'fetchComments',
      videoId: videoId
    });
    
    // Set up periodic checks for new comments (every 2 minutes)
    setInterval(() => {
      chrome.runtime.sendMessage({
        action: 'fetchComments',
        videoId: videoId
      });
    }, 2 * 60 * 1000);
  }
}

// Mutation observer to detect when comments load or new comments are added
const commentObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      const commentsSection = document.querySelector('#comments');
      if (commentsSection && currentVideoId) {
        // Comments section has loaded or been updated
        // This could be used for a more DOM-based approach to comment monitoring
        // For now, we're using the YouTube API in the background script
      }
    }
  }
});

// Start observing the comments section
function observeComments() {
  const commentsSection = document.querySelector('#comments');
  if (commentsSection) {
    commentObserver.observe(commentsSection, { 
      childList: true,
      subtree: true 
    });
  }
}

// Run this when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // Wait for comments to load
  setTimeout(observeComments, 3000);
});

// Also handle navigation changes (YouTube is a SPA)
window.addEventListener('yt-navigate-finish', () => {
  // Page navigation has occurred
  checkIfVideoPage();
  setTimeout(observeComments, 3000);
}); 