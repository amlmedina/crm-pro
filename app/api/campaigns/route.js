import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * /api/campaigns — CRUD de Campañas
 * Lee/Escribe global.campaigns (sincronizado con server.js)
 */

export async function GET(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');
    if (!sessionCookie?.value) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Retornar campañas ordenadas por fecha de creación desc
    const list = [...(global.campaigns || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return NextResponse.json(list);
}

export async function POST(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');
    if (!sessionCookie?.value) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const { action, campaign } = await req.json();

        if (action === 'create') {
            if (!campaign.contacts || campaign.contacts.length === 0) {
                return NextResponse.json({ error: 'Debes seleccionar al menos un contacto' }, { status: 400 });
            }
            if (campaign.contacts.length > 50) {
                return NextResponse.json({ error: 'Máximo 50 contactos por campaña' }, { status: 400 });
            }
            if (!campaign.message?.trim()) {
                return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 });
            }

            const newCampaign = {
                id: `cmp_${Date.now()}`,
                name: campaign.name || `Campaña ${new Date().toLocaleDateString()}`,
                message: campaign.message.trim(),
                image: campaign.image || null, // base64 o URL
                contacts: campaign.contacts, // Array de { phone, nombre, empresa }
                scheduledAt: campaign.scheduledAt || new Date().toISOString(),
                createdAt: new Date().toISOString(),
                status: 'pending',
                results: null
            };

            global.campaigns.push(newCampaign);
            if (global.persistCampaigns) global.persistCampaigns();

            return NextResponse.json({ ok: true, campaign: newCampaign });
        }

        if (action === 'delete') {
            const { id } = campaign;
            global.campaigns = global.campaigns.filter(c => c.id !== id);
            if (global.persistCampaigns) global.persistCampaigns();
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });

    } catch (err) {
        console.error('[/api/campaigns] Error:', err);
        return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
    }
}
