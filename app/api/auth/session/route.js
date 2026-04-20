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
