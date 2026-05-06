/**
 * server.js — Aurora Custom Server
 * Motor de WhatsApp (Baileys) + Next.js
 */

'use strict';

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const path             = require('path');
const fs               = require('fs');

const port = parseInt(process.env.PORT || '3000', 10);
const dev  = process.env.NODE_ENV !== 'production';

const app    = next({ dev });
const handle = app.getRequestHandler();

// ── Rutas de almacenamiento (unificado para Railway) ──────────────────────────
const BASE_STORAGE   = fs.existsSync('/app/storage') ? '/app/storage' : process.cwd();
const SESSION_DIR    = path.join(BASE_STORAGE, 'wa_session');
const MESSAGES_FILE  = path.join(SESSION_DIR,  'messages.json');
const UNREADS_FILE   = path.join(SESSION_DIR,  'unreads.json');
const TASKS_DATA_DIR = path.join(BASE_STORAGE, 'crm_data');
const CAMPAIGNS_FILE = path.join(TASKS_DATA_DIR, 'campaigns.json');

function ensureDataDirs() {
  if (!fs.existsSync(SESSION_DIR))    fs.mkdirSync(SESSION_DIR,    { recursive: true });
  if (!fs.existsSync(TASKS_DATA_DIR)) fs.mkdirSync(TASKS_DATA_DIR, { recursive: true });
}

function loadMessages() {
  try { if (fs.existsSync(MESSAGES_FILE)) return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8')); } catch {}
  return {};
}
function loadUnreads() {
  try { if (fs.existsSync(UNREADS_FILE)) return JSON.parse(fs.readFileSync(UNREADS_FILE, 'utf-8')); } catch {}
  return {};
}
function persistMessages() {
  try { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(global.waMessages), 'utf-8'); } catch {}
}
function persistUnreads() {
  try { fs.writeFileSync(UNREADS_FILE, JSON.stringify(global.waUnreads), 'utf-8'); } catch {}
}
function loadCampaigns() {
  try { if (fs.existsSync(CAMPAIGNS_FILE)) return JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8')); } catch {}
  return [];
}
function persistCampaigns() {
  try { fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(global.campaigns), 'utf-8'); } catch {}
}

global.persistMessages  = persistMessages;
global.persistUnreads   = persistUnreads;
global.persistCampaigns = persistCampaigns;

// ── Versión del servidor (actualizar para confirmar despliegues) ───────────────
const SERVER_VERSION = 'v2026.04.20-LID-v2';

// ── Estado global ─────────────────────────────────────────────────────────────
global.waStatus   = { connected: false, qr: null, phone: null, state: 'disconnected' };
global.waSocket   = null;
global.waMessages = loadMessages();
global.waUnreads  = loadUnreads();
global.campaigns  = loadCampaigns();

