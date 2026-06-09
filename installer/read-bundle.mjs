import { extractFile } from "@electron/asar";

const asarPath = "C:\\Users\\hanou\\AppData\\Local\\DiscordCanary\\app-1.0.982\\resources\\app.asar";

try {
    const bundle = extractFile(asarPath, "bundle.js").toString();
    console.log("=== bundle.js (premiers 3000 chars) ===");
    console.log(bundle.substring(0, 3000));
    console.log("\n=== Recherche 'desktop_core' ===");
    const idx = bundle.indexOf("desktop_core");
    if (idx !== -1) console.log(bundle.substring(Math.max(0, idx-200), idx+500));
    console.log("\n=== Recherche 'modules' ===");
    const idx2 = bundle.indexOf("modules");
    if (idx2 !== -1) console.log(bundle.substring(Math.max(0, idx2-100), idx2+300));
    console.log("\n=== Recherche 'appData' ou 'roaming' ===");
    ["appData","roaming","userData","getPath"].forEach(k => {
        const i = bundle.indexOf(k);
        if (i !== -1) console.log(`  [${k}] @ ${i}: ` + bundle.substring(Math.max(0,i-100), i+200));
    });
} catch(e) {
    console.error("Erreur:", e.message);
}
