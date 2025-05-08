/**
 * Gemini AI API Helper Functions
 * 
 * This module provides functions for interacting with Google's Gemini AI API
 */

// Generate a response to a YouTube comment
async function generateCommentResponse(commentText, apiKey, options = {}) {
  try {
    const {
      style = 'friendly',
      maxTokens = 100,
      temperature = 0.7,
      includeVideoContext = false,
      videoTitle = '',
      videoDescription = ''
    } = options;
    
    // Build the prompt based on available context
    let prompt = `You are responding to a YouTube comment that says: "${commentText}". `;
    
    // Add video context if available
    if (includeVideoContext && videoTitle) {
      prompt += `This comment is on a video titled "${videoTitle}". `;
      
      if (videoDescription) {
        prompt += `The video description is: "${videoDescription}". `;
      }
    }
    
    // Add style instructions
    prompt += `Please generate a ${style} response that is appropriate for YouTube and maintains conversation. `;
    prompt += `Keep your response concise (under 200 characters if possible) and engaging.`;
    
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
            temperature: temperature,
            maxOutputTokens: maxTokens
          }
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    const result = await response.json();
    
    // Extract the generated text from the response
    if (result.candidates && result.candidates.length > 0 && 
        result.candidates[0].content && result.candidates[0].content.parts && 
        result.candidates[0].content.parts.length > 0) {
      return result.candidates[0].content.parts[0].text;
    } else {
      throw new Error('No response generated from Gemini API');
    }
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw error;
  }
}

// Test the API key to make sure it's valid
async function testGeminiApiKey(apiKey) {
  try {
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
                { text: "Hello, please respond with 'API key is valid'" }
              ]
            }
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 10
          }
        })
      }
    );
    
    if (!response.ok) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error testing Gemini API key:', error);
    return false;
  }
}

// Export functions
export {
  generateCommentResponse,
  testGeminiApiKey
}; 