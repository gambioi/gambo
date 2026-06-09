import { extractFile } from "@electron/asar";

const asarPath = "C:\\Users\\hanou\\AppData\\Local\\DiscordCanary\\app-1.0.982\\resources\\app.asar";

const bundle = extractFile(asarPath, "bundle.js").toString();

// Chercher le module 76500 (requireNative)
function findModule(id) {
    const key = id + "(";
    let idx = bundle.indexOf(key);
    while (idx !== -1) {
        // Verifier si c'est une definition de module (debut d'un bloc)
        const before = bundle.substring(Math.max(0, idx-5), idx);
        if (/[,{]/.test(before)) {
            console.log(`=== Module ${id} @ ${idx} ===`);
            console.log(bundle.substring(idx, idx+800));
            return;
        }
        idx = bundle.indexOf(key, idx+1);
    }
}

findModule(76500);

// Chercher aussi "modulesDir" ou paths
console.log("\n=== Chercher modulePath ===");
["modulesDir","nativeModules","modules_dir","module_path"].forEach(k => {
    const i = bundle.indexOf(k);
    if (i !== -1) console.log(`[${k}] @ ${i}: ` + bundle.substring(Math.max(0,i-100), i+300));
});
