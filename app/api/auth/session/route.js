import { NextResponse } from 'next/server';
import { signSession, verifySession } from '@/lib/session';

const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
};

export async function GET(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');

    if (!sessionCookie?.value) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = verifySession(sessionCookie.value);
    if (!user) {
        // Cookie exists but signature is invalid or tampered
        const response = NextResponse.json({ authenticated: false }, { status: 401 });
        response.cookies.set('crm_session_secure', '', { path: '/', maxAge: 0 });
        return response;
    }

    return NextResponse.json({ authenticated: true, user });
}

export async function POST(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');

    if (!sessionCookie?.value) {
        return NextResponse.json({ error: 'No autorizado / Sesión expirada' }, { status: 401 });
    }

    const currentUser = verifySession(sessionCookie.value);
    if (!currentUser) {
        const response = NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
        response.cookies.set('crm_session_secure', '', { path: '/', maxAge: 0 });
        return response;
    }

    try {
        const updates = await req.json();
        const updatedUser = { ...currentUser, ...updates };
        const response = NextResponse.json({ success: true, user: updatedUser });
        response.cookies.set('crm_session_secure', signSession(updatedUser), COOKIE_OPTS);
        return response;
    } catch (err) {
        console.error('Session Update Error:', err);
        return NextResponse.json({ error: 'Error actualizando la sesión' }, { status: 500 });
    }
}
