import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * /api/whatsapp — Proxy interno hacia el singleton de Baileys
 * Ya no depende de ningún servicio externo (MiBot, api.mibot.mx).
 * Lee global.waSocket / global.waStatus / global.waMessages
 * que son inicializados por server.js al arrancar.
 */

// ── Configuración de Rutas (Sincronizado con server.js) ──────────────────────
const BASE_STORAGE = fs.existsSync('/app/storage') ? '/app/storage' : process.cwd();
const SESSION_DIR = path.join(BASE_STORAGE, 'wa_session');
const MESSAGES_FILE = path.join(SESSION_DIR, 'messages.json');
const UNREADS_FILE = path.join(SESSION_DIR, 'unreads.json');

function getSocket() {
    return global.waSocket || null;
}

function getStatus() {
    return global.waStatus || { connected: false, qr: null, phone: null, state: 'disconnected' };
}

function getMessages() {
    // Intentar memoria primero, luego disco (Source of Truth)
    if (global.waMessages && Object.keys(global.waMessages).length > 0) return global.waMessages;
    try {
        if (fs.existsSync(MESSAGES_FILE)) {
            const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
            global.waMessages = data;
            return data;
        }
    } catch (e) {
        console.error('[API-WA] Error leyendo mensajes de disco:', e.message);
    }
    return {};
}

function getUnreads() {
    if (global.waUnreads && Object.keys(global.waUnreads).length > 0) return global.waUnreads;
    try {
        if (fs.existsSync(UNREADS_FILE)) {
            const data = JSON.parse(fs.readFileSync(UNREADS_FILE, 'utf-8'));
            global.waUnreads = data;
            return data;
        }
    } catch {}
    return {};
}

function persistMessages(data) {
    global.waMessages = data;
    try {
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data), 'utf-8');
    } catch (e) {
        console.error('[API-WA] Error persistiendo mensajes:', e.message);
    }
}

function persistUnreads(data) {
    global.waUnreads = data;
    try {
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
        fs.writeFileSync(UNREADS_FILE, JSON.stringify(data), 'utf-8');
    } catch {}
}

function cleanPhone(raw = '') {
    // Quitar espacios, guiones, +, paréntesis
    return String(raw || '').replace(/[\s\-\+\(\)]/g, '');
}

function toJid(phone) {
    if (phone.includes('@lid')) return phone;
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
            
            // Persistir inmediatamente en el disco (Improves cloud sync)
            persistMessages(msgs);

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
            // Si es un lid, buscamos exactamente la llave o el sufijo sin el @lid
            let suffix = phone.slice(-10);
            if (phone.includes('@lid')) {
                suffix = phone; 
            }

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
            const allUnreads = getUnreads();
            const reduced = {};
            // Group unreads by the last 10 digits
            for (const [key, count] of Object.entries(allUnreads)) {
                if (!count) continue;
                const suffix = key.slice(-10);
                reduced[suffix] = (reduced[suffix] || 0) + count;
            }
            return NextResponse.json(reduced);
        }

        // ── DEBUG (Verificar persistencia) ──────────────────────────
        if (action === 'debug') {
            return NextResponse.json({
                storage_path: BASE_STORAGE,
                files: {
                    messages: fs.existsSync(MESSAGES_FILE),
                    unreads: fs.existsSync(UNREADS_FILE),
                    session: fs.existsSync(SESSION_DIR)
                },
                memory: {
                    has_socket: !!global.waSocket,
                    messages_count: Object.keys(global.waMessages || {}).length,
                    unreads_count: Object.keys(global.waUnreads || {}).length
                }
            });
        }

        // ── THREADS (Active chat numbers) ───────────────────────────
        if (action === 'threads') {
            const msgs = getMessages();
            // Retornar lista de números únicos que han tenido conversación
            return NextResponse.json(Object.keys(msgs));
        }
        if (action === 'read_all') {
            const phone = cleanPhone(to || '');
            if (phone) {
                const currentUnreads = getUnreads();
                const suffix = phone.slice(-10);
                let changed = false;
                for (const key of Object.keys(currentUnreads)) {
                    if (key.endsWith(suffix)) {
                        currentUnreads[key] = 0;
                        changed = true;
                    }
                }
                if (changed) persistUnreads(currentUnreads);
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
