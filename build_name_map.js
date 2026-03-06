const fs = require('fs');

// Parse the name object from a TypeScript card file
function extractNames(text) {
    // Match: name: { en: "...", pt: "...", ja: "...", ... }
    const nameBlockMatch = text.match(/name:\s*\{([^}]+)\}/s);
    if (!nameBlockMatch) {
        // Fallback: name might be a simple string like: name: "Pikachu"
        const simpleMatch = text.match(/name:\s*["']([^"']+)["']/);
        if (simpleMatch) return { en: simpleMatch[1] };
        return null;
    }

    const block = nameBlockMatch[1];
    const result = {};
    const langPattern = /(\w+):\s*["']([^"']+)["']/g;
    let match;
    while ((match = langPattern.exec(block)) !== null) {
        result[match[1]] = match[2];
    }
    return Object.keys(result).length > 0 ? result : null;
}

async function fetchWithConcurrency(urls, concurrency = 20) {
    const results = [];
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(url => fetch(url).then(r => r.text()).catch(() => null))
        );
        results.push(...batchResults);
        if ((i / concurrency) % 50 === 0) {
            process.stdout.write(`\r  Progresso: ${Math.min(i + concurrency, urls.length)}/${urls.length} cartas...`);
        }
    }
    return results;
}

async function main() {
    console.log('Buscando lista de arquivos do repositório TCGdex no GitHub...');

    const treeRes = await fetch('https://api.github.com/repos/tcgdex/cards-database/git/trees/master?recursive=1');
    const treeData = await treeRes.json();

    if (treeData.message) {
        console.error('Erro na API do GitHub:', treeData.message);
        return;
    }

    const cardFiles = treeData.tree.filter(item => {
        if (item.type !== 'blob') return false;
        if (!item.path.startsWith('data/')) return false;
        if (!item.path.endsWith('.ts')) return false;
        const parts = item.path.split('/');
        return parts.length === 4; // data/Series/Set/card.ts
    });

    console.log(`Encontrados ${cardFiles.length} arquivos de cartas. Baixando conteúdo...`);

    const rawBase = 'https://raw.githubusercontent.com/tcgdex/cards-database/master/';
    const urls = cardFiles.map(f => rawBase + encodeURIComponent(f.path).replace(/%2F/g, '/').replace(/%20/g, '%20'));

    const contents = await fetchWithConcurrency(urls, 30);
    console.log('\nArquivos baixados! Construindo dicionário...');

    // Build name map: key = lowercase name, value = { en, pt, ja, fr, etc. }
    // We want a unified map: any name -> { en, pt, ja }
    // Strategy: group by unique "en" name (canonical), collect all lang variants

    // nameMap: Map of "en_name_key" -> { en, pt, ja, ... }
    const nameGroups = {}; // en_name -> set of translations

    let parsed = 0;
    let withJa = 0;

    for (const text of contents) {
        if (!text) continue;
        const names = extractNames(text);
        if (!names) continue;
        parsed++;

        const key = (names.en || '').toLowerCase();
        if (!key) continue;

        if (!nameGroups[key]) {
            nameGroups[key] = { en: names.en };
        }

        const entry = nameGroups[key];
        if (names.pt) entry.pt = names.pt;
        if (names.ja) { entry.ja = names.ja; withJa++; }
        if (names.fr) entry.fr = names.fr;
        if (names.de) entry.de = names.de;
        if (names.es) entry.es = names.es;
        if (names.it) entry.it = names.it;
    }

    console.log(`Cartas processadas: ${parsed}`);
    console.log(`Com nome japonês: ${withJa}`);

    // Build lookup table: each name (in any lang) points to all equivalent names
    // This is what the app will use to expand search queries
    const lookupTable = {}; // anyName.toLowerCase() -> { en, pt, ja }

    for (const entry of Object.values(nameGroups)) {
        const langs = ['en', 'pt', 'ja', 'fr', 'de', 'es', 'it'];
        for (const lang of langs) {
            if (entry[lang]) {
                const key = entry[lang].toLowerCase();
                if (!lookupTable[key]) {
                    lookupTable[key] = {};
                }
                // Merge
                for (const l2 of langs) {
                    if (entry[l2]) lookupTable[key][l2] = entry[l2];
                }
            }
        }
    }

    console.log(`Total de entradas no dicionário: ${Object.keys(lookupTable).length}`);

    if (!fs.existsSync('data')) fs.mkdirSync('data');
    fs.writeFileSync('data/name-map.json', JSON.stringify(lookupTable));
    console.log('Dicionário salvo em data/name-map.json!');
}

main().catch(console.error);
