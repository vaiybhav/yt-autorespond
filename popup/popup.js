// Popup script for YouTube Auto-Responder

document.addEventListener('DOMContentLoaded', () => {
  // Initial setup
  loadSettings();
  setupEventListeners();
  checkAuthStatus();
});

// Load saved settings from storage
function loadSettings() {
  chrome.storage.sync.get([
    'isEnabled', 
    'youtubeApiKey', 
    'geminiApiKey', 
    'targetVideoIds', 
    'responseStyle',
    'responseDelay',
    'keywordFilters'
  ], (data) => {
    // Set toggle state
    const enabledToggle = document.getElementById('enabled-toggle');
    enabledToggle.checked = data.isEnabled || false;
    document.getElementById('status-text').textContent = data.isEnabled ? 'Enabled' : 'Disabled';
    
    // Set API keys
    if (data.youtubeApiKey) {
      document.getElementById('youtube-api-key').value = data.youtubeApiKey;
    }
    
    if (data.geminiApiKey) {
      document.getElementById('gemini-api-key').value = data.geminiApiKey;
    }
    
    // Set response settings
    if (data.responseStyle) {
      document.getElementById('response-style').value = data.responseStyle;
    }
    
    if (data.responseDelay) {
      document.getElementById('response-delay').value = data.responseDelay;
    }
    
    // Populate target videos list
    const videoList = document.getElementById('video-list');
    if (data.targetVideoIds && data.targetVideoIds.length > 0) {
      // Clear empty state message
      videoList.innerHTML = '';
      
      // Add video list items
      data.targetVideoIds.forEach(videoId => {
        videoList.appendChild(createListItem(videoId, 'video'));
      });
    }
    
    // Populate keyword filters list
    const keywordList = document.getElementById('keyword-list');
    if (data.keywordFilters && data.keywordFilters.length > 0) {
      // Clear empty state message
      keywordList.innerHTML = '';
      
      // Add keyword list items
      data.keywordFilters.forEach(keyword => {
        keywordList.appendChild(createListItem(keyword, 'keyword'));
      });
    }
  });
}

// Set up all event listeners
function setupEventListeners() {
  // Toggle extension enabled/disabled
  const enabledToggle = document.getElementById('enabled-toggle');
  enabledToggle.addEventListener('change', () => {
    const isEnabled = enabledToggle.checked;
    document.getElementById('status-text').textContent = isEnabled ? 'Enabled' : 'Disabled';
    chrome.storage.sync.set({ isEnabled });
  });
  
  // Toggle API key visibility
  document.getElementById('toggle-youtube-key').addEventListener('click', () => {
    togglePasswordVisibility('youtube-api-key');
  });
  
  document.getElementById('toggle-gemini-key').addEventListener('click', () => {
    togglePasswordVisibility('gemini-api-key');
  });
  
  // Save API keys
  document.getElementById('save-keys').addEventListener('click', saveApiKeys);
  
  // Add target video
  document.getElementById('add-video').addEventListener('click', () => {
    addListItem('video-id', 'video-list', 'video');
  });
  
  // Add keyword filter
  document.getElementById('add-keyword').addEventListener('click', () => {
    addListItem('keyword-filter', 'keyword-list', 'keyword');
  });
  
  // Authentication button
  document.getElementById('auth-button').addEventListener('click', authenticateWithYouTube);
  
  // Save all settings
  document.getElementById('save-settings').addEventListener('click', saveAllSettings);
}

// Check YouTube authentication status
function checkAuthStatus() {
  chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
    const authStatus = document.getElementById('auth-status');
    const statusDot = authStatus.querySelector('.status-dot');
    const statusText = authStatus.querySelector('.status-text');
    
    if (response.isAuthorized) {
      statusDot.classList.remove('not-authorized');
      statusDot.classList.add('authorized');
      statusText.textContent = 'Authorized with YouTube';
      document.getElementById('auth-button').textContent = 'Reauthorize';
    } else {
      statusDot.classList.remove('authorized');
      statusDot.classList.add('not-authorized');
      statusText.textContent = 'Not authorized with YouTube';
    }
  });
}

// Toggle password field visibility
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
}

