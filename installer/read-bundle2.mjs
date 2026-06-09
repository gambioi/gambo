import { extractFile } from "@electron/asar";

const asarPath = "C:\\Users\\hanou\\AppData\\Local\\DiscordCanary\\app-1.0.982\\resources\\app.asar";

const bundle = extractFile(asarPath, "bundle.js").toString();

// Chercher requireNative
function showContext(keyword, maxResults = 3) {
    let count = 0;
    let start = 0;
    while (count < maxResults) {
        const idx = bundle.indexOf(keyword, start);
        if (idx === -1) break;
        console.log(`\n=== "${keyword}" @ ${idx} ===`);
        console.log(bundle.substring(Math.max(0, idx-300), idx+500));
        console.log("---");
        start = idx + keyword.length;
        count++;
    }
}

showContext("requireNative", 5);
