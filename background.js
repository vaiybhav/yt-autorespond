// Background service worker for YouTube Auto-Responder

// Initialize when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  // Set default values in storage
  chrome.storage.sync.set({
    targetVideoIds: [],
    isEnabled: false,
    responseDelay: 60, // Default delay in seconds
    responseStyle: 'friendly',
    keywordFilters: [],
    lastChecked: null,
    advancedSettings: {
      enableSentimentAnalysis: true,
      maxResponsesPerDay: 50,
      blacklistedWords: ['spam', 'scam', 'hack'],
      autoModeration: true,
      customIntroduction: "",
      randomizeDelay: true, // Adds human-like randomness to delays
      prioritizeQuestions: true, // Questions get higher priority
      rememberCommenters: true // Track users you've replied to before
    },
    responseStats: {
      totalGenerated: 0,
      totalPosted: 0,
      todayCount: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    },
    commentHistory: {} // Store history of commenters and responses
  });
});

// Monitor for changes in the active tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    // Extract video ID from URL
    const videoId = new URL(tab.url).searchParams.get('v');
    
    if (videoId) {
      // Send message to content script with video ID
      chrome.tabs.sendMessage(tabId, {
        action: 'checkVideo',
        videoId: videoId
      });
    }
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchComments') {
    fetchNewComments(request.videoId)
      .then(comments => {
        if (comments.length > 0) {
          processComments(comments, request.videoId);
        }
        sendResponse({ success: true, commentCount: comments.length });
      })
      .catch(error => {
        console.error('Error fetching comments:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicate async response
  }
  
  if (request.action === 'checkAuth') {
    checkYouTubeAuth()
      .then(isAuthorized => {
        sendResponse({ isAuthorized });
      })
      .catch(error => {
        sendResponse({ isAuthorized: false, error: error.message });
      });
    return true; // Indicate async response
  }

  if (request.action === 'testAI') {
    const testComment = {
      id: "test_comment_id",
      snippet: {
        topLevelComment: {
          snippet: {
            textDisplay: request.testText || "This is a test comment. What do you think of this video?",
            authorDisplayName: "Test User"
          }
        }
      }
    };
    
    processTestComment(testComment, request.videoId)
      .then(response => {
        sendResponse({ success: true, response });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicate async response
  }

  if (request.action === 'getStats') {
    chrome.storage.sync.get(['responseStats'], (data) => {
      // Reset daily count if it's a new day
      const today = new Date().toISOString().split('T')[0];
      if (data.responseStats && data.responseStats.lastResetDate !== today) {
        const updatedStats = {
          ...data.responseStats,
          todayCount: 0,
          lastResetDate: today
        };
        chrome.storage.sync.set({ responseStats: updatedStats });
        sendResponse({ stats: updatedStats });
      } else {
        sendResponse({ stats: data.responseStats });
      }
    });
    return true; // Indicate async response
  }
});

// Process a test comment (for testing the AI response)
async function processTestComment(comment, videoId) {
  const data = await chrome.storage.sync.get([
    'geminiApiKey', 
    'responseStyle',
    'advancedSettings'
  ]);
  
  if (!data.geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }
  
  try {
    const commentText = comment.snippet.topLevelComment.snippet.textDisplay;
    const authorName = comment.snippet.topLevelComment.snippet.authorDisplayName;
    
    // Get video details if possible
    let videoContext = null;
    try {
      const youtubeData = await chrome.storage.sync.get(['youtubeApiKey']);
      if (youtubeData.youtubeApiKey) {
        videoContext = await getVideoDetails(videoId, youtubeData.youtubeApiKey);
      }
    } catch (err) {
      console.warn('Could not fetch video details:', err);
    }

    // Generate AI response
    const sentiment = data.advancedSettings.enableSentimentAnalysis ? 
      await analyzeSentiment(commentText, data.geminiApiKey) : 'neutral';
      
    const response = await generateAIResponse(
      commentText, 
      data.geminiApiKey, 
      data.responseStyle, 
      {
        sentiment,
        authorName,
        videoContext,
        customIntroduction: data.advancedSettings.customIntroduction
      }
    );
    
    return {
      commentText,
      response,
      sentiment
    };
  } catch (error) {
    console.error('Error processing test comment:', error);
    throw error;
  }
}

// Fetch new comments from YouTube API
async function fetchNewComments(videoId) {
  // Get YouTube API key from storage
  const data = await chrome.storage.sync.get(['youtubeApiKey', 'lastChecked']);
  const apiKey = data.youtubeApiKey;
  const lastChecked = data.lastChecked || new Date(0).toISOString();
  
  if (!apiKey) {
    throw new Error('YouTube API key not configured');
  }
  
  // Fetch comments from YouTube API
  const response = await fetch(
    `https://youtube.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&key=${apiKey}&maxResults=100&order=time`
  );
  
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }
  
  const result = await response.json();
  const comments = result.items || [];
  
  // Filter comments that are newer than the last check
  const newComments = comments.filter(comment => {
    const publishedAt = comment.snippet.topLevelComment.snippet.publishedAt;
    return publishedAt > lastChecked;
  });
  
  // Update last checked timestamp
  chrome.storage.sync.set({ lastChecked: new Date().toISOString() });
  
  return newComments;
}

// Process new comments and generate responses
async function processComments(comments, videoId) {
  const data = await chrome.storage.sync.get([
    'isEnabled', 
    'geminiApiKey', 
    'responseStyle',
    'responseDelay',
    'keywordFilters',
    'advancedSettings',
    'responseStats',
    'commentHistory'
  ]);
  
  if (!data.isEnabled || !data.geminiApiKey) {
    return;
  }

  // Check daily limit
  const advSettings = data.advancedSettings || {};
  const stats = data.responseStats || { totalGenerated: 0, totalPosted: 0, todayCount: 0 };
  const maxResponses = advSettings.maxResponsesPerDay || 50;
  
  if (stats.todayCount >= maxResponses) {
    console.log(`Daily response limit of ${maxResponses} reached`);
    return;
  }
  
  // Filter comments based on keywords if needed
  let filteredComments = comments;
  if (data.keywordFilters && data.keywordFilters.length > 0) {
    filteredComments = comments.filter(comment => {
      const text = comment.snippet.topLevelComment.snippet.textDisplay.toLowerCase();
      return data.keywordFilters.some(keyword => text.includes(keyword.toLowerCase()));
    });
  }

  // Filter out blacklisted words
  if (advSettings.autoModeration && advSettings.blacklistedWords) {
    filteredComments = filteredComments.filter(comment => {
      const text = comment.snippet.topLevelComment.snippet.textDisplay.toLowerCase();
      return !advSettings.blacklistedWords.some(word => text.includes(word.toLowerCase()));
    });
  }

  // Prioritize comments if needed
  if (advSettings.prioritizeQuestions) {
    filteredComments.sort((a, b) => {
      const textA = a.snippet.topLevelComment.snippet.textDisplay;
      const textB = b.snippet.topLevelComment.snippet.textDisplay;
      
      // Check if comment contains a question mark
      const isQuestionA = textA.includes('?');
      const isQuestionB = textB.includes('?');
      
      if (isQuestionA && !isQuestionB) return -1;
      if (!isQuestionA && isQuestionB) return 1;
      return 0;
    });
  }
  
  // Get video details once for context
  let videoContext = null;
  try {
    const youtubeData = await chrome.storage.sync.get(['youtubeApiKey']);
    if (youtubeData.youtubeApiKey) {
      videoContext = await getVideoDetails(videoId, youtubeData.youtubeApiKey);
    }
  } catch (err) {
    console.warn('Could not fetch video details:', err);
  }

  // Generate and post responses (up to daily limit)
  const remainingResponses = maxResponses - stats.todayCount;
  const commentsToProcess = filteredComments.slice(0, remainingResponses);
  
  // Generate and post responses
  for (const comment of commentsToProcess) {
    const commentId = comment.id;
    const commentText = comment.snippet.topLevelComment.snippet.textDisplay;
    const authorName = comment.snippet.topLevelComment.snippet.authorDisplayName;
    const authorId = comment.snippet.topLevelComment.snippet.authorChannelId?.value;
    
    // Check if we've already responded to this user if tracking is enabled
    if (advSettings.rememberCommenters && authorId) {
      const commentHistory = data.commentHistory || {};
      if (commentHistory[authorId] && commentHistory[authorId].length >= 3) {
        console.log(`Already responded to ${authorName} multiple times, skipping`);
        continue;
      }
    }
    
    try {
      // Analyze sentiment if enabled
      let sentiment = 'neutral';
      if (advSettings.enableSentimentAnalysis) {
        sentiment = await analyzeSentiment(commentText, data.geminiApiKey);
      }
      
      // Generate AI response
      const response = await generateAIResponse(
        commentText, 
        data.geminiApiKey, 
        data.responseStyle, 
        {
          sentiment,
          authorName,
          videoContext,
          customIntroduction: advSettings.customIntroduction
        }
      );
      
      // Update stats
      const updatedStats = {
        totalGenerated: (stats.totalGenerated || 0) + 1,
        totalPosted: stats.totalPosted || 0,
        todayCount: (stats.todayCount || 0) + 1,
        lastResetDate: stats.lastResetDate || new Date().toISOString().split('T')[0]
      };
      
      // Update comment history
      if (advSettings.rememberCommenters && authorId) {
        const commentHistory = data.commentHistory || {};
        const authorHistory = commentHistory[authorId] || [];
        
        commentHistory[authorId] = [
          ...authorHistory, 
          {
            date: new Date().toISOString(),
            comment: commentText,
            response
          }
        ].slice(-5); // Keep only the 5 most recent interactions
        
        chrome.storage.sync.set({ commentHistory });
      }
      
      // Save updated stats
      chrome.storage.sync.set({ responseStats: updatedStats });
      
      // Add randomized delay if enabled
      let delayTime = data.responseDelay;
      if (advSettings.randomizeDelay) {
        // Add 0-30% random variation to make it seem more human
        const randomFactor = 1 + (Math.random() * 0.3);
        delayTime = Math.floor(delayTime * randomFactor);
      }
      
      // Add delay before posting response
      setTimeout(async () => {
        const postResult = await postCommentReply(commentId, response, videoId);
        
        if (postResult && postResult.success) {
          // Update posted count if successfully posted
          chrome.storage.sync.get(['responseStats'], (data) => {
            const stats = data.responseStats || {};
            chrome.storage.sync.set({
              responseStats: {
                ...stats,
                totalPosted: (stats.totalPosted || 0) + 1
              }
            });
          });
        }
      }, delayTime * 1000);
    } catch (error) {
      console.error('Error processing comment:', error);
    }
  }
}

// Analyze sentiment of a comment
async function analyzeSentiment(commentText, apiKey) {
  try {
    const prompt = `Analyze the sentiment of this YouTube comment: "${commentText}". 
    Respond with only one of these words: "positive", "negative", or "neutral".`;
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10
          }
        })
      }
    );
    
    if (!response.ok) {
      return 'neutral'; // Default in case of error
    }
    
    const result = await response.json();
    const sentiment = result.candidates[0].content.parts[0].text.toLowerCase().trim();
    
    // Ensure we only return one of the expected values
    if (['positive', 'negative', 'neutral'].includes(sentiment)) {
      return sentiment;
    } else {
      return 'neutral';
    }
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    return 'neutral'; // Default in case of error
  }
}

