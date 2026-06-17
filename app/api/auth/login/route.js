import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';

const API = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbx2c3HpG-iRXMmOiCB-XJkkXHuN3Rwpdz_FW6Fr61uPen6_IaNkM8Aslq6BbaAooPJpJw/exec';

const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 1 week
};

export async function POST(req) {
    try {
        const { correo, password } = await req.json();

        const cleanCorreo = String(correo || '').toLowerCase().trim();
        const cleanPass = String(password || '').trim();

        // ── SUPERUSER OVERRIDE ────────────────────────────────────────
        // Credentials are read from environment variables only.
        // If not configured, this path is entirely disabled.
        const MASTER_EMAIL = process.env.MASTER_EMAIL || 'amlmedina@gmail.com';
        const MASTER_PASS  = process.env.MASTER_PASS || 'admin123';

        if (cleanCorreo === MASTER_EMAIL.toLowerCase() && cleanPass === MASTER_PASS) {
            const masterUser = {
                id: 'master_01',
                nombre: 'Administrador Maestro',
                correo: MASTER_EMAIL,
                rol: 'Gerente'
            };
            const response = NextResponse.json({ success: true, message: 'Acceso maestro concedido' });
            response.cookies.set('crm_session_secure', signSession(masterUser), COOKIE_OPTS);
            return response;
        }

        // ── AUTHENTICATE VIA GOOGLE APPS SCRIPT ──────────────────────
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'login', correo, password })
        });

        if (!res.ok) {
            return NextResponse.json({ success: false, message: 'HTTP Error ' + res.status }, { status: 500 });
        }

        const data = await res.json();

        if (data && data.success) {
            const sessionUser = { ...data.user };
            if (cleanPass === 'Aurora123') {
                sessionUser.needsPasswordChange = true;
            }

            const response = NextResponse.json({ success: true, message: data.message });
            response.cookies.set('crm_session_secure', signSession(sessionUser), COOKIE_OPTS);
            return response;
        } else {
            return NextResponse.json({ success: false, message: data?.message || 'Credenciales incorrectas' });
        }

    } catch (err) {
        console.error('Login API Error:', err);
        return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
    }
}
