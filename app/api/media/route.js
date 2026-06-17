import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_STORAGE = fs.existsSync('/app/storage') ? '/app/storage' : process.cwd();
const SESSION_DIR = path.join(BASE_STORAGE, 'wa_session');
const MEDIA_DIR = path.join(SESSION_DIR, 'media');

export async function GET(req) {
    // 1. Validar sesión CRM
    const sessionCookie = req.cookies.get('crm_session_secure');
    if (!sessionCookie?.value) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const file = searchParams.get('file');

        if (!file) {
            return NextResponse.json({ error: 'Archivo no especificado' }, { status: 400 });
        }

        // Prevención de path traversal
        const safeFile = path.basename(file);
        const filePath = path.join(MEDIA_DIR, safeFile);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
        }

        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(safeFile).toLowerCase();

        let contentType = 'application/octet-stream';
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.mp4') contentType = 'video/mp4';
        else if (ext === '.ogg') contentType = 'audio/ogg';
        else if (ext === '.mp3') contentType = 'audio/mpeg';
        else if (ext === '.webm') contentType = 'audio/webm';
        else if (ext === '.pdf') contentType = 'application/pdf';

        return new Response(buffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });
    } catch (err) {
        console.error('[API-MEDIA] Error al servir media:', err);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
