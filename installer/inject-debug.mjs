/**
 * Gambo - Injection de diagnostic
 * Cree un app.asar avec try/catch qui log l'erreur et charge Discord quand meme.
 */

import { existsSync, renameSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATCHER_PATH = join(__dirname, "..", "dist", "patcher.js").replaceAll("\\", "/");
const LOG_PATH = "C:/Users/hanou/Desktop/gambo-error.log";

const LOCAL_APP = process.env.LOCALAPPDATA
    || join(process.env.USERPROFILE ?? "C:/Users/hanou", "AppData", "Local");

function findLatestAppDir(base) {
    if (!existsSync(base)) return null;
    const dirs = readdirSync(base, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith("app-"))
        .map(e => e.name).sort().reverse();
    return dirs.length ? join(base, dirs[0]) : null;
}

function buildAsar(pkgContent, idxContent) {
    const pkgBuf = Buffer.from(pkgContent, "utf8");
    const idxBuf = Buffer.from(idxContent, "utf8");
    const hdr = JSON.stringify({
        files: {
            "package.json": { size: pkgBuf.length, offset: "0" },
            "index.js":     { size: idxBuf.length, offset: String(pkgBuf.length) }
        }
    });
    const hdrBuf = Buffer.from(hdr, "utf8");
    const pad    = (4 - hdrBuf.length % 4) % 4;
    const hdrPad = Buffer.concat([hdrBuf, Buffer.alloc(pad)]);
    const prefix = Buffer.alloc(12);
    prefix.writeUInt32LE(4,                0);
    prefix.writeUInt32LE(hdrPad.length + 4, 4);
    prefix.writeUInt32LE(hdrBuf.length,    8);
    return Buffer.concat([prefix, hdrPad, pkgBuf, idxBuf]);
}

// Index.js avec diagnostic complet
const diagIndex = `
const fs = require('fs');
const path = require('path');
const log = (msg) => {
    try { fs.appendFileSync('${LOG_PATH}', new Date().toISOString() + ' ' + msg + '\\n'); } catch(e){}
};

log('=== GAMBO DEBUG START ===');
log('require.main.filename: ' + (require.main && require.main.filename));
log('require.main.path: ' + (require.main && require.main.path));
log('__dirname: ' + __dirname);
log('process.versions.electron: ' + process.versions.electron);

try {
    log('Chargement de patcher.js...');
    require('${PATCHER_PATH}');
    log('patcher.js charge avec succes !');
} catch(e) {
    log('ERREUR dans patcher.js: ' + e.message);
    log('STACK: ' + e.stack);
    // Charger Discord quand meme via _app.asar
    try {
        const mainPath = require.main && require.main.path;
        const origAsar = path.join(path.dirname(mainPath || __dirname), '_app.asar');
        log('Tentative de chargement de: ' + origAsar);
        const pkg = require(origAsar + '/package.json');
        log('package.json original lu: main=' + pkg.main);
        require(origAsar + '/' + pkg.main);
    } catch(e2) {
        log('ERREUR chargement Discord original: ' + e2.message);
        log('STACK2: ' + e2.stack);
    }
}
`;

const appDir = findLatestAppDir(join(LOCAL_APP, "DiscordCanary"));
if (!appDir) { console.log("Discord Canary non trouve"); process.exit(1); }

const res      = join(appDir, "resources");
const appAsar  = join(res, "app.asar");
const origAsar = join(res, "_app.asar");

// S'assurer que _app.asar est le Discord original
if (!existsSync(origAsar)) {
    renameSync(appAsar, origAsar);
    console.log("app.asar renomme en _app.asar");
}

// Installer l'asar de diagnostic
const pkg = '{"name":"discord","main":"index.js"}';
writeFileSync(appAsar, buildAsar(pkg, diagIndex.trim()));
console.log("Asar de diagnostic installe !");
console.log("Lance Discord Canary, puis reviens ici.");
