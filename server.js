/**
 * server.js — CRM Pro Custom Server
 * Levanta Baileys (WhatsApp) como singleton antes de iniciar Next.js.
 * Usa CJS + dynamic import() para compatibilidad con Baileys ESM puro.
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');
const fs = require('fs');

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev, turbopack: dev });
const handle = app.getRequestHandler();

// ── Persistencia de mensajes ─────────────────────────────────────────────────
const SESSION_DIR = path.join(process.cwd(), 'wa_session');
const MESSAGES_FILE = path.join(SESSION_DIR, 'messages.json');
const UNREADS_FILE = path.join(SESSION_DIR, 'unreads.json');

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
  } catch {}
  return {};
}

function loadUnreads() {
  try {
    if (fs.existsSync(UNREADS_FILE)) return JSON.parse(fs.readFileSync(UNREADS_FILE, 'utf-8'));
  } catch {}
  return {};
}

function persistMessages() {
  try { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(global.waMessages), 'utf-8'); } catch {}
}
function persistUnreads() {
  try { fs.writeFileSync(UNREADS_FILE, JSON.stringify(global.waUnreads), 'utf-8'); } catch {}
}

global.persistMessages = persistMessages;
global.persistUnreads = persistUnreads;

// ── Estado global accesible desde las API Routes ─────────────────────────────
global.waStatus = { connected: false, qr: null, phone: null, state: 'disconnected' };
global.waSocket = null;
global.waMessages = loadMessages(); // { 'phoneNumber': [{...}] }
global.waUnreads = loadUnreads();   // { 'phoneNumber': count }

// ── Motor WhatsApp (Baileys) ──────────────────────────────────────────────────
async function startWhatsApp() {
  ensureSessionDir();

  // Dynamic import para Baileys ESM
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    jidNormalizedUser
  } = await import('@whiskeysockets/baileys');

  const { Boom } = await import('@hapi/boom');
  const QRCode = require('qrcode');

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  async function createSocket() {
    let version = [2, 3000, 1015901307]; // fallback default
    try {
      const { version: latestVersion } = await fetchLatestBaileysVersion();
      version = latestVersion;
    } catch (e) {
      console.warn('[WA] No se pudo obtener la última versión de WA, usando por defecto.');
    }

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, console)
      },
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      getMessage: async () => ({ conversation: '' }),
    });

    global.waSocket = sock;

    // Eventos de conexión
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          global.waStatus.qr = await QRCode.toDataURL(qr);
        } catch {
          global.waStatus.qr = qr; // fallback: string raw
        }
        global.waStatus.connected = false;
        global.waStatus.state = 'qr';
        console.log('[WA] 📱 QR listo — escanea desde el panel Admin → WhatsApp');
      }

      if (connection === 'close') {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        global.waStatus.connected = false;
        global.waStatus.state = 'disconnected';
        global.waStatus.qr = null;
        global.waSocket = null;
        console.log(`[WA] Desconectado (código ${code}). Reconectar: ${shouldReconnect}`);
        if (shouldReconnect) {
          setTimeout(createSocket, 4000);
        } else {
          // Sesión cerrada — borrar credenciales para forzar nuevo QR
          console.log('[WA] Sesión cerrada (logout). Borrando credenciales...');
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); ensureSessionDir(); } catch {}
          setTimeout(startWhatsApp, 4000);
        }
      }

      if (connection === 'open') {
        global.waStatus.connected = true;
        global.waStatus.state = 'open';
        global.waStatus.qr = null;
        global.waStatus.phone = sock.user?.id?.split(':')[0] || sock.user?.id || null;
        console.log(`[WA] ✅ Conectado como ${global.waStatus.phone}`);
      }
    });

    // Guardar credenciales cuando se actualicen
    sock.ev.on('creds.update', saveCreds);

    // Mensajes entrantes
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const rawJid = msg.key.remoteJid;
        if (!rawJid || rawJid.includes('@g.us')) continue; // Ignorar grupos

        const normalizedJid = jidNormalizedUser(rawJid);
        const from = normalizedJid.replace('@s.whatsapp.net', '');
        
        const content = msg.message?.conversation || 
                        msg.message?.extendedTextMessage?.text || 
                        msg.message?.imageMessage?.caption;

        if (!content) continue;

        if (from.endsWith('@lid')) {
          console.log('[WA-DEBUG-LID] Mensaje recibido de LID. Key:', JSON.stringify(msg.key));
          console.log('[WA-DEBUG-LID] Message keys:', Object.keys(msg.message || {}));
        }

        const ts = msg.messageTimestamp || Math.floor(Date.now() / 1000);
        
        const entry = {
          id: msg.key.id || `${Date.now()}`,
          from,
          text: content,
          fromMe: false,
          timestamp: ts * 1000,
        };

        if (!global.waMessages[from]) global.waMessages[from] = [];
        global.waMessages[from].push(entry);
        persistMessages();

        // Si el mensaje es reciente (no de historial inicial), aumentar unread
        if (ts > (Date.now() / 1000) - 60) {
          global.waUnreads[from] = (global.waUnreads[from] || 0) + 1;
          persistUnreads();
        }

        console.log(`[WA] 📨 Mensaje entrante de ${from}: ${content.substring(0, 40)}`);
      }
    });

    return sock;
  }

  createSocket();
}

// ── Arranque del servidor ─────────────────────────────────────────────────────
app.prepare().then(() => {
  // Iniciar WhatsApp en background (no bloquea el servidor)
  startWhatsApp().catch((err) => {
    console.error('[WA] ⚠️  Error iniciando WhatsApp:', err.message);
    console.error('[WA] El CRM funcionará sin el módulo WhatsApp.');
  });

  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 CRM Pro corriendo en puerto ${port}`);
    console.log(`📱 WhatsApp: iniciando en background...`);
    console.log(`   → Abre el panel Admin para escanear el QR\n`);
  });
});
