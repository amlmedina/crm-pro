import { NextResponse } from 'next/server';

const API = 'https://script.google.com/macros/s/AKfycbx2c3HpG-iRXMmOiCB-XJkkXHuN3Rwpdz_FW6Fr61uPen6_IaNkM8Aslq6BbaAooPJpJw/exec';

export async function POST(req) {
    // 1. Validate Session Cookie
    const sessionCookie = req.cookies.get('crm_session_secure');
    
    if (!sessionCookie || !sessionCookie.value) {
        return NextResponse.json({ error: 'No autorizado / Sesión expirada' }, { status: 401 });
    }

    try {
        const user = JSON.parse(sessionCookie.value);
        
        // 2. Extract payload
        const { action, payload = {} } = await req.json();
        
        if (!action) {
            return NextResponse.json({ error: 'Acción no provista' }, { status: 400 });
        }

        // 3. For security, we inject the 'usuario' ID automatically in some payloads if needed
        // but for now we forward the payload as is.
        // E.g. payload.userId = user.id;

        // 4. Call Google Apps Script
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, ...payload })
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: 'Error del servidor remoto (GAS)' }, { status: 502 });
        }
        
        const data = await res.json();
        
        if (data && data.error) {
            return NextResponse.json(data, { status: 400 });
        }

        return NextResponse.json(data);

    } catch (err) {
        console.error("Proxy API Error:", err);
        return NextResponse.json({ error: 'Error procesando la solicitud proxy' }, { status: 500 });
    }
}
