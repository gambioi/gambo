/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

// On the web/Vesktop client, Discord negotiates Opus voice as MONO, so a friend's own
// stereo (e.g. FL Studio panned right) is decoded to a single channel and heard centred.
// Force stereo by injecting `stereo=1;sprop-stereo=1` into the Opus fmtp line of every
// session description, so the media server sends — and we decode — two channels.

const STEREO_FLAG = "__gamboStereoPatched";

function mungeOpusStereo(sdp: string): string {
    if (!sdp || !/opus\/48000/i.test(sdp)) return sdp;

    const lines = sdp.split(/\r\n|\n/);

    // Collect Opus payload types from rtpmap lines
    const opusPts = new Set<string>();
    for (const l of lines) {
        const m = /^a=rtpmap:(\d+) opus\/48000/i.exec(l);
        if (m) opusPts.add(m[1]);
    }
    if (!opusPts.size) return sdp;

    const hasFmtp = new Set<string>();
    const out: string[] = [];

    for (const l of lines) {
        const m = /^a=fmtp:(\d+) (.*)$/.exec(l);
        if (m && opusPts.has(m[1])) {
            hasFmtp.add(m[1]);
            let params = m[2];
            if (!/(?:^|;)\s*stereo=/.test(params)) params += ";stereo=1";
            if (!/(?:^|;)\s*sprop-stereo=/.test(params)) params += ";sprop-stereo=1";
            out.push(`a=fmtp:${m[1]} ${params}`);
        } else {
            out.push(l);
        }
    }

    // For any Opus payload type with no fmtp line, add one right after its rtpmap
    if (hasFmtp.size < opusPts.size) {
        const final: string[] = [];
        for (const l of out) {
            final.push(l);
            const m = /^a=rtpmap:(\d+) opus\/48000/i.exec(l);
            if (m && !hasFmtp.has(m[1])) final.push(`a=fmtp:${m[1]} stereo=1;sprop-stereo=1`);
        }
        return final.join("\r\n");
    }

    return out.join("\r\n");
}

function patchRTC() {
    const RPC: any = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection;
    if (!RPC?.prototype || RPC.prototype[STEREO_FLAG]) return;

    const wrap = (orig: Function) => function (this: any, desc: any, ...rest: any[]) {
        try {
            if (desc && desc.sdp) desc = { type: desc.type, sdp: mungeOpusStereo(desc.sdp) };
        } catch { /* leave desc untouched on error */ }
        return orig.call(this, desc, ...rest);
    };

    RPC.prototype.setLocalDescription = wrap(RPC.prototype.setLocalDescription);
    RPC.prototype.setRemoteDescription = wrap(RPC.prototype.setRemoteDescription);
    RPC.prototype[STEREO_FLAG] = true;
}

export default definePlugin({
    name: "StereoAudio",
    description: "Receive voice in stereo on the web/Vesktop client by forcing stereo Opus in the WebRTC SDP. Reconnect to voice after enabling.",
    authors: [{ name: "Gambo", id: 0n }],
    tags: ["Voice", "Audio", "Stereo"],
    required: true, // on by default (does not affect screen share)

    start() {
        patchRTC();
    },
});
