import { extractFile } from "@electron/asar";

const asarPath = "C:\\Users\\hanou\\AppData\\Local\\DiscordCanary\\app-1.0.982\\resources\\app.asar";
const bundle = extractFile(asarPath, "bundle.js").toString();

// Chercher comment les paths sont configures pour les modules natifs
const keywords = [
    "globalPaths",
    "Module.paths",
    "nativeModule.paths",
    "addToNodePath",
    "node_modules_path",
    "app-",
    "modules/discord",
    "_pathsForModule",
    "paths.unshift",
    "paths.splice",
];

keywords.forEach(k => {
    const i = bundle.indexOf(k);
    if (i !== -1) {
        console.log(`\n=== "${k}" @ ${i} ===`);
        console.log(bundle.substring(Math.max(0, i-200), i+400));
    }
});

// Chercher le module paths qui contient "modules"
console.log("\n=== Module 24221 (moduleUpdater) premiers 1500 chars ===");
const idx = bundle.indexOf("24221(");
if (idx !== -1) {
    console.log(bundle.substring(idx, idx+1500));
}
