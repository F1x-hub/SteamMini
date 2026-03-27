/**
 * Decodes a base64 string safely
 * @param {string} str 
 * @returns {string}
 */
const decodeBase64 = (str) => {
  try {
    return decodeURIComponent(atob(str).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  } catch (e) {
    return atob(str);
  }
};

/**
 * Checks if a JWT token is expired by parsing its payload.
 * @param {string} token 
 * @returns {boolean} True if expired or invalid, false otherwise.
 */
export const isTokenExpired = (token) => {
  if (!token) return true;
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    
    // Replace base64url characters with base64 characters
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode payload
    const jsonPayload = decodeBase64(base64);
    const payload = JSON.parse(jsonPayload);
    
    if (!payload.exp) return true;
    
    // payload.exp is typically in seconds. Date.now() is in milliseconds.
    const currentTime = Math.floor(Date.now() / 1000);
    // Return true if expired, false if it's still good.
    // Adding a 5-minute buffer
    return payload.exp < (currentTime + 300);
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return true; // Treat as expired securely if valid parsing fails
  }
};
