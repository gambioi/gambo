/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { Divider } from "@components/Divider";
import { ErrorCard } from "@components/ErrorCard";
import { Heading } from "@components/Heading";
import { debounce } from "@shared/debounce";
import { Margins } from "@utils/margins";
import { PluginNative } from "@utils/types";
import { ActivityType } from "@gambo/discord-types/enums";
import { Button, Forms, React, Select, Text, TextInput, useState } from "@webpack/common";

import CustomGameActivityPlugin, {
    DetectableGame,
    enableGameActivity,
    getDetectableGames,
    isGameActivityEnabled,
    Mode,
    setGameActivity,
    settings,
} from ".";

const Native = GamboNative.pluginHelpers.CustomGameActivity as PluginNative<typeof import("./native")>;

const applyRPC = debounce(() => {
    setGameActivity(true);
    if (isPluginEnabled(CustomGameActivityPlugin.name)) setGameActivity();
});

function iconUrl(g: DetectableGame) {
    return g.icon
        ? `https://cdn.discordapp.com/app-icons/${g.id}/${g.icon}.png?size=32`
        : undefined;
}

function GamePicker() {
    const s = settings.use();
    const [query, setQuery] = useState("");
    const [games, setGames] = useState<DetectableGame[]>([]);
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        setLoading(true);
        getDetectableGames().then(list => {
            setGames(list);
            setLoading(false);
        });
    }, []);

    const q = query.trim().toLowerCase();
    const results = q.length < 2
        ? []
        : games.filter(g => g.name.toLowerCase().includes(q)).slice(0, 40);

    function pick(g: DetectableGame) {
        settings.store.gameId = g.id;
        settings.store.gameName = g.name;
        applyRPC();
    }

    return (
        <div>
            <Heading tag="h5">Search a real game</Heading>
            <TextInput
                type="text"
                placeholder={loading ? "Loading game list…" : "Type at least 2 letters (e.g. Valorant)"}
                value={query}
                onChange={setQuery}
                disabled={loading}
            />

            {s.gameId && (
                <Text variant="text-sm/normal" style={{ marginTop: 8 }}>
                    Selected: <strong>{s.gameName}</strong> ({s.gameId})
                </Text>
            )}

            <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {results.map(g => (
                    <div
                        key={g.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => pick(g)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px",
                            borderRadius: 6,
                            cursor: "pointer",
                            background: g.id === s.gameId ? "var(--background-modifier-selected)" : "transparent",
                        }}
                    >
                        {iconUrl(g)
                            ? <img src={iconUrl(g)} width={24} height={24} style={{ borderRadius: 6 }} alt="" />
                            : <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--background-modifier-accent)" }} />}
                        <Text variant="text-md/normal">{g.name}</Text>
                    </div>
                ))}
                {q.length >= 2 && results.length === 0 && !loading && (
                    <Text variant="text-sm/normal" style={{ opacity: 0.6 }}>No game found.</Text>
                )}
            </div>
        </div>
    );
}

function CoverDropzone() {
    const s = settings.use();
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    async function handleFile(file?: File | null) {
        if (!file) return;
        if (!file.type.startsWith("image/")) { setError("Not an image file."); return; }
        setUploading(true);
        setError(null);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const res = await Native.uploadImage({ bytes, name: file.name });
            if (res.ok && res.url) {
                settings.store.coverUrl = res.url;
                applyRPC();
            } else {
                setError(res.error || "Upload failed.");
            }
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setUploading(false);
        }
    }

    return (
        <div>
            <Heading tag="h5">Cover image</Heading>
            <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    minHeight: 88,
                    padding: 12,
                    borderRadius: 8,
                    border: `2px dashed ${dragOver ? "var(--brand-500)" : "var(--background-modifier-accent)"}`,
                    background: dragOver ? "var(--background-modifier-hover)" : "transparent",
                    cursor: "pointer",
                    textAlign: "center",
                }}
            >
                {s.coverUrl
                    ? <img src={s.coverUrl} width={64} height={64} style={{ borderRadius: 8, objectFit: "cover" }} alt="" />
                    : null}
                <Text variant="text-md/normal">
                    {uploading ? "Uploading…" : s.coverUrl ? "Cover set — drop or click to replace" : "Drag an image here, or click to choose"}
                </Text>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={e => handleFile(e.target.files?.[0])}
            />
            {error && <Text variant="text-sm/normal" style={{ color: "var(--text-danger)", marginTop: 4 }}>{error}</Text>}
            {s.coverUrl && (
                <Text variant="text-sm/normal" style={{ opacity: 0.6, marginTop: 4, wordBreak: "break-all" }}>{s.coverUrl}</Text>
            )}
        </div>
    );
}

