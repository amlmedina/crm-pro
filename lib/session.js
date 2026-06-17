/**
 * lib/session.js — Cryptographic session signing using HMAC-SHA256
 *
 * Cookie format:  base64url(payload) . base64url(hmac_signature)
 *
 * Using Node.js built-in `crypto` — zero extra dependencies.
 * The secret is read from SESSION_SECRET env var; falls back to a
 * build-time constant only when running locally without an env file.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'crm_dev_fallback_secret_change_in_production_!!';

function b64url(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function b64urlDecode(str) {
    // Restore standard base64 padding
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (padded.length % 4)) % 4;
    return Buffer.from(padded + '='.repeat(padding), 'base64');
}

function makeSignature(payload64) {
    return createHmac('sha256', SECRET).update(payload64).digest('hex');
}

/**
 * Signs a user payload object and returns the signed cookie string.
 * @param {object} payload - The user session object.
 * @returns {string}
 */
export function signSession(payload) {
    const payload64 = b64url(JSON.stringify(payload));
    const sig = makeSignature(payload64);
    return `${payload64}.${sig}`;
}

/**
 * Verifies and parses a signed cookie string.
 * Returns the parsed user object, or null if the cookie is invalid/tampered.
 * @param {string} cookieValue - The raw cookie string.
 * @returns {object|null}
 */
export function verifySession(cookieValue) {
    if (!cookieValue || typeof cookieValue !== 'string') return null;

    const parts = cookieValue.split('.');
    // A valid signed cookie has exactly 2 parts: payload64 and sig
    // (Note: sig is hex, so no dots expected, but just in case we rejoin if split oddly)
    if (parts.length < 2) return null;

    const sig = parts.pop();
    const payload64 = parts.join('.');

    const expectedSig = makeSignature(payload64);

    // Constant-time comparison to prevent timing attacks
    try {
        const sigBuf = Buffer.from(sig, 'hex');
        const expectedBuf = Buffer.from(expectedSig, 'hex');
        if (sigBuf.length !== expectedBuf.length) return null;
        if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    } catch {
        return null;
    }

    try {
        const decoded = b64urlDecode(payload64).toString('utf8');
        return JSON.parse(decoded);
    } catch {
        return null;
    }
}
