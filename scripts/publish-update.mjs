/**
 * Gambo - Publier une mise à jour pour tes amis.
 *
 * Usage : pnpm publish-update
 *
 * Ce que ça fait, en une commande :
 *   1. Commit + push de tes changements sur GitHub (gambioi/gambo)
 *   2. Build standalone (le hash du commit est intégré au build)
 *   3. Crée une Release GitHub nommée "Gambo <hash>" avec les fichiers
 *      du build attachés.
 *
 * Tes amis n'ont plus qu'à cliquer "Update" dans Gambo -> ils reçoivent
 * tes nouveaux plugins.
 *
 * Pré-requis (une seule fois) :
 *   - GitHub CLI installé : winget install GitHub.cli
 *   - Authentifié : gh auth login
 *   - Repo créé + poussé : gh repo create gambioi/gambo --public --source=. --remote=origin --push
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

function run(cmd, opts = {}) {
    console.log(`\n$ ${cmd}`);
    execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}
function out(cmd) {
    return execSync(cmd, { encoding: "utf-8", cwd: ROOT }).trim();
}
function tryRun(cmd) {
    try { run(cmd); return true; } catch { return false; }
}

// Vérifs préalables
try { out("gh --version"); } catch {
    console.error("\n[ERREUR] GitHub CLI (gh) introuvable.");
    console.error("Installe-le : winget install GitHub.cli  puis  gh auth login");
    process.exit(1);
}

console.log("=== 1/4 : Commit + push ===");
tryRun("git add -A");
// --allow-empty garantit un NOUVEAU hash à chaque publication (même sans changement),
// indispensable pour que l'updater détecte une nouvelle version.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
tryRun(`git commit --allow-empty -m "publish update ${stamp}"`);
run("git push");

console.log("\n=== 2/4 : Build ===");
run("pnpm buildStandalone");

const hash = out("git rev-parse --short HEAD");
console.log(`\n=== 3/4 : Hash du build = ${hash} ===`);

// Fichiers à attacher (Discord desktop + Vesktop)
const candidates = [
    "patcher.js", "preload.js", "renderer.js", "renderer.css",
    "gamboDesktopMain.js", "gamboDesktopPreload.js", "gamboDesktopRenderer.js", "gamboDesktopRenderer.css"
];
const assets = candidates
    .map(f => join(DIST, f))
    .filter(p => existsSync(p))
    .map(p => `"${p}"`)
    .join(" ");

console.log("\n=== 4/4 : Création de la Release GitHub ===");
// Le NOM de la release DOIT finir par le hash : l'updater lit le dernier mot.
run(`gh release create "${hash}" ${assets} --title "Gambo ${hash}" --notes "Mise à jour Gambo ${stamp}"`);

console.log(`\n✅ Publié ! Release "Gambo ${hash}" en ligne.`);
console.log("   Tes amis -> Gambo -> Updater -> 'Check for Updates' -> 'Update Now' -> redémarrer.");
