// Client-side API fetch wrapper
export async function api(action, payload = {}) {
    const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
    });
    
    // We expect the proxy to return data
    const data = await res.json();
    
    if (!res.ok) {
        throw new Error(data.error || 'HTTP ' + res.status);
    }
    
    if (data && data.error) {
        console.error("Error desde API Proxy:", data.error);
        throw new Error(data.error);
    }
    return data;
}

export async function loginApi(correo, password) {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, password })
    });
    return res.json();
}

export async function logoutApi() {
    await fetch('/api/auth/logout', { method: 'POST' });
}

export async function verifySession() {
    const res = await fetch('/api/auth/session', { method: 'GET' });
    if (!res.ok) return null;
    try {
        const data = await res.json();
        return data.user || null;
    } catch {
        return null;
    }
}
