import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  let version, isLatest;
  
  try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
      isLatest = result.isLatest;
      console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);
  } catch (error) {
      console.error('Error fetching latest WA version, using default.', error);
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    console.log('Update:', update);
  });
  sock.ev.on('creds.update', saveCreds);
}

connect();
