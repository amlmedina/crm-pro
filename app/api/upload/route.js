import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_STORAGE = fs.existsSync('/app/storage') ? '/app/storage' : process.cwd();
const SESSION_DIR = path.join(BASE_STORAGE, 'wa_session');
const MEDIA_DIR = path.join(SESSION_DIR, 'media');

export async function POST(req) {
    const sessionCookie = req.cookies.get('crm_session_secure');
    if (!sessionCookie?.value) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'Archivo no provisto' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const origName = file.name || 'archivo';
        const ext = path.extname(origName) || '.bin';
        const sanitizedExt = ext.replace(/[^a-zA-Z0-9\.]/g, '');
        const filename = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${sanitizedExt}`;
        
        if (!fs.existsSync(MEDIA_DIR)) {
            fs.mkdirSync(MEDIA_DIR, { recursive: true });
        }
        
        const filePath = path.join(MEDIA_DIR, filename);
        fs.writeFileSync(filePath, buffer);

        const url = `/api/media?file=${encodeURIComponent(filename)}`;
        return NextResponse.json({ ok: true, url, name: origName, mimeType: file.type });
    } catch (err) {
        console.error('[API-UPLOAD] Error:', err);
        return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
    }
}
