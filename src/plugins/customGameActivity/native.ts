/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Uploads a (small) cover image to catbox.moe from the main process (no CORS),
// returning a direct URL. Discord's mp:external proxy fetches it server-side,
// so the cover shows for everyone regardless of client CSP.
export async function uploadImage(_: any, opts: { bytes: Uint8Array; name: string; }): Promise<{ ok: boolean; url?: string; error?: string; }> {
    try {
        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", new Blob([opts.bytes]), opts.name || "cover.png");

        const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form as any });
        const text = (await res.text()).trim();

        if (!res.ok || !/^https?:\/\//.test(text))
            return { ok: false, error: text || `Upload failed (HTTP ${res.status})` };

        return { ok: true, url: text };
    } catch (e: any) {
        return { ok: false, error: String(e?.message || e) };
    }
}
