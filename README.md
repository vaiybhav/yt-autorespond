# YouTube Auto-Responder

A Chrome extension that automatically responds to comments on specific YouTube videos using Gemini AI.

## Features

- Monitor comments on specific YouTube videos
- Generate AI-powered responses using Google's Gemini AI
- Customize response style and tone
- Set auto-response delays to appear more natural
- Filter comments based on keywords or patterns

## Setup Instructions

### Prerequisites

- Google Chrome browser
- Google Cloud Platform account
- YouTube Data API key
- Gemini AI API key

### Installation

1. Clone this repository
2. Navigate to `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

### Configuration

1. Configure your API keys in the extension settings
2. Set the target YouTube video ID
3. Customize response preferences
4. Authorize the extension to interact with your YouTube account

## Technical Details

The extension uses:
- Chrome Extension Manifest V3
- YouTube Data API v3 for comment monitoring
- Gemini AI API for response generation
- OAuth 2.0 for YouTube comment authentication

## Project Structure

```
yt-autorespond/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── content.js             # YouTube page integration
├── popup/                 # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── scripts/               # Helper scripts
│   ├── youtube-api.js
│   ├── gemini-api.js
│   └── auth.js
└── assets/                # Images and icons
    └── icons/
```

## Privacy & Security

This extension requires specific permissions to function correctly. Your API keys are stored locally and are not transmitted anywhere except to their respective services (YouTube API and Gemini AI API).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.