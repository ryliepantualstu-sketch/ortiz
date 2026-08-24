let API_URL = 'http://localhost:3000/api';

async function probeApiPorts() {
    const baseHost = 'http://localhost';
    const portsToTry = [3000, 3001, 3002, 3003, 3004, 3005];
    for (const port of portsToTry) {
        try {
            const res = await fetch(`${baseHost}:${port}/api/health`, { method: 'GET' });
            if (res && res.ok) {
                API_URL = `${baseHost}:${port}/api`;
                return true;
            }
        } catch (e) {
            // ignore and try next port
        }
    }
    return false;
}

// Check API status
async function checkApiStatus() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
            updateApiStatus(true, 'Connected');
        } else {
            updateApiStatus(false, 'API Error');
        }
    } catch (error) {
        updateApiStatus(false, 'Connection Failed');
    }
}

function updateApiStatus(isConnected, message) {
    const statusEl = document.getElementById('apiStatus');
    if (!statusEl) {
        return;
    }

    if (isConnected) {
        statusEl.classList.remove('error');
        statusEl.innerHTML = `<i class="fas fa-check-circle"></i> API Status: ${message}`;
    } else {
        statusEl.classList.add('error');
        statusEl.innerHTML = `<i class="fas fa-times-circle"></i> API Status: ${message}`;
    }
}

// Function to make API calls
function handleUnauthorizedResponse() {
    console.warn('Unauthorized or forbidden response received. Clearing session.');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    const redirectUrl = `${window.location.origin}/index.html`;
    if (!window.location.href.endsWith('/index.html') && !window.location.href.endsWith('/')) {
        window.location.href = redirectUrl;
    }
}

async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const token = localStorage.getItem('token');
    console.log('API Call:', method, endpoint);
    console.log('Token present:', !!token);
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
        console.log('Auth header set');
    }

    if (data) {
        options.body = JSON.stringify(data);
        console.log('Request body:', data);
    }

    try {
        console.log('Fetching:', `${API_URL}${endpoint}`);
        const response = await fetch(`${API_URL}${endpoint}`, options);
        const contentType = response.headers.get('content-type') || '';
        let result;

        if (contentType.includes('application/json')) {
            result = await response.json();
        } else {
            const text = await response.text();
            try {
                result = JSON.parse(text);
            } catch (e) {
                result = { success: false, message: text || 'Non-JSON response from API' };
            }
        }

        console.log('Response status:', response.status);
        console.log('Response:', result);

        if (response.status === 401 || response.status === 403) {
            handleUnauthorizedResponse();
            return {
                success: false,
                status: response.status,
                message: result.message || 'Authentication required'
            };
        }

        if (!response.ok) {
            console.error('API Error:', response.status, result);
        }

        return {
            ...result,
            status: response.status
        };
    } catch (error) {
        console.error('Network error:', error);
        return { success: false, message: 'Network error', error: error.message };
    }
}

// Restore session from token (for page refresh)
async function restoreSession() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    
    // If no token, session is not valid
    if (!token) {
        console.log('No token found, session not valid');
        return null;
    }
    
    // If we have both token and user, session is restored
    if (token && user) {
        console.log('Session restored from localStorage:', user.full_name);
        return user;
    }
    
    // If only token, verify it with the server
    try {
        console.log('Validating token with server...');
        const result = await apiCall('/auth/me');
        if (result.success && result.user) {
            // Save user info to localStorage
            localStorage.setItem('user', JSON.stringify(result.user));
            console.log('Session verified and restored:', result.user.full_name);
            return result.user;
        } else {
            console.log('Token validation failed');
            // Clear invalid token
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            return null;
        }
    } catch (error) {
        console.error('Error validating token:', error);
        return null;
    }
}

// Check API on page load
window.addEventListener('DOMContentLoaded', async () => {
    // try to detect which local port the API is running on (makes dev server restarts resilient)
    await probeApiPorts();
    checkApiStatus();
});

// Ensure buttons without an explicit type don't act as form submit buttons
window.addEventListener('DOMContentLoaded', () => {
    try {
        document.querySelectorAll('button:not([type])').forEach(btn => btn.setAttribute('type', 'button'));
        console.log('Normalized button types to avoid accidental submits');
    } catch (e) {
        console.warn('Failed to normalize button types', e);
    }
});
