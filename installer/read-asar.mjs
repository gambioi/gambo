import { listPackage, extractFile } from "@electron/asar";

const asarPath = "C:\\Users\\hanou\\AppData\\Local\\DiscordCanary\\app-1.0.982\\resources\\app.asar";

const files = listPackage(asarPath);
console.log("=== Fichiers dans app.asar (" + files.length + " total) ===");
files.slice(0, 40).forEach(f => console.log(f));

// Lire package.json pour trouver l'entree principale
try {
    const pkg = JSON.parse(extractFile(asarPath, "package.json").toString());
    console.log("\n=== package.json ===");
    console.log(JSON.stringify(pkg, null, 2));
} catch(e) {
    console.log("Pas de package.json a la racine");
}

// Chercher les fichiers bootstrap/index
files.filter(f => f.includes("bootstrap") || f.includes("index.js") || f.endsWith("main.js")).forEach(f => {
    console.log("\n=== " + f + " (premiers 300 chars) ===");
    try {
        const content = extractFile(asarPath, f.replace(/^\//, "")).toString().substring(0, 300);
        console.log(content);
    } catch(e) {}
});
