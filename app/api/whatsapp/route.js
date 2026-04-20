import { NextResponse } from 'next/server';

/**
 * /api/whatsapp — Proxy interno hacia el singleton de Baileys
 * Ya no depende de ningún servicio externo (MiBot, api.mibot.mx).
 * Lee global.waSocket / global.waStatus / global.waMessages
 * que son inicializados por server.js al arrancar.
 */

function getSocket() {
    return global.waSocket || null;
}

function getStatus() {
    return global.waStatus || { connected: false, qr: null, phone: null, state: 'disconnected' };
}

function getMessages() {
    return global.waMessages || {};
}

function cleanPhone(raw = '') {
    // Quitar espacios, guiones, +, paréntesis
    return String(raw || '').replace(/[\s\-\+\(\)]/g, '');
}

function toJid(phone) {
    // WhatsApp JID para contacto personal
    return `${phone}@s.whatsapp.net`;
}

export async function POST(req) {
    // 1. Validar sesión CRM
    const sessionCookie = req.cookies.get('crm_session_secure');
    if (!sessionCookie?.value) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const { action, to, message } = await req.json();

        if (!action) {
            return NextResponse.json({ error: 'Parámetros insuficientes' }, { status: 400 });
        }

        // ── STATUS ──────────────────────────────────────────────────
        if (action === 'status') {
            return NextResponse.json(getStatus());
        }

        // ── QR ──────────────────────────────────────────────────────
        if (action === 'qr') {
            const st = getStatus();
            if (st.qr) {
                return NextResponse.json({ qr: st.qr });
            }
            if (st.connected) {
                return NextResponse.json({ error: 'WhatsApp ya está conectado. No se necesita QR.' });
            }
            return NextResponse.json({
                error: 'QR no disponible aún. El servidor está iniciando, espera unos segundos e intenta de nuevo.'
            });
        }

        // ── SEND ────────────────────────────────────────────────────
        if (action === 'send') {
            const sock = getSocket();
            const phone = cleanPhone(to || '');

            if (!phone) {
                return NextResponse.json({ error: 'Número de teléfono requerido' }, { status: 400 });
            }
            if (!message?.trim()) {
                return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 });
            }
            if (!sock) {
                return NextResponse.json({ error: 'WhatsApp no conectado. Escanea el QR en el panel Admin.' }, { status: 503 });
            }
            if (!getStatus().connected) {
                return NextResponse.json({ error: 'WhatsApp desconectado. Verifica la conexión en el panel Admin.' }, { status: 503 });
            }

            const jid = toJid(phone);
            await sock.sendMessage(jid, { text: message.trim() });

            // Guardar en historial local (fromMe = true)
            const msgs = getMessages();
            if (!msgs[phone]) msgs[phone] = [];
            msgs[phone].push({
                id: `sent_${Date.now()}`,
                from: phone,
                text: message.trim(),
                fromMe: true,
                timestamp: Date.now(),
            });
            // Persistir en archivo via el servidor
            if (global.persistMessages) global.persistMessages();

            return NextResponse.json({ ok: true, to: phone });
        }

        // ── HISTORY ─────────────────────────────────────────────────
        if (action === 'history') {
            const phone = cleanPhone(to || '');
            if (!phone) {
                return NextResponse.json([], { status: 200 });
            }
            const msgs = getMessages();
            let conversation = [];
            const suffix = phone.slice(-10);

            console.log(`[/api/whatsapp] Buscando historial para: ${phone} (suffix: ${suffix})`);

            for (const key of Object.keys(msgs)) {
                // Si la llave de la base de datos termina en nuestro sufijo, es un match.
                // Ej: key '52155...' termina en '55...'
                if (key.endsWith(suffix) || suffix.endsWith(key.slice(-10))) {
                    conversation = [...conversation, ...msgs[key]];
                }
            }

            const sorted = conversation.sort((a, b) => a.timestamp - b.timestamp);
            return NextResponse.json(sorted);
        }

        // ── UNREAD ──────────────────────────────────────────────────
        if (action === 'unread') {
            const allUnreads = global.waUnreads || {};
            const reduced = {};
            // Group unreads by the last 10 digits
            for (const [key, count] of Object.entries(allUnreads)) {
                if (!count) continue;
                const suffix = key.slice(-10);
                reduced[suffix] = (reduced[suffix] || 0) + count;
            }
            return NextResponse.json(reduced);
        }
        if (action === 'read_all') {
            const phone = cleanPhone(to || '');
            if (phone && global.waUnreads) {
                const suffix = phone.slice(-10);
                let changed = false;
                for (const key of Object.keys(global.waUnreads)) {
                    if (key.endsWith(suffix)) {
                        global.waUnreads[key] = 0;
                        changed = true;
                    }
                }
                if (changed && global.persistUnreads) global.persistUnreads();
            }
            return NextResponse.json({ ok: true });
        }

        // ── DISCONNECT ───────────────────────────────────────────────
        if (action === 'disconnect') {
            const sock = getSocket();
            if (!sock) {
                return NextResponse.json({ error: 'No hay sesión activa.' }, { status: 400 });
            }
            await sock.logout();
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });

    } catch (err) {
        console.error('[/api/whatsapp] Error:', err);
        return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
    }
}
