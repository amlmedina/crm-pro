import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * /api/whatsapp — Proxy interno hacia el singleton de Baileys
 * Ya no depende de ningún servicio externo (MiBot, api.mibot.mx).
 * Lee global.waSocket / global.waStatus / global.waMessages
 * que son inicializados por server.js al arrancar.
 */

// ── Configuración de Rutas (Sincronizado con server.js) ──────────────────────
const BASE_STORAGE = fs.existsSync('/app/storage') ? '/app/storage' : process.cwd();
const SESSION_DIR = path.join(BASE_STORAGE, 'wa_session');
const MEDIA_DIR = path.join(SESSION_DIR, 'media');
const MESSAGES_FILE = path.join(SESSION_DIR, 'messages.json');
const UNREADS_FILE = path.join(SESSION_DIR, 'unreads.json');

function getSocket() {
    return global.waSocket || null;
}

// ── Convierte cualquier audio a ogg/opus compatible con WhatsApp PTT ──────────
function convertToOggOpus(inputBuffer) {
    const tmpIn  = path.join(os.tmpdir(), `wa_audio_in_${Date.now()}`);
    const tmpOut = path.join(os.tmpdir(), `wa_audio_out_${Date.now()}.ogg`);
    try {
        fs.writeFileSync(tmpIn, inputBuffer);
        execSync(`ffmpeg -y -i "${tmpIn}" -c:a libopus -b:a 64k -ar 16000 -ac 1 "${tmpOut}" 2>/dev/null`);
        const outBuffer = fs.readFileSync(tmpOut);
        return outBuffer;
    } finally {
        try { fs.unlinkSync(tmpIn);  } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
    }
}

function getStatus() {
    return global.waStatus || { connected: false, qr: null, phone: null, state: 'disconnected' };
}

