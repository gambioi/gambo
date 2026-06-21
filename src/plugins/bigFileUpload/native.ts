/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Runs in the main (Node) process — no browser CORS, so the upload host accepts it.
export async function uploadFile(
    _: any,
    opts: { data: ArrayBuffer; name: string; host: "catbox" | "litterbox"; time: string; }
): Promise<string> {
    const { data, name, host, time } = opts;

    const form = new FormData();
    form.append("reqtype", "fileupload");
    if (host === "litterbox") form.append("time", time || "24h");
    form.append("fileToUpload", new Blob([data]), name);

    const endpoint = host === "litterbox"
        ? "https://litterbox.catbox.moe/resources/internals/api.php"
        : "https://catbox.moe/user/api.php";

    const res = await fetch(endpoint, { method: "POST", body: form });
    const text = (await res.text()).trim();

    if (!res.ok || !/^https?:\/\//.test(text))
        throw new Error(text || `Upload failed (HTTP ${res.status})`);

    return text;
}