// ── Motor de WhatsApp ─────────────────────────────────────────────────────────
async function startWhatsApp() {
  ensureDataDirs();
  console.log('[WA] Cargando credenciales...');

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    jidNormalizedUser,
  } = await import('@whiskeysockets/baileys');

  const { Boom } = await import('@hapi/boom');
  const QRCode   = require('qrcode');

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  async function connect() {
    let version = [2, 3000, 1015901307];
    try {
      const { version: v } = await fetchLatestBaileysVersion();
      version = v;
      console.log(`[WA] Versión: ${version.join('.')}`);
    } catch { console.warn('[WA] Usando versión fallback.'); }

    console.log('[WA] Conectando socket...');
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, console),
      },
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      getMessage: async () => ({ conversation: '' }),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      keepAliveIntervalMs: 10000,
    });

    global.waSocket = sock;
    sock.ev.on('creds.update', saveCreds);

    // ── Conexión ───────────────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[WA] 📱 QR generado. Escanea desde el panel Admin.');
        try   { global.waStatus.qr = await QRCode.toDataURL(qr); }
        catch { global.waStatus.qr = qr; }
        global.waStatus.state     = 'qr';
        global.waStatus.connected = false;
      }

      if (connection === 'open') {
        global.waStatus.connected = true;
        global.waStatus.state     = 'open';
        global.waStatus.qr        = null;
        global.waStatus.phone     = sock.user?.id?.split(':')[0] ?? null;
        console.log(`[WA] ✅ Conectado como ${global.waStatus.phone}`);
      }

      if (connection === 'close') {
        const code     = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const isLogout = code === DisconnectReason.loggedOut;
        global.waStatus.connected = false;
        global.waStatus.state     = 'disconnected';
        global.waStatus.qr        = null;
        global.waSocket           = null;
        console.log(`[WA] Conexión cerrada (código ${code}). Logout: ${isLogout}`);

        if (isLogout) {
          console.log('[WA] Logout detectado. Limpiando credenciales...');
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); ensureDataDirs(); } catch {}
          // Reiniciar todo el motor tras logout
          setTimeout(startWhatsApp, 5000);
        } else {
          // Reconexión simple
          console.log('[WA] Reconectando en 5 s...');
          setTimeout(connect, 5000);
        }
      }
    });

    // ── Mensajes entrantes ─────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async (m) => {
      console.log(`[WA-RAW] messages.upsert type=${m.type} count=${m.messages?.length}`);
      if (m.type !== 'notify' && m.type !== 'append') return;

      for (const msg of m.messages) {
        console.log(`[WA-RAW-MSG] fromMe=${msg.key.fromMe} jid=${msg.key.remoteJid} hasBody=${!!msg.message}`);
        if (msg.key.fromMe || !msg.message) continue;

        const rawJid = msg.key.remoteJid;
        if (!rawJid || rawJid.includes('@g.us')) continue;

        const normalizedJid = jidNormalizedUser(rawJid);
        const isLid         = normalizedJid.includes('@lid');
        const numPart       = normalizedJid.split('@')[0];
        const fullNumber    = isLid ? `${numPart}@lid` : numPart;

        const mBody =
          msg.message?.conversation              ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption     ||
          msg.message?.videoMessage?.caption     ||
          null;

        let content = mBody;
        if (!content) {
          if      (msg.message?.imageMessage)    content = '[Imagen 🖼️]';
          else if (msg.message?.videoMessage)    content = '[Video 📹]';
          else if (msg.message?.audioMessage)    content = '[Audio 🎙️]';
          else if (msg.message?.documentMessage) content = '[Documento 📄]';
          else if (msg.message?.stickerMessage)  content = '[Sticker]';
          else                                   content = '[Mensaje no soportado]';
        }

        const ts    = Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
        const entry = {
          id:        msg.key.id || `${Date.now()}`,
          from:      fullNumber,
          text:      content,
          fromMe:    false,
          timestamp: ts * 1000,
          pushName:  msg.pushName || ''
        };

        if (!global.waMessages[fullNumber]) global.waMessages[fullNumber] = [];
        const seen = global.waMessages[fullNumber].some(x => x.id === entry.id);
        if (!seen) {
          global.waMessages[fullNumber].push(entry);
          console.log(`[WA] 📨 Mensaje de ${fullNumber}: ${content.substring(0, 40)}`);
          if (ts > (Date.now() / 1000) - 60) {
            global.waUnreads[fullNumber] = (global.waUnreads[fullNumber] || 0) + 1;
            persistUnreads();
          }
          persistMessages();
        }
      }
    });
  }

  // ── Motor de Campañas ──────────────────────────────────────────────────
  async function processCampaignsLoop() {
    console.log('[Campaigns] Iniciando loop de procesamiento...');
    
    while (true) {
      await new Promise(r => setTimeout(r, 20000)); // Check every 20s
      
      const now = Date.now();
      const pending = global.campaigns.filter(c => c.status === 'pending' && new Date(c.scheduledAt).getTime() <= now);
      
      for (const campaign of pending) {
        console.log(`[Campaigns] Procesando campaña: ${campaign.name || campaign.id}`);
        campaign.status = 'processing';
        persistCampaigns();
        
        let successCount = 0;
        let failCount = 0;
        
        for (const contact of campaign.contacts) {
          if (!global.waSocket || !global.waStatus.connected) {
             console.error('[Campaigns] WhatsApp desconectado, abortando envío.');
             break;
          }

          try {
            let phone = String(contact.phone || '').replace(/[\s\-\+\(\)]/g, '');
            if (phone.length === 10 && !phone.includes('@lid')) {
                phone = '521' + phone;
            }
            const jid = phone.includes('@lid') ? phone : `${phone}@s.whatsapp.net`;
            
            // Personalización básica
            let finalMsg = campaign.message;
            if (contact.nombre) finalMsg = finalMsg.replace(/{nombre}/gi, contact.nombre);
            if (contact.empresa) finalMsg = finalMsg.replace(/{empresa}/gi, contact.empresa);

            const msgOptions = { text: finalMsg.trim() };
            if (campaign.image) {
              // Si hay imagen (esperamos base64 o URL)
              msgOptions.image = { url: campaign.image };
              msgOptions.caption = finalMsg.trim();
              delete msgOptions.text;
            }

            await global.waSocket.sendMessage(jid, msgOptions);
            
            // Registrar en historial local
            if (!global.waMessages[phone]) global.waMessages[phone] = [];
            global.waMessages[phone].push({
              id: `cmp_${Date.now()}`,
              from: phone,
              text: finalMsg.trim() + (campaign.image ? ' [Imagen 🖼️]' : ''),
              fromMe: true,
              timestamp: Date.now(),
            });
            persistMessages();

            contact.status = 'sent';
            successCount++;
            console.log(`[Campaigns] Mensaje enviado a ${phone} (${successCount}/${campaign.contacts.length})`);
          } catch (err) {
            contact.status = 'failed';
            contact.errorMsg = err.message;
            failCount++;
            console.error(`[Campaigns] Error enviando a ${contact.phone}:`, err.message);
          }

          // Guardar estado intermedio
          persistCampaigns();

          // Anti-ban delay: 6 segundos
          await new Promise(r => setTimeout(r, 6000));
        }

        campaign.status = 'completed';
        campaign.results = { success: successCount, failed: failCount, finishedAt: new Date().toISOString() };
        persistCampaigns();
        console.log(`[Campaigns] Campaña finalizada: ${campaign.name || campaign.id}. Éxitos: ${successCount}, Errores: ${failCount}`);
      }
    }
  }

  // ── Campaña Cumpleañera ─────────────────────────────────────────────────────
  const CONFIG_FILE = path.join(BASE_STORAGE, 'config.json');

  function loadConfig() {
    try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch {}
    return {};
  }

  async function processBirthdayCampaign() {
    const cfg = loadConfig();
    const bc  = cfg.birthdayCampaign;
    if (!bc?.enabled || !bc?.message?.trim()) return;

    const GAS_URL = process.env.GAS_URL;
    if (!GAS_URL) return console.warn('[Birthday] GAS_URL no configurado.');

    const today    = new Date();
    const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    console.log(`[Birthday] Buscando cumpleañeros del día ${monthDay}...`);

    let contacts = [];
    try {
      const res  = await fetch(`${GAS_URL}?action=getContacts&userId=system&userRole=Gerente`);
      const data = await res.json();
      contacts   = data.data || [];
    } catch (err) {
      return console.error('[Birthday] Error obteniendo contactos:', err.message);
    }

    const todayBirthdays = contacts.filter(c => {
      if (!c.Cumpleanos) return false;
      const bday = String(c.Cumpleanos).trim();
      // Support full dates (YYYY-MM-DD) or just MM-DD
      return bday.endsWith(monthDay) || bday === monthDay;
    });

    if (todayBirthdays.length === 0) {
      return console.log('[Birthday] Sin cumpleañeros hoy.');
    }

    console.log(`[Birthday] 🎂 ${todayBirthdays.length} cumpleañeros hoy. Iniciando envíos...`);

    for (const contact of todayBirthdays) {
      if (!global.waSocket || !global.waStatus.connected) {
        console.warn('[Birthday] WhatsApp desconectado, deteniendo envíos.');
        break;
      }

      let phone = String(contact.Telefono || '').replace(/[\s\-\+\(\)]/g, '');
      if (!phone) { console.warn(`[Birthday] ${contact.Nombre_Persona} sin teléfono, omitiendo.`); continue; }
      if (phone.length === 10) phone = '521' + phone;
      const jid = `${phone}@s.whatsapp.net`;

      const msg = (bc.message)
        .replace(/{nombre}/gi, contact.Nombre_Persona || 'amigo')
        .replace(/{empresa}/gi, contact.Nombre_Empresa || '');

      try {
        await global.waSocket.sendMessage(jid, { text: msg.trim() });
        if (!global.waMessages[phone]) global.waMessages[phone] = [];
        global.waMessages[phone].push({
          id: `bday_${Date.now()}`,
          from: phone, text: msg.trim(), fromMe: true, timestamp: Date.now()
        });
        persistMessages();
        console.log(`[Birthday] ✅ Felicitación enviada a ${contact.Nombre_Persona} (${phone})`);
      } catch (err) {
        console.error(`[Birthday] ❌ Error enviando a ${phone}:`, err.message);
      }

      // Anti-ban delay
      await new Promise(r => setTimeout(r, 8000));
    }
    console.log('[Birthday] Envíos de cumpleaños finalizados.');
  }

  async function birthdayCampaignLoop() {
    let lastRunDate = null;
    while (true) {
      await new Promise(r => setTimeout(r, 60000)); // check every minute
      try {
        const cfg         = loadConfig();
        const targetHour  = cfg.birthdayCampaign?.hour ?? 10;
        const now         = new Date();
        const todayStr    = now.toDateString();
        if (now.getHours() === targetHour && now.getMinutes() === 0 && lastRunDate !== todayStr) {
          lastRunDate = todayStr;
          await processBirthdayCampaign();
        }
      } catch (err) {
        console.error('[Birthday] Error en loop:', err.message);
      }
    }
  }

  // Iniciar loops
  connect();
  processCampaignsLoop().catch(err => console.error('[Campaigns] Error fatal en loop:', err));
  birthdayCampaignLoop().catch(err => console.error('[Birthday] Error fatal en loop:', err));
}

// ── Arranque principal ────────────────────────────────────────────────────────
async function main() {
  console.log(`--- Aurora Boot ${SERVER_VERSION} ---`);
  ensureDataDirs();
  console.log(`[System] BASE_STORAGE: ${BASE_STORAGE}`);

  try {
    fs.writeFileSync(path.join(BASE_STORAGE, '.write_test'), Date.now().toString());
    console.log('[System] Persistencia: OK');
  } catch (e) {
    console.error('[System] ❌ ERROR de persistencia:', e.message);
  }

  // WhatsApp en background — un error aquí NO detiene Next.js
  startWhatsApp().catch(err => console.error('[WA] Error en arranque inicial:', err?.message));

  console.log('[Next] Preparando entorno...');
  await app.prepare();

  createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  }).listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 Aurora ONLINE en puerto ${port}\n`);
  });
}

// ── Guardianes del proceso ────────────────────────────────────────────────────
process.on('uncaughtException',  err    => console.error('[Process] uncaughtException:',  err?.message));
process.on('unhandledRejection', reason => console.error('[Process] unhandledRejection:', reason?.message || reason));

main().catch(err => {
  console.error('[Main] Error fatal:', err);
  process.exit(1);
});
