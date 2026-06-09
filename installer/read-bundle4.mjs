import { extractFile } from "@electron/asar";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const asarPath = "C:\\Users\\hanou\\AppData\\Local\\DiscordCanary\\app-1.0.982\\resources\\app.asar";
const bundle = extractFile(asarPath, "bundle.js").toString();

// Chercher comment les chemins de modules sont configures
console.log("=== Chercher _resolveFilename ===");
const idx1 = bundle.indexOf("_resolveFilename");
if (idx1 !== -1) console.log(bundle.substring(Math.max(0, idx1-200), idx1+400));

console.log("\n=== Chercher addRelativePath ou nativeModulePaths ===");
["addRelativePath","nativeModulePaths","paths.push","modulePaths"].forEach(k => {
    const i = bundle.indexOf(k);
    if (i !== -1) {
        console.log(`[${k}]: ` + bundle.substring(Math.max(0,i-100), i+300));
        console.log("---");
    }
});

// Chercher le module 24221 (moduleUpdater)
console.log("\n=== Module paths (moduleUpdater setup) ===");
const idx3 = bundle.indexOf("discord_desktop_core-");
if (idx3 !== -1) console.log(bundle.substring(Math.max(0,idx3-200), idx3+500));
else console.log("discord_desktop_core- non trouve");

// Chercher aussi dans le systeme de fichiers
console.log("\n=== Recherche fichiers .node (native modules) dans discordcanary ===");
const roaming = join(process.env.APPDATA || "C:\\Users\\hanou\\AppData\\Roaming");
const canaryRoaming = join(roaming, "discordcanary");
try {
    function findNode(dir, depth = 0) {
        if (depth > 5) return;
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                const full = join(dir, e.name);
                if (e.isDirectory()) findNode(full, depth+1);
                else if (e.name.endsWith(".node") || e.name === "index.js") {
                    console.log(full);
                }
            }
        } catch(err) {}
    }
    findNode(canaryRoaming);
} catch(e) {
    console.log("Erreur scan:", e.message);
}
