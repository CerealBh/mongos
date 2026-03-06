const fs = require('fs');

// PokéAPI has all Pokémon species names in every language including Japanese (ja) and Portuguese (pt)
// Language codes: "en", "ja" (kanji/kana), "ja-Hrkt" (furigana), "pt-BR" (Portuguese Brazil)

async function fetchWithConcurrency(urls, concurrency = 30) {
    const results = [];
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(url => fetch(url).then(r => r.json()).catch(() => null))
        );
        results.push(...batchResults);
        process.stdout.write(`\r  Progresso: ${Math.min(i + concurrency, urls.length)}/${urls.length}...`);
    }
    return results;
}

async function main() {
    console.log('Buscando lista de espécies Pokémon na PokéAPI...');

    const listRes = await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=2000');
    const listData = await listRes.json();

    console.log(`Total de espécies: ${listData.count}. Baixando detalhes...`);

    const urls = listData.results.map(s => s.url);
    const species = await fetchWithConcurrency(urls, 40);
    console.log('\nDados baixados! Construindo dicionário...');

    // nameMap já existente (PT<->EN<->etc de cartas ocidentais)
    let nameMap = {};
    if (fs.existsSync('data/name-map.json')) {
        nameMap = JSON.parse(fs.readFileSync('data/name-map.json'));
    }

    let added = 0;

    for (const sp of species) {
        if (!sp || !sp.names) continue;

        const names = {};
        for (const n of sp.names) {
            const lang = n.language.name;
            // Collect en, pt-BR (or pt), ja (kanji), ja-Hrkt (kana)
            if (lang === 'en') names.en = n.name;
            else if (lang === 'pt-BR' || lang === 'pt') names.pt = n.name;
            else if (lang === 'ja') names.ja_kanji = n.name;
            else if (lang === 'ja-Hrkt') names.ja = n.name;  // Katakana/Hiragana - what's on the cards
        }

        // Only build entry if we have japanese name
        if (!names.ja && !names.ja_kanji) continue;

        // The JP name on cards uses kana (ja-Hrkt), fall back to kanji
        const jpName = names.ja || names.ja_kanji;
        const enName = names.en;
        const ptName = names.pt || names.en; // fallback en if no pt translation

        if (!jpName) continue;

        const jpKey = jpName.toLowerCase();

        // Add JP -> EN/PT mapping
        if (!nameMap[jpKey]) nameMap[jpKey] = {};
        if (enName) nameMap[jpKey].en = enName;
        if (enName) nameMap[jpKey].pt = ptName;
        if (jpName) nameMap[jpKey].ja = jpName;

        // Also add EN -> JP if not exists or missing ja
        if (enName) {
            const enKey = enName.toLowerCase();
            if (!nameMap[enKey]) nameMap[enKey] = {};
            if (!nameMap[enKey].ja) nameMap[enKey].ja = jpName;
            if (!nameMap[enKey].en) nameMap[enKey].en = enName;
            if (!nameMap[enKey].pt) nameMap[enKey].pt = ptName;
        }

        // And PT -> JP
        if (ptName && ptName !== enName) {
            const ptKey = ptName.toLowerCase();
            if (!nameMap[ptKey]) nameMap[ptKey] = {};
            if (!nameMap[ptKey].ja) nameMap[ptKey].ja = jpName;
            if (!nameMap[ptKey].en) nameMap[ptKey].en = enName;
            if (!nameMap[ptKey].pt) nameMap[ptKey].pt = ptName;
        }

        added++;
    }

    console.log(`Pokémon adicionados ao dicionário: ${added}`);
    console.log(`Total de entradas no dicionário: ${Object.keys(nameMap).length}`);

    fs.writeFileSync('data/name-map.json', JSON.stringify(nameMap));
    console.log('data/name-map.json atualizado com nomes japoneses!');
}

main().catch(console.error);
