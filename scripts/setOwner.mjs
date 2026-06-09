/**
 * Remplace tous les "authors: [...]" dans les plugins par [Devs.o0]
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, extname } from "path";

const ROOT = new URL("../src/plugins", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

let changed = 0;
let skipped = 0;

function processFile(filePath) {
    const ext = extname(filePath);
    if (ext !== ".ts" && ext !== ".tsx") return;

    const original = readFileSync(filePath, "utf-8");

    // Remplace "authors: [ ... ]" meme sur plusieurs lignes
    // Le pattern capture depuis "authors:" jusqu'au "]" fermant
    const replaced = original.replace(
        /authors:\s*\[[\s\S]*?\]/g,
        "authors: [Devs.o0]"
    );

    if (replaced !== original) {
        writeFileSync(filePath, replaced, "utf-8");
        changed++;
        console.log("  [OK] " + filePath.split("src/plugins/")[1] ?? filePath);
    } else {
        skipped++;
    }
}

function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else processFile(full);
    }
}

console.log("=== Remplacement des auteurs ===\n");
walk(ROOT);
console.log(`\nTermine: ${changed} fichier(s) modifie(s), ${skipped} inchange(s).`);
