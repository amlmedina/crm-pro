import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';

const API = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbx2c3HpG-iRXMmOiCB-XJkkXHuN3Rwpdz_FW6Fr61uPen6_IaNkM8Aslq6BbaAooPJpJw/exec';
const GAS_API_KEY = process.env.GAS_API_KEY || ''; // Set in Railway env vars

// ── DLP: Server-side data masking ───────────────────────────────────────────
// These functions mask sensitive fields BEFORE sending data to the browser.
// This ensures even F12 / network tab inspection shows only masked values.

function maskPhone(phone) {
    const s = String(phone || '');
    if (s.length < 6) return '••••••';
    return s.slice(0, 3) + '•'.repeat(Math.max(0, s.length - 5)) + s.slice(-2);
}

function maskEmail(email) {
    const s = String(email || '');
    const at = s.indexOf('@');
    if (at < 2) return '••••••';
    return s.slice(0, 2) + '•'.repeat(Math.max(0, at - 2)) + s.slice(at);
}

function maskText(value) {
    const s = String(value || '');
    if (s.length <= 2) return '••••••';
    return s.slice(0, 1) + '•'.repeat(Math.max(0, s.length - 2)) + s.slice(-1);
}

const MASK_HINTS = {
    Telefono: maskPhone,
    Correo_Corp: maskEmail,
    Correo: maskEmail,
};

function applySeverMask(contacts, censoredFields) {
    if (!Array.isArray(contacts) || !censoredFields?.length) return contacts;
    return contacts.map(contact => {
        const masked = { ...contact };
        for (const field of censoredFields) {
            if (field in masked && masked[field]) {
                const maskFn = MASK_HINTS[field] || maskText;
                masked[field] = maskFn(masked[field]);
            }
        }
        return masked;
    });
}

// ── PROXY ROUTE ──────────────────────────────────────────────────────────────

export async function POST(req) {
    // 1. Verify cryptographic session signature
    const sessionCookie = req.cookies.get('crm_session_secure');

    if (!sessionCookie?.value) {
        return NextResponse.json({ error: 'No autorizado / Sesión expirada' }, { status: 401 });
    }

    const user = verifySession(sessionCookie.value);
    if (!user) {
        // Cookie was tampered — reject and clear it
        const res = NextResponse.json({ error: 'Sesión inválida. Por favor inicia sesión de nuevo.' }, { status: 401 });
        res.cookies.set('crm_session_secure', '', { path: '/', maxAge: 0 });
        return res;
    }

    try {
        const { action, payload = {} } = await req.json();

        if (!action) {
            return NextResponse.json({ error: 'Acción no provista' }, { status: 400 });
        }

        // 2. Build GAS request body — include API key if configured
        const gasBody = { action, ...payload };
        if (GAS_API_KEY) gasBody.gasApiKey = GAS_API_KEY;

        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(gasBody)
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Error del servidor remoto (GAS)' }, { status: 502 });
        }

        const data = await res.json();

        if (data && data.error) {
            return NextResponse.json(data, { status: 400 });
        }

        // 3. Server-side DLP — mask censored fields for non-managers BEFORE sending to browser
        const isManager = user.rol === 'Gerente' || user.rol === 'Administrador';

        if (action === 'getContacts' && !isManager) {
            // Fetch config to know which fields are censored
            let censoredFields = [];
            try {
                const cfgBody = { action: 'getConfig' };
                if (GAS_API_KEY) cfgBody.gasApiKey = GAS_API_KEY;
                const cfgRes = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(cfgBody)
                });
                if (cfgRes.ok) {
                    const cfgData = await cfgRes.json();
                    censoredFields = cfgData?.censoredFields || [];
                }
            } catch (cfgErr) {
                console.error('[Proxy DLP] Error fetching config for masking:', cfgErr);
            }

            if (censoredFields.length > 0 && data?.data) {
                data.data = applySeverMask(data.data, censoredFields);
            }
        }

        return NextResponse.json(data);

    } catch (err) {
        console.error('Proxy API Error:', err);
        return NextResponse.json({ error: 'Error procesando la solicitud proxy' }, { status: 500 });
    }
}
