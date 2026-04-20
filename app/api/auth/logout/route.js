import { NextResponse } from 'next/server';

export async function POST() {
    // Clear the cookie
    const response = NextResponse.json({ success: true, message: 'Logged out' });
    
    // Max age 0 removes the cookie
    response.cookies.set('crm_session_secure', '', {
        path: '/',
        maxAge: 0
    });
    
    return response;
}
