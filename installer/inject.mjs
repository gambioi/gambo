/**
 * Gambo - Injecteur via discord_desktop_core/index.js
 * Usage:
 *   node inject.mjs install            -> Gambo, démarrage Discord NORMAL
 *   node inject.mjs install --openasar -> Gambo + OpenAsar (démarrage rapide)
 *   node inject.mjs uninstall          -> retire Gambo (et OpenAsar)
 *   node inject.mjs status
 */

import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATCHER_PATH = join(__dirname, "..", "dist", "patcher.js").replaceAll("\\", "/");
const OPENASAR_BUNDLE = join(__dirname, "openasar.asar");

const VARIANTS = [
    { name: "Discord Stable", folder: "Discord" },
    { name: "Discord PTB",    folder: "DiscordPTB" },
    { name: "Discord Canary", folder: "DiscordCanary" },
    { name: "Discord Dev",    folder: "DiscordDevelopment" },
];

const LOCAL_APP = process.env.LOCALAPPDATA
    || join(process.env.USERPROFILE ?? "C:/Users/hanou", "AppData", "Local");

function findLatestAppDir(base) {
    if (!existsSync(base)) return null;
    const dirs = readdirSync(base, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith("app-"))
        .map(e => e.name)
        .sort()
        .reverse();
    return dirs.length ? join(base, dirs[0]) : null;
}

/** Trouve le dossier discord_desktop_core dans modules/ */
function findCoreDir(modulesDir) {
    if (!existsSync(modulesDir)) return null;
    const entries = readdirSync(modulesDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith("discord_desktop_core-"))
        .sort((a, b) => b.name.localeCompare(a.name));
    if (!entries.length) return null;
    const inner = join(modulesDir, entries[0].name, "discord_desktop_core");
    return existsSync(inner) ? inner : null;
}

function isInstalled(coreDir) {
    const idxPath = join(coreDir, "index.js");
    if (!existsSync(idxPath)) return false;
    const content = readFileSync(idxPath, "utf-8");
    return content.includes("gambo") || content.includes("patcher.js");
}

// ── OpenAsar (remplacement du bootstrap app.asar pour un démarrage rapide) ────

/** Le dossier resources/ contient app.asar. appDir = .../app-X.X.X */
function getResourcesDir(appDir) {
    return join(appDir, "resources");
}

function isOpenAsarInstalled(appDir) {
    // OpenAsar est installé si un backup de l'original existe
    return existsSync(join(getResourcesDir(appDir), "app.asar.backup"));
}

function installOpenAsar(appDir, name) {
    const res = getResourcesDir(appDir);
    const asar = join(res, "app.asar");
    const backup = join(res, "app.asar.backup");

    if (!existsSync(asar)) {
        console.log(`  [SKIP] app.asar introuvable pour ${name}`);
        return;
    }
    if (!existsSync(OPENASAR_BUNDLE)) {
        console.log(`  [ERR] openasar.asar manquant dans l'installer`);
        return;
    }

    // Sauvegarder l'original UNE seule fois (ne jamais écraser le backup par OpenAsar)
    if (!existsSync(backup)) {
        copyFileSync(asar, backup);
        console.log(`  app.asar original sauvegardé → app.asar.backup`);
    }

    try { chmodSync(asar, 0o666); } catch { /* ignore */ }
    copyFileSync(OPENASAR_BUNDLE, asar);
    console.log(`  [OK] OpenAsar installé dans ${name} (démarrage rapide)`);
}

function uninstallOpenAsar(appDir, name) {
    const res = getResourcesDir(appDir);
    const asar = join(res, "app.asar");
    const backup = join(res, "app.asar.backup");

    if (!existsSync(backup)) {
        // Pas d'OpenAsar installé → rien à faire
        return;
    }
    try { chmodSync(asar, 0o666); } catch { /* ignore */ }
    copyFileSync(backup, asar);
    import("fs").then(({ unlinkSync }) => { try { unlinkSync(backup); } catch { /* */ } });
    console.log(`  [OK] OpenAsar retiré de ${name} (démarrage normal restauré)`);
}