// Get video details from YouTube API
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
      return null;
    }
    
    return {
      title: data.items[0].snippet.title,
      description: data.items[0].snippet.description,
      channelTitle: data.items[0].snippet.channelTitle
    };
  } catch (error) {
    console.error('Error fetching video details:', error);
    return null;
  }
}

// Generate AI response using Gemini API
async function generateAIResponse(commentText, apiKey, style, options = {}) {
  const {
    sentiment = 'neutral',
    authorName = '',
    videoContext = null,
    customIntroduction = ''
  } = options;
  
  // Build context-aware prompt based on sentiment and video info
  let prompt = `You are responding to a YouTube comment by ${authorName || "a viewer"} that says: "${commentText}".`;
  
  if (videoContext) {
    prompt += ` This comment is on a video titled "${videoContext.title}" from the channel "${videoContext.channelTitle}".`;
  }
  
  prompt += ` The sentiment of this comment appears to be ${sentiment}.`;
  
  // Add style instructions
  prompt += ` Please generate a ${style} response that is appropriate for YouTube and maintains conversation.`;
  
  // Add custom introduction if provided
  if (customIntroduction) {
    prompt += ` Start your response with a variation of: "${customIntroduction}"`;
  }
  
  // Add specific instructions based on sentiment
  if (sentiment === 'positive') {
    prompt += ` The viewer seems positive, so acknowledge their enthusiasm in your reply.`;
  } else if (sentiment === 'negative') {
    prompt += ` The viewer seems concerned or negative, so be understanding and helpful in your reply.`;
  } else if (commentText.includes('?')) {
    prompt += ` The viewer is asking a question, so make sure to address it directly.`;
  }
  
  prompt += ` Keep your response concise (under 200 characters if possible), engaging, and conversational.`;
  
  // Make request to Gemini API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 100
        }
      })
    }
  );
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  
  const result = await response.json();
  return result.candidates[0].content.parts[0].text;
}