// Save API keys to storage
function saveApiKeys() {
  const youtubeApiKey = document.getElementById('youtube-api-key').value.trim();
  const geminiApiKey = document.getElementById('gemini-api-key').value.trim();
  
  if (youtubeApiKey && geminiApiKey) {
    chrome.storage.sync.set({ 
      youtubeApiKey,
      geminiApiKey
    }, () => {
      showFeedback('Keys saved successfully');
    });
  } else {
    showFeedback('Please enter both API keys', true);
  }
}

// Add item to a list (videos or keywords)
function addListItem(inputId, listId, type) {
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  
  if (!value) {
    showFeedback(`Please enter a ${type} ID`, true);
    return;
  }
  
  // Get existing values from storage
  const storageKey = type === 'video' ? 'targetVideoIds' : 'keywordFilters';
  
  chrome.storage.sync.get([storageKey], (data) => {
    const existingItems = data[storageKey] || [];
    
    // Check if item already exists
    if (existingItems.includes(value)) {
      showFeedback(`This ${type} is already in the list`, true);
      return;
    }
    
    // Add to storage
    const updatedItems = [...existingItems, value];
    chrome.storage.sync.set({ [storageKey]: updatedItems });
    
    // Add to UI
    const list = document.getElementById(listId);
    
    // Remove empty state if this is the first item
    if (existingItems.length === 0) {
      list.innerHTML = '';
    }
    
    list.appendChild(createListItem(value, type));
    input.value = '';
  });
}

// Create a list item element
function createListItem(value, type) {
  const listItem = document.createElement('div');
  listItem.className = 'list-item';
  
  const text = document.createElement('span');
  text.textContent = value;
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-button';
  deleteButton.textContent = '✕';
  deleteButton.setAttribute('data-value', value);
  deleteButton.setAttribute('data-type', type);
  deleteButton.addEventListener('click', removeListItem);
  
  listItem.appendChild(text);
  listItem.appendChild(deleteButton);
  
  return listItem;
}

// Remove item from a list
function removeListItem(event) {
  const value = event.target.getAttribute('data-value');
  const type = event.target.getAttribute('data-type');
  const storageKey = type === 'video' ? 'targetVideoIds' : 'keywordFilters';
  
  chrome.storage.sync.get([storageKey], (data) => {
    const existingItems = data[storageKey] || [];
    const updatedItems = existingItems.filter(item => item !== value);
    
    chrome.storage.sync.set({ [storageKey]: updatedItems }, () => {
      // Remove from UI
      event.target.parentElement.remove();
      
      // Show empty state if list is now empty
      const listId = type === 'video' ? 'video-list' : 'keyword-list';
      const list = document.getElementById(listId);
      
      if (updatedItems.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = type === 'video' 
          ? 'No target videos added yet' 
          : 'No keywords added. All comments will be processed.';
        
        list.appendChild(emptyState);
      }
    });
  });
}

// Authenticate with YouTube (using OAuth)
function authenticateWithYouTube() {
  // In a real implementation, this would start the OAuth flow
  // For now, we'll just show a message
  showFeedback('Auth flow would start here (not implemented in demo)');
  
  // In a real implementation, this would be the OAuth flow:
  // chrome.identity.launchWebAuthFlow({
  //   url: YOUR_OAUTH_URL,
  //   interactive: true
  // }, function(redirectUrl) {
  //   // Process the auth response...
  // });
}

// Save all settings at once
function saveAllSettings() {
  const responseStyle = document.getElementById('response-style').value;
  const responseDelay = parseInt(document.getElementById('response-delay').value, 10) || 60;
  
  chrome.storage.sync.set({
    responseStyle,
    responseDelay
  }, () => {
    showFeedback('All settings saved successfully');
  });
}

// Show feedback message
function showFeedback(message, isError = false) {
  // Check if a feedback element already exists
  let feedback = document.querySelector('.feedback');
  
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.className = 'feedback';
    document.body.appendChild(feedback);
  }
  
  feedback.textContent = message;
  feedback.style.backgroundColor = isError ? 'var(--error-color)' : 'var(--success-color)';
  feedback.style.color = 'white';
  feedback.style.padding = '8px 16px';
  feedback.style.borderRadius = '4px';
  feedback.style.position = 'fixed';
  feedback.style.bottom = '16px';
  feedback.style.left = '50%';
  feedback.style.transform = 'translateX(-50%)';
  feedback.style.zIndex = '1000';
  
  feedback.style.display = 'block';
  
  // Hide after a delay
  setTimeout(() => {
    feedback.style.display = 'none';
  }, 3000);
} 