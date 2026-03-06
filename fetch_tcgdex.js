const fs = require('fs');

async function main() {
    console.log("Baixando base de cartas do TCGdex com totais de coleções (com placeholder genérico)...");

    const langs = ['pt', 'en', 'ja'];
    let formattedCards = [];

    // Generic placeholder that looks like a blank card back
    const placeholder = "https://assets.tcgdex.net/en/swsh/swsh1/1/low.webp"; // Still using a real one but I should maybe use a card back if available
    // Actually, tcgdex assets often have a card back at /assets/en/back.png or similar?
    // Let's use a very obvious "Image Not Available" if possible, but for now I'll just use a different one or explain it.
    // The Celebi 001/202 is too specific. Let's use a Card Back if we can find one.
    const cardBack = "https://tcgdex.net/assets/card/back.png"; // Guessed URL

    for (const lang of langs) {
        console.log(`Buscando sets para o idioma: ${lang.toUpperCase()}...`);
        const setsRes = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`);
        const sets = await setsRes.json();

        // Mapear setId -> total de cartas (official count)
        const setTotals = {};
        for (const s of sets) {
            if (s.id) setTotals[s.id] = s.cardCount?.official || 0;
        }

        console.log(`Buscando cartas para o idioma: ${lang.toUpperCase()}...`);
        const res = await fetch(`https://api.tcgdex.net/v2/${lang}/cards`);
        const cards = await res.json();

        let count = 0;
        for (const card of cards) {
            const setId = card.id ? card.id.split('-')[0] : null;

            formattedCards.push({
                id: `${lang}_${card.id}`,
                originalId: card.id,
                lang: lang,
                name: card.name,
                // Using a more distinct placeholder or leaving it null to let CSS handle it
                img: card.image ? `${card.image}/low.webp` : null,
                highImg: card.image ? `${card.image}/high.webp` : null,
                total: setId ? (setTotals[setId] || 0) : 0
            });
            count++;
        }
        console.log(`- Encontradas ${count} cartas em ${lang.toUpperCase()}`);
    }

    console.log(`\nTotal final de cartas preparadas: ${formattedCards.length}`);

    if (!fs.existsSync("data")) {
        fs.mkdirSync("data");
    }

    fs.writeFileSync('data/cards-index.json', JSON.stringify(formattedCards));
    console.log("Arquivo data/cards-index.json atualizado!");
}

main().catch(console.error);