// Post reply to a comment using YouTube API
async function postCommentReply(commentId, responseText, videoId) {
  // Check if we're authorized to post
  const isAuth = await checkYouTubeAuth();
  
  // If not authorized, just log the response
  if (!isAuth) {
    console.log(`Would post to comment ${commentId} on video ${videoId}: ${responseText}`);
    return { success: false, message: 'Not authorized' };
  }
  
  try {
    // Get the access token
    const tokenData = await chrome.storage.local.get(['youtube_access_token']);
    const accessToken = tokenData.youtube_access_token;
    
    if (!accessToken) {
      throw new Error('No access token available');
    }
    
    // Post the reply using YouTube API
    const response = await fetch('https://youtube.googleapis.com/youtube/v3/comments?part=snippet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        snippet: {
          parentId: commentId,
          textOriginal: responseText
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`Posted reply to comment ${commentId}: ${responseText}`);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error posting reply:', error);
    return { success: false, error: error.message };
  }
}

// Check if user is authenticated with YouTube
async function checkYouTubeAuth() {
  try {
    const data = await chrome.storage.local.get(['youtube_access_token', 'youtube_token_expiration']);
    const accessToken = data.youtube_access_token;
    const tokenExpiration = data.youtube_token_expiration || 0;
    
    // Check if token exists and is not expired
    if (accessToken && Date.now() < tokenExpiration) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking auth:', error);
    return false;
  }
} 