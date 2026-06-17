import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';

export async function GET(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');
    if (!sessionCookie?.value || !verifySession(sessionCookie.value)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    if (phone) {
        // Return state for specific phone
        const state = global.dripState?.[phone] || {};
        return NextResponse.json(state);
    }

    // Otherwise return rules
    const rules = global.dripRules || [];
    return NextResponse.json(rules);
}

export async function POST(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');
    const user = sessionCookie?.value ? verifySession(sessionCookie.value) : null;
    
    // Regular users can toggle state for a contact, but only admins can save rules
    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const { action, rules, phone, enabled } = await req.json();

        if (action === 'save_rules') {
            if (user.rol !== 'Administrador' && user.rol !== 'Gerente') {
                return NextResponse.json({ error: 'No autorizado para editar reglas' }, { status: 401 });
            }
            global.dripRules = rules;
            if (global.persistDripRules) global.persistDripRules();
            return NextResponse.json({ success: true, rules: global.dripRules });
        }

        if (action === 'toggle_drip') {
            if (!phone) return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 });
            
            if (!global.dripState) global.dripState = {};
            if (!global.dripState[phone]) global.dripState[phone] = {};
            
            global.dripState[phone].enabled = !!enabled;
            
            if (global.persistDripState) global.persistDripState();
            return NextResponse.json({ success: true, state: global.dripState[phone] });
        }

        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    } catch (err) {
        console.error('[API-DRIP] Error:', err);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
