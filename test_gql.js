const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/cards-index.json'));
const nameMap = JSON.parse(fs.readFileSync('data/name-map.json'));

function testSearch(rawQ) {
  const q = rawQ.toLowerCase();
  const activeLangs = ['pt', 'en', 'ja'];

  let localIdQuery = null;
  let totalQuery = null;
  let nameQuery = q;

  const idPattern = /\(?(\d+)(?:\/(\d*))?\)?/;
  const idMatch = q.match(idPattern);
  if (idMatch) {
    localIdQuery = idMatch[1].replace(/^0+/, '') || '0';
    totalQuery = idMatch[2] ? idMatch[2].replace(/^0+/, '') : null;
    nameQuery = q.replace(idMatch[0], '').replace(/[()]/g, '').trim();
  }

  const aliases = new Set(nameQuery ? [nameQuery] : []);
  if (nameQuery) {
    const exactEntry = nameMap[nameQuery];
    if (exactEntry) Object.values(exactEntry).forEach(n => aliases.add(n.toLowerCase()));
  }

  const out = data.filter(c => {
    if (!activeLangs.includes(c.lang)) return false;
    const localId = (c.originalId || '').split('-').pop().replace(/^0+/, '') || '0';
    const setTotal = String(c.total || '');

    const localIdMatch = localIdQuery !== null ? localId === localIdQuery : true;
    const totalMatch = totalQuery !== null ? setTotal.startsWith(totalQuery) : true;

    const nameLower = (c.name || '').toLowerCase();
    const nameMatch = aliases.size === 0 ? true : aliases.has(nameLower) || [...aliases].some(alias => nameLower.includes(alias));

    if (localIdQuery !== null && nameQuery) return localIdMatch && totalMatch && nameMatch;
    if (localIdQuery !== null) return localIdMatch && totalMatch;
    return nameMatch;
  });

  console.log(`Query: "${rawQ}" -> ${out.length} resultados`);
  out.slice(0, 3).forEach(c => console.log(`  ${c.lang.toUpperCase()}: ${c.name} [${c.originalId}] (Total: ${c.total})`));
}

console.log("--- TESTES DE ID/TOTAL ---");
testSearch('058');     // Deve mostrar muitos (vários sets têm 058)
testSearch('058/');    // Deve mostrar os mesmos de cima (totalQuery é "")
testSearch('058/86');   // Deve mostrar especificamente os do set com total 86 (Zorua JP e outros)
testSearch('tarsila (139/142)'); // Deve mostrar a Tarsila do set de 142
