/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addChatBarButton, ChatBarButton, ChatBarButtonFactory, removeChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Toasts } from "@webpack/common";

const Native = GamboNative.pluginHelpers.BigFileUpload as PluginNative<typeof import("./native")>;

const settings = definePluginSettings({
    host: {
        type: OptionType.SELECT,
        description: "Where to upload the file",
        options: [
            { label: "Catbox — permanent, up to 200 MB", value: "catbox", default: true },
            { label: "Litterbox — temporary, up to 1 GB", value: "litterbox" }
        ]
    },
    litterboxTime: {
        type: OptionType.SELECT,
        description: "Litterbox expiry time (only for Litterbox)",
        options: [
            { label: "1 hour", value: "1h" },
            { label: "12 hours", value: "12h" },
            { label: "24 hours", value: "24h", default: true },
            { label: "3 days", value: "72h" }
        ]
    }
});

function showToast(type: number, message: string) {
    Toasts.show({ id: Toasts.genId(), type, message, options: { position: Toasts.Position.BOTTOM } });
}

function pickAndUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        const loadingId = Toasts.genId();
        Toasts.show({
            id: loadingId,
            type: Toasts.Type.MESSAGE,
            message: `Uploading ${file.name}…`,
            options: { duration: 100000, position: Toasts.Position.BOTTOM }
        });

        try {
            const data = await file.arrayBuffer();
            const url = await Native.uploadFile({
                data,
                name: file.name,
                host: settings.store.host as "catbox" | "litterbox",
                time: settings.store.litterboxTime
            });
            Toasts.pop(loadingId);
            insertTextIntoChatInputBox(url + " ");
            showToast(Toasts.Type.SUCCESS, "Uploaded! Link added to your message box.");
        } catch (err: any) {
            Toasts.pop(loadingId);
            showToast(Toasts.Type.FAILURE, "Upload failed: " + (err?.message ?? String(err)));
        }
    };
    input.click();
}

const UploadIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 13a1 1 0 0 1 1 1v3h12v-3a1 1 0 1 1 2 0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a1 1 0 0 1 1-1Z" />
        <path d="M12 3a1 1 0 0 1 .71.29l4 4a1 1 0 0 1-1.42 1.42L13 6.41V15a1 1 0 1 1-2 0V6.41L8.71 8.71A1 1 0 0 1 7.3 7.29l4-4A1 1 0 0 1 12 3Z" />
    </svg>
);

const ChatBarIcon: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat) return null;
    return (
        <ChatBarButton tooltip="Upload a big file (no Nitro)" onClick={pickAndUpload}>
            <UploadIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "BigFileUpload",
    description: "Send large files without Nitro — uploads to Catbox/Litterbox and pastes the link into your message.",
    authors: [{ name: "Gambo", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    settings,

    start() {
        addChatBarButton("BigFileUpload", ChatBarIcon, UploadIcon);
    },

    stop() {
        removeChatBarButton("BigFileUpload");
    }
});
