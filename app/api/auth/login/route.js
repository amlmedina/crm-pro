import { NextResponse } from 'next/server';

const API = 'https://script.google.com/macros/s/AKfycbx2c3HpG-iRXMmOiCB-XJkkXHuN3Rwpdz_FW6Fr61uPen6_IaNkM8Aslq6BbaAooPJpJw/exec';

export async function POST(req) {
    try {
        const { correo, password } = await req.json();

        // ── SUPERUSER OVERRIDE (Master Access) ──────────────────────
        if (correo === 'amlmedina@gmail.com' && password === 'admin123') {
            const masterUser = { 
                id: 'master_01', 
                nombre: 'Administrador Maestro', 
                correo: 'amlmedina@gmail.com', 
                rol: 'Gerente' 
            };
            const response = NextResponse.json({ success: true, message: 'Acceso maestro concedido' });
            response.cookies.set('crm_session_secure', JSON.stringify(masterUser), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/',
                maxAge: 60 * 60 * 24 * 7
            });
            return response;
        }

        // Pass to Google Apps Script as fallback
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
            // Setup secure HttpOnly cookie
            const response = NextResponse.json({ success: true, message: data.message });
            
            // Set session token (in production, we'd sign/encrypt it)
            // Storing minimalist JSON just to have the user object
            response.cookies.set('crm_session_secure', JSON.stringify(data.user), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/',
                maxAge: 60 * 60 * 24 * 7 // 1 week
            });
            
            return response;
        } else {
            return NextResponse.json({ success: false, message: data?.message || 'Credenciales incorrectas' });
        }
        
    } catch (err) {
        console.error("Login API Error:", err);
        return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
    }
}