function ImageFields() {
    const s = settings.use();

    function bind(key: "coverUrl" | "coverText" | "smallUrl" | "smallText") {
        return (v: string) => { settings.store[key] = v; applyRPC(); };
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <CoverDropzone />
            <div>
                <Heading tag="h5">…or paste a cover image URL</Heading>
                <TextInput type="text" placeholder="https://i.imgur.com/…​.png — direct image link" value={s.coverUrl ?? ""} onChange={bind("coverUrl")} />
                <Text variant="text-sm/normal" style={{ opacity: 0.6, marginTop: 4 }}>
                    In Real-game mode, leave empty to keep the game's own box art.
                </Text>
            </div>
            <div>
                <Heading tag="h5">Cover hover text</Heading>
                <TextInput type="text" placeholder="Optional" value={s.coverText ?? ""} onChange={bind("coverText")} />
            </div>
            <div>
                <Heading tag="h5">Small image URL</Heading>
                <TextInput type="text" placeholder="Optional direct image link" value={s.smallUrl ?? ""} onChange={bind("smallUrl")} />
            </div>
            <div>
                <Heading tag="h5">Small image hover text</Heading>
                <TextInput type="text" placeholder="Optional" value={s.smallText ?? ""} onChange={bind("smallText")} />
            </div>
        </div>
    );
}

function CustomFields() {
    const s = settings.use();

    function bind(key: "appName" | "appID" | "details" | "state") {
        return (v: string) => { settings.store[key] = v; applyRPC(); };
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
                <Heading tag="h5">Activity Type</Heading>
                <Select
                    placeholder="Select a type"
                    options={[
                        { label: "Playing", value: ActivityType.PLAYING, default: true },
                        { label: "Listening", value: ActivityType.LISTENING },
                        { label: "Watching", value: ActivityType.WATCHING },
                        { label: "Competing", value: ActivityType.COMPETING },
                    ]}
                    closeOnSelect={true}
                    select={v => { settings.store.type = v; applyRPC(); }}
                    isSelected={v => v === (settings.store.type ?? ActivityType.PLAYING)}
                    serialize={v => String(v)}
                />
            </div>
            <div>
                <Heading tag="h5">Name (required)</Heading>
                <TextInput type="text" placeholder="e.g. Minecraft" value={s.appName ?? ""} onChange={bind("appName")} />
            </div>
            <div>
                <Heading tag="h5">Application ID (optional — needed for cover image)</Heading>
                <TextInput type="text" placeholder="Discord app ID for image assets" value={s.appID ?? ""} onChange={bind("appID")} />
            </div>
            <div>
                <Heading tag="h5">Details (line 1)</Heading>
                <TextInput type="text" placeholder="Optional" value={s.details ?? ""} onChange={bind("details")} />
            </div>
            <div>
                <Heading tag="h5">State (line 2)</Heading>
                <TextInput type="text" placeholder="Optional" value={s.state ?? ""} onChange={bind("state")} />
            </div>
        </div>
    );
}

export function GameActivitySettings() {
    const s = settings.use();
    const gameActivityEnabled = isGameActivityEnabled();
    const mode = s.mode ?? Mode.GAME;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!gameActivityEnabled && (
                <ErrorCard style={{ padding: "1em" }}>
                    <Forms.FormTitle>Notice</Forms.FormTitle>
                    <Forms.FormText>Game Activity sharing is off — nobody will see this status.</Forms.FormText>
                    <Button color={Button.Colors.TRANSPARENT} className={Margins.top8} onClick={enableGameActivity}>
                        Enable
                    </Button>
                </ErrorCard>
            )}

            <div>
                <Heading tag="h5">Mode</Heading>
                <Select
                    options={[
                        { label: "Real game (real icon + name)", value: Mode.GAME, default: true },
                        { label: "Custom (fully custom text)", value: Mode.CUSTOM },
                    ]}
                    closeOnSelect={true}
                    select={v => { settings.store.mode = v; applyRPC(); }}
                    isSelected={v => v === mode}
                    serialize={v => String(v)}
                />
            </div>

            <div>
                <Heading tag="h5">Show elapsed timer</Heading>
                <Select
                    options={[
                        { label: "Off", value: false, default: true },
                        { label: "On (since now)", value: true },
                    ]}
                    closeOnSelect={true}
                    select={v => { settings.store.timestamp = v; applyRPC(); }}
                    isSelected={v => v === (settings.store.timestamp ?? false)}
                    serialize={v => String(v)}
                />
            </div>

            <Divider />

            {mode === Mode.GAME ? <GamePicker /> : <CustomFields />}

            <Divider />

            <ImageFields />
        </div>
    );
}