function doInstall(appDir, name) {
    const modulesDir = join(appDir, "modules");
    const coreDir = findCoreDir(modulesDir);

    if (!coreDir) {
        console.log(`  [SKIP] discord_desktop_core introuvable dans ${modulesDir}`);
        return;
    }

    const idxPath = join(coreDir, "index.js");

    // Sauvegarder l'original si pas encore fait
    const origPath = join(coreDir, "_index.js");
    if (!existsSync(origPath)) {
        const original = readFileSync(idxPath, "utf-8");
        writeFileSync(origPath, original, "utf-8");
        console.log(`  index.js sauvegarde en _index.js`);
    }

    // Ecrire le nouvel index.js avec injection
    const injection = `try{require("${PATCHER_PATH}")}catch(e){try{require('fs').writeFileSync(require('path').join(require('os').homedir(),'gambo-error.log'),String((e&&e.stack)||e))}catch(_){}}\nmodule.exports = require('./core.asar');\n`;
    writeFileSync(idxPath, injection, "utf-8");
    console.log(`  [OK] Gambo installe dans ${name} !`);
    console.log(`  Core: ${coreDir}`);
}

function doUninstall(appDir, name) {
    const modulesDir = join(appDir, "modules");
    const coreDir = findCoreDir(modulesDir);

    if (!coreDir) {
        console.log(`  [SKIP] discord_desktop_core introuvable`);
        return;
    }

    const idxPath  = join(coreDir, "index.js");
    const origPath = join(coreDir, "_index.js");

    if (!existsSync(origPath)) {
        console.log(`  Gambo pas installe dans ${name}`);
        return;
    }

    const original = readFileSync(origPath, "utf-8");
    writeFileSync(idxPath, original, "utf-8");

    import("fs").then(({ unlinkSync }) => {
        try { unlinkSync(origPath); } catch(e) {}
    });

    console.log(`  [OK] Gambo desinstalle de ${name} !`);
}

// ── Main ────────────────────────────────────────────────────────────────────
const action = process.argv[2];
const wantOpenAsar = process.argv.includes("--openasar");

if (!action || !["install", "uninstall", "status"].includes(action)) {
    console.log("Usage: node inject.mjs [install|uninstall|status] [--openasar]");
    console.log("  install            -> Gambo, démarrage Discord normal");
    console.log("  install --openasar -> Gambo + OpenAsar (démarrage rapide)");
    process.exit(1);
}

let found = false;
for (const v of VARIANTS) {
    const appDir = findLatestAppDir(join(LOCAL_APP, v.folder));
    if (!appDir) continue;

    found = true;

    if (action === "status") {
        const coreDir = findCoreDir(join(appDir, "modules"));
        const oa = isOpenAsarInstalled(appDir) ? " + OpenAsar" : "";
        if (!coreDir) {
            console.log(`${v.name}: discord_desktop_core introuvable`);
        } else {
            console.log(`${v.name}: ${isInstalled(coreDir) ? "[INSTALLE]" : "non installe"}${oa}`);
        }
    } else if (action === "install") {
        console.log(`\nInstallation dans ${v.name}...`);
        doInstall(appDir, v.name);
        if (wantOpenAsar) {
            installOpenAsar(appDir, v.name);
        } else {
            // Mode normal : s'assurer qu'OpenAsar n'est PAS actif
            uninstallOpenAsar(appDir, v.name);
        }
    } else {
        console.log(`\nDesinstallation de ${v.name}...`);
        doUninstall(appDir, v.name);
        // Désinstaller Gambo retire aussi OpenAsar (retour vanilla complet)
        uninstallOpenAsar(appDir, v.name);
    }
}

if (!found) console.log("Aucune installation Discord trouvee.");