function getMessages() {
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
    let cleaned = String(raw || '').replace(/[\s\-\+\(\)]/g, '');
    if (cleaned.length === 10 && !cleaned.includes('@lid')) {
        cleaned = '521' + cleaned;
    }
    return cleaned;
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
        const { action, to, message, from_phone, to_phone, imageBase64, caption, mediaBase64, isVoiceNote, fileUrl, fileName } = await req.json();

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


        // ── SEND MEDIA ──────────────────────────────────────────────
        if (action === 'send_image' || action === 'send_media') {
            const sock = getSocket();
            const phone = cleanPhone(to || '');
            const base64Data = mediaBase64 || imageBase64;

            if (!phone) return NextResponse.json({ error: 'Número requerido' }, { status: 400 });
            if (!base64Data && !fileUrl) return NextResponse.json({ error: 'Media requerida (base64 o fileUrl)' }, { status: 400 });
            if (!sock) return NextResponse.json({ error: 'WhatsApp no conectado.' }, { status: 503 });
            if (!getStatus().connected) return NextResponse.json({ error: 'WhatsApp desconectado.' }, { status: 503 });

            let imgBuffer;
            let mimeType;
            let isLocalFile = false;
            let localFileName = '';

            if (fileUrl) {
                try {
                    const urlObj = new URL(fileUrl, 'http://localhost');
                    const fileParam = urlObj.searchParams.get('file');
                    if (!fileParam) return NextResponse.json({ error: 'Nombre de archivo inválido' }, { status: 400 });
                    const safeFile = path.basename(fileParam);
                    const filePath = path.join(MEDIA_DIR, safeFile);
                    if (!fs.existsSync(filePath)) {
                        return NextResponse.json({ error: 'Archivo local no encontrado' }, { status: 404 });
                    }
                    imgBuffer = fs.readFileSync(filePath);
                    isLocalFile = true;
                    localFileName = safeFile;
                    
                    const ext = path.extname(safeFile).toLowerCase();
                    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
                    else if (ext === '.png') mimeType = 'image/png';
                    else if (ext === '.gif') mimeType = 'image/gif';
                    else if (ext === '.mp4') mimeType = 'video/mp4';
                    else if (ext === '.ogg') mimeType = 'audio/ogg';
                    else if (ext === '.mp3') mimeType = 'audio/mpeg';
                    else if (ext === '.webm') mimeType = 'audio/webm';
                    else if (ext === '.pdf') mimeType = 'application/pdf';
                    else mimeType = 'application/octet-stream';
                } catch (urlErr) {
                    return NextResponse.json({ error: 'Error procesando URL del archivo' }, { status: 400 });
                }
            } else {
                // Convert base64 data URI to Buffer
                const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
                if (!matches) return NextResponse.json({ error: 'Formato de archivo inválido' }, { status: 400 });
                const rawMimeType = matches[1];
                mimeType = rawMimeType.split(';')[0]; // Strip codecs like audio/webm;codecs=opus
                imgBuffer = Buffer.from(matches[2], 'base64');
            }

            const jid = toJid(phone);
            
            let msgOptions = {};
            let logText = '[Archivo]';
            let saveBuffer = imgBuffer;
            let ext = '.bin';
            let type = 'document';

            if (isVoiceNote) {
                console.log('[/api/whatsapp] Convirtiendo audio a ogg/opus para PTT...');
                let oggBuffer;
                try {
                    oggBuffer = convertToOggOpus(imgBuffer);
                    console.log('[/api/whatsapp] Conversión OK, tamaño:', oggBuffer.length);
                } catch (convErr) {
                    console.error('[/api/whatsapp] Error al convertir audio con ffmpeg:', convErr.message);
                    return NextResponse.json({ error: 'Error al procesar el audio. ¿Tienes ffmpeg instalado?' }, { status: 500 });
                }
                msgOptions = { audio: oggBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true };
                logText = '[Nota de Voz]';
                
                type = 'audio';
                ext = '.ogg';
                saveBuffer = oggBuffer;
            } else if (mimeType.startsWith('image/')) {
                msgOptions = { image: imgBuffer, mimetype: mimeType, caption: caption?.trim() || '' };
                logText = caption?.trim() ? `[Imagen] ${caption.trim()}` : '[Imagen]';
                
                type = 'image';
                ext = mimeType.includes('png') ? '.png' : '.jpg';
            } else if (mimeType.startsWith('video/')) {
                msgOptions = { video: imgBuffer, mimetype: mimeType, caption: caption?.trim() || '' };
                logText = caption?.trim() ? `[Video] ${caption.trim()}` : '[Video]';
                
                type = 'video';
                ext = '.mp4';
            } else if (mimeType.startsWith('audio/')) {
                msgOptions = { audio: imgBuffer, mimetype: mimeType };
                logText = '[Audio]';
                
                type = 'audio';
                ext = mimeType.includes('mpeg') || mimeType.includes('mp3') ? '.mp3' : '.ogg';
            } else {
                msgOptions = { document: imgBuffer, mimetype: mimeType || 'application/octet-stream', fileName: fileName || caption || 'archivo' };
                logText = caption?.trim() ? `[Documento] ${caption.trim()}` : '[Documento]';
                
                type = 'document';
                ext = (fileName || caption) ? path.extname(fileName || caption) : (mimeType.includes('pdf') ? '.pdf' : '.bin');
            }

            if (ext) ext = ext.replace(/[^a-zA-Z0-9\.]/g, '');

            await sock.sendMessage(jid, msgOptions);

            const msgId = `sent_media_${Date.now()}`;
            let finalFileName = `${msgId}${ext}`;

            if (isLocalFile && !isVoiceNote) {
                try {
                    fs.copyFileSync(path.join(MEDIA_DIR, localFileName), path.join(MEDIA_DIR, finalFileName));
                    console.log(`[/api/whatsapp] Archivo local copiado para historial: ${finalFileName}`);
                } catch (copyErr) {
                    console.error('[/api/whatsapp] Error copiando archivo local:', copyErr.message);
                    finalFileName = localFileName;
                }
            } else {
                const filePath = path.join(MEDIA_DIR, finalFileName);
                try {
                    if (!fs.existsSync(MEDIA_DIR)) {
                        fs.mkdirSync(MEDIA_DIR, { recursive: true });
                    }
                    fs.writeFileSync(filePath, saveBuffer);
                    console.log(`[/api/whatsapp] Media enviada guardada localmente en: ${filePath}`);
                } catch (saveErr) {
                    console.error('[/api/whatsapp] Error al guardar media enviada:', saveErr.message);
                }
            }

            const msgs = getMessages();
            if (!msgs[phone]) msgs[phone] = [];
            msgs[phone].push({
                id: msgId,
                from: phone,
                text: logText,
                fromMe: true,
                timestamp: Date.now(),
                mediaUrl: `/api/media?file=${encodeURIComponent(finalFileName)}`,
                mediaType: type,
                fileName: type === 'document' ? (fileName || caption || 'archivo') : undefined
            });
            persistMessages(msgs);

            return NextResponse.json({ ok: true, to: phone });
        }

        // ── HISTORY ─────────────────────────────────────────────────
        if (action === 'history') {
            const rawTo = to || '';
            const identifiers = String(rawTo).split(',').map(id => cleanPhone(id.trim())).filter(Boolean);
            
            if (identifiers.length === 0) {
                return NextResponse.json([], { status: 200 });
            }

            const msgs = getMessages();
            let conversation = [];
            const seenMsgIds = new Set();

            for (const id of identifiers) {
                let suffix = id.slice(-10);
                if (id.includes('@lid')) {
                    suffix = id; 
                }

                console.log(`[/api/whatsapp] Buscando historial para id: ${id} (suffix: ${suffix})`);

                for (const key of Object.keys(msgs)) {
                    if (key === id || key.endsWith(suffix) || suffix.endsWith(key.slice(-10))) {
                        // De-duplicate messages by ID
                        for (const msg of msgs[key]) {
                            const msgUid = msg.id || `${msg.timestamp}_${msg.fromMe}_${msg.text?.substring(0,20)}`;
                            if (!seenMsgIds.has(msgUid)) {
                                seenMsgIds.add(msgUid);
                                conversation.push(msg);
                            }
                        }
                    }
                }
            }

            const sorted = conversation.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
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
            const threadData = {};
            for (const [threadId, chatArray] of Object.entries(msgs)) {
                let lastPushName = '';
                for (let i = chatArray.length - 1; i >= 0; i--) {
                    if (chatArray[i].pushName) {
                        lastPushName = chatArray[i].pushName;
                        break;
                    }
                }
                threadData[threadId] = { id: threadId, pushName: lastPushName };
            }
            return NextResponse.json(Object.values(threadData));
        }
        if (action === 'read_all') {
            const rawTo = to || '';
            const identifiers = String(rawTo).split(',').map(id => cleanPhone(id.trim())).filter(Boolean);
            
            if (identifiers.length > 0) {
                const currentUnreads = getUnreads();
                let changed = false;
                
                for (const id of identifiers) {
                    const suffix = id.slice(-10);
                    for (const key of Object.keys(currentUnreads)) {
                        if (key.endsWith(suffix) || (id.includes('@lid') && key === id)) {
                            currentUnreads[key] = 0;
                            changed = true;
                        }
                    }
                }
                if (changed) persistUnreads(currentUnreads);
            }
            return NextResponse.json({ ok: true });
        }

        // ── MERGE CHATS ──────────────────────────────────────────────
        if (action === 'merge_chats') {
            if (!from_phone || !to_phone) {
                return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
            }
            const msgs = getMessages();
            const fromKey = cleanPhone(from_phone);
            const toKey = cleanPhone(to_phone);

            let fromMsgs = [];
            const suffix = fromKey.slice(-10);
            
            // Collect messages from any thread matching the old phone's suffix
            for (const key of Object.keys(msgs)) {
                if (key === fromKey || key.endsWith(suffix) || suffix.endsWith(key.slice(-10))) {
                    fromMsgs = [...fromMsgs, ...msgs[key]];
                    delete msgs[key];
                }
            }

            if (!msgs[toKey]) msgs[toKey] = [];
            msgs[toKey] = [...msgs[toKey], ...fromMsgs].sort((a,b) => a.timestamp - b.timestamp);
            
            persistMessages(msgs);
            return NextResponse.json({ ok: true, merged: fromMsgs.length });
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
