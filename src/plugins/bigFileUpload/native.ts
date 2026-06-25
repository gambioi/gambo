/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { once } from "events";
import { PassThrough, Readable } from "stream";

// Modern Electron removed File.path and arrayBuffer() fails on huge files, so the
// renderer can't hand us a path or the whole buffer. Instead it pushes the file in
// 4 MB slices; we pipe those straight into a single streaming multipart upload
// (no temp file, no OOM, no CORS). Backpressure on the PassThrough paces the
// renderer to the real network speed, so "bytes pushed" ≈ upload progress.
type Host = "catbox" | "litterbox" | "gofile";

interface Upload {
    loaded: number;
    total: number;
    done: boolean;
    controller: AbortController;
    pass: PassThrough;
    result: Promise<{ ok: boolean; url: string; error: string; }>;
}
const uploads = new Map<string, Upload>();

export async function beginUpload(
    _: any,
    opts: { id: string; name: string; host: Host; time: string; total: number; }
): Promise<boolean> {
    const { id, name, host, time, total } = opts;
    const controller = new AbortController();
    const pass = new PassThrough({ highWaterMark: 1 << 20 });

    const u = { loaded: 0, total, done: false, controller, pass } as Upload;
    u.result = doUpload(u, { name, host, time }, controller.signal)
        .then(url => ({ ok: true, url, error: "" }))
        .catch(e => ({ ok: false, url: "", error: e?.name === "AbortError" ? "__ABORT__" : (e?.message || String(e)) }))
        .finally(() => { u.done = true; });
    uploads.set(id, u);
    return true;
}

export async function pushChunk(_: any, opts: { id: string; chunk: Uint8Array; }): Promise<boolean> {
    const u = uploads.get(opts.id);
    if (!u || u.done || u.pass.destroyed) return false;
    const buf = Buffer.from(opts.chunk);
    u.loaded += buf.length;
    if (!u.pass.write(buf)) {
        // Wait for room — but unblock if the stream is destroyed (cancel) or after a
        // safety timeout, so this can never hang the renderer's await.
        const timeout = new Promise(r => setTimeout(r, 10000));
        try { await Promise.race([once(u.pass, "drain"), once(u.pass, "close"), timeout]); } catch { /* destroyed */ }
        if (u.done || u.pass.destroyed) return false;
    }
    return true;
}

export async function endChunks(_: any, opts: { id: string; }): Promise<{ ok: boolean; url: string; error: string; }> {
    const u = uploads.get(opts.id);
    if (!u) return { ok: false, url: "", error: "upload not found" };
    if (!u.pass.destroyed) u.pass.end();
    const r = await u.result;
    setTimeout(() => uploads.delete(opts.id), 3000);
    return r;
}

export async function cancelUpload(_: any, opts: { id: string; }): Promise<boolean> {
    const u = uploads.get(opts.id);
    if (u) { u.controller.abort(); u.pass.destroy(); }
    return true;
}

// ─── Streaming multipart ────────────────────────────────────────────────────────
async function* multipart(fields: Record<string, string>, fileField: string, filename: string, pass: PassThrough, boundary: string): AsyncGenerator<Buffer> {
    for (const [k, v] of Object.entries(fields))
        yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    for await (const chunk of pass) yield chunk as Buffer;
    yield Buffer.from(`\r\n--${boundary}--\r\n`);
}

function multipartLength(fields: Record<string, string>, fileField: string, filename: string, total: number, boundary: string): number {
    let len = 0;
    for (const [k, v] of Object.entries(fields))
        len += Buffer.byteLength(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    len += Buffer.byteLength(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    len += total;
    len += Buffer.byteLength(`\r\n--${boundary}--\r\n`);
    return len;
}

async function postStream(url: string, fields: Record<string, string>, fileField: string, filename: string, u: Upload, signal: AbortSignal): Promise<Response> {
    const boundary = "----Gambo" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const len = multipartLength(fields, fileField, filename, u.total, boundary);
    const body = Readable.from(multipart(fields, fileField, filename, u.pass, boundary));
    return fetch(url, {
        method: "POST",
        body: body as any,
        duplex: "half",
        signal,
        headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
            "content-length": String(len),
        },
    } as any);
}

async function doUpload(u: Upload, opts: { name: string; host: Host; time: string; }, signal: AbortSignal): Promise<string> {
    if (opts.host === "gofile") {
        let server = "store1";
        try {
            const r = await fetch("https://api.gofile.io/servers", { signal });
            const s: any = await r.json();
            server = s?.data?.servers?.[0]?.name ?? s?.data?.server ?? server;
        } catch { /* keep default */ }

        const res = await postStream(`https://${server}.gofile.io/contents/uploadfile`, {}, "file", opts.name, u, signal);
        const json: any = await res.json();
        const link = json?.data?.downloadPage;
        if (json?.status !== "ok" || !link) throw new Error(json?.status ? `GoFile: ${json.status}` : "GoFile upload failed");
        return link;
    }

    const fields: Record<string, string> = { reqtype: "fileupload" };
    if (opts.host === "litterbox") fields.time = opts.time || "24h";
    const endpoint = opts.host === "litterbox"
        ? "https://litterbox.catbox.moe/resources/internals/api.php"
        : "https://catbox.moe/user/api.php";

    const res = await postStream(endpoint, fields, "fileToUpload", opts.name, u, signal);
    const text = (await res.text()).trim();
    if (!res.ok || !/^https?:\/\//.test(text)) throw new Error(text || `Upload failed (HTTP ${res.status})`);
    return text;
}
