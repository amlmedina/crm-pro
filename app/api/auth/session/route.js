import { NextResponse } from 'next/server';

export async function GET(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');

    if (!sessionCookie || !sessionCookie.value) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    try {
        const user = JSON.parse(sessionCookie.value);
        return NextResponse.json({ authenticated: true, user });
    } catch {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }
}

export async function POST(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');

    if (!sessionCookie || !sessionCookie.value) {
        return NextResponse.json({ error: 'No autorizado / Sesión expirada' }, { status: 401 });
    }

    try {
        const currentUser = JSON.parse(sessionCookie.value);
        const { telefono } = await req.json();

        const updatedUser = { ...currentUser, telefono };
        const response = NextResponse.json({ success: true, user: updatedUser });
        
        response.cookies.set('crm_session_secure', JSON.stringify(updatedUser), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });
        
        return response;
    } catch (err) {
        console.error("Session Update Error:", err);
        return NextResponse.json({ error: 'Error actualizando la sesión' }, { status: 500 });
    }
}
