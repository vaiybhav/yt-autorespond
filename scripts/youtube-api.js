/**
 * YouTube API Helper Functions
 * 
 * This module provides functions for interacting with the YouTube Data API v3
 */

// Get new comments for a specific video
async function fetchVideoComments(videoId, apiKey, pageToken = null) {
  try {
    let url = `https://youtube.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&key=${apiKey}&maxResults=100&order=time`;
    
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching comments:', error);
    throw error;
  }
}

// Post a reply to a comment (requires OAuth token)
async function postCommentReply(commentId, text, accessToken) {
  try {
    const response = await fetch('https://youtube.googleapis.com/youtube/v3/comments?part=snippet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        snippet: {
          parentId: commentId,
          textOriginal: text
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error posting reply:', error);
    throw error;
  }
}

// Get basic video details
async function getVideoDetails(videoId, apiKey) {
  try {
    const response = await fetch(
      `https://youtube.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }
    
    return data.items[0].snippet;
  } catch (error) {
    console.error('Error fetching video details:', error);
    throw error;
  }
}

// Filter comments that are newer than a given date
function filterNewComments(comments, lastCheckedDate) {
  if (!comments || !comments.items) {
    return [];
  }
  
  return comments.items.filter(comment => {
    const publishedAt = comment.snippet.topLevelComment.snippet.publishedAt;
    return new Date(publishedAt) > new Date(lastCheckedDate);
  });
}

// Export functions
export {
  fetchVideoComments,
  postCommentReply,
  getVideoDetails,
  filterNewComments
}; 