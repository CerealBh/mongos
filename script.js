/* =========================
   ELEMENTOS / ESTADO
========================= */

let binder = null;
let currentPage = 0;
let draggedCard = null;
let activeBinderId = "";

const hand = document.getElementById("hand");
const handViewport = document.querySelector(".hand-viewport");
const binderPage = document.querySelector(".binder-page");

const LS_BINDER = "binderData_local_v1";
const LS_HAND = "handData_local_v1";

const LS_INDEX = "binderIndex_v1";
const LS_ACTIVE = "binderActiveId_v1";

const BinderStore = {
  loadIndex() {
    return safeParse(localStorage.getItem(LS_INDEX), []);
  },
  saveIndex(list) {
    localStorage.setItem(LS_INDEX, JSON.stringify(list));
  },
  getActiveId() {
    return localStorage.getItem(LS_ACTIVE) || "";
  },
  setActiveId(id) {
    localStorage.setItem(LS_ACTIVE, id);
  },
  binderKey(id) { return `binderData:${id}`; },
  handKey(id) { return `handData:${id}`; },

  loadBinder(id) {
    return safeParse(localStorage.getItem(this.binderKey(id)), null);
  },
  saveBinder(id, binderObj) {
    localStorage.setItem(this.binderKey(id), JSON.stringify(binderObj));
  },
  loadHand(id) {
    return safeParse(localStorage.getItem(this.handKey(id)), []);
  },
  saveHand(id, handArr) {
    localStorage.setItem(this.handKey(id), JSON.stringify(handArr));
  },

  createBinderEntry({ name, config }) {
    const id = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const entry = {
      id,
      name: (name || "Binder sem nome").trim(),
      createdAt: now,
      updatedAt: now,
      config
    };

    const index = this.loadIndex();
    index.unshift(entry);
    this.saveIndex(index);

    const binderObj = createBinder(config);
    this.saveBinder(id, binderObj);
    this.saveHand(id, []);

    this.setActiveId(id);
    return { id, entry, binderObj };
  },

  touch(id) {
    const index = this.loadIndex();
    const i = index.findIndex(x => x.id === id);
    if (i >= 0) {
      index[i].updatedAt = Date.now();
      // mantém config atualizada se mudou
      if (binder?.config) index[i].config = binder.config;
      this.saveIndex(index);
    }
  },

  deleteBinder(id) {
    const index = this.loadIndex().filter(x => x.id !== id);
    this.saveIndex(index);

    localStorage.removeItem(this.binderKey(id));
    localStorage.removeItem(this.handKey(id));

    const active = this.getActiveId();
    if (active === id) this.setActiveId(index[0]?.id || "");
  }
};
/* =========================
   UX: DRAG / PAN
========================= */

const DRAG_ARM_MS = 5;     // delay pra “armar” drag na mão (ajuste aqui)
const MOVE_TOLERANCE = 10;    // se mexer antes, cancela armar drag

/* =========================
   INDEX LOCAL
========================= */

let cardsIndex = null;     // array
let cardsById = null;      // Map(id -> {id,name,img})

async function loadCardsIndex() {
  if (cardsIndex && cardsById) return { cardsIndex, cardsById };

  const res = await fetch("./data/cards-index.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao carregar cards-index.json (HTTP ${res.status})`);

  cardsIndex = await res.json();

  cardsById = new Map();
  for (const c of cardsIndex) {
    if (c?.id) cardsById.set(c.id, c);
  }

  return { cardsIndex, cardsById };
}

function getCardMeta(cardId) {
  return cardsById?.get(cardId) || null;
}

/* =========================
   HELPERS
========================= */

function safeParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; }
  catch { return fallback; }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* =========================
   MODEL BINDER
========================= */

function createBinder(config) {
  const totalSlots = config.rows * config.columns;
  return {
    config,
    pages: Array.from({ length: config.totalPages }, () =>
      Array(totalSlots).fill(null) // cardId ou null
    )
  };
}

/* =========================
   HAND FAN (ARCO) + PAN
========================= */

function updateHandFan() {
  const cards = [...hand.querySelectorAll(":scope > .card")];
  const n = cards.length;
  if (!n) return;

  if (n === 1) {
    cards[0].style.setProperty("--fan-rotate", "0deg");
    cards[0].style.setProperty("--fan-lift", "0px");
    return;
  }

  const maxAngle = Math.min(22, 10 + n);
  const maxLift = 18;

  cards.forEach((c, i) => {
    const t = (i / (n - 1)) * 2 - 1;
    const angle = t * maxAngle;
    const lift = (1 - Math.abs(t)) * maxLift;

    c.style.setProperty("--fan-rotate", `${angle}deg`);
    c.style.setProperty("--fan-lift", `${-lift}px`);
  });
}

function refreshHandLayout() {
  updateHandFan();
}

/* =========================
   CARTA (DOM)
========================= */

function makeBinderCard(cardEl) {
  cardEl.dataset.zone = "binder";
}

function makeHandCard(cardEl) {
  cardEl.dataset.zone = "hand";
}

function buildCardElement(cardId) {
  const meta = getCardMeta(cardId);

  const el = document.createElement("div");
  el.className = "card";
  el.dataset.cardId = cardId;

  // por padrão nasce como "hand"
  makeHandCard(el);

  const img = document.createElement("img");
  img.className = "card-img";
  img.alt = meta?.name || "Carta";
  img.draggable = false;               // MUITO importante: não deixar o <img> “draggar sozinho”
  img.style.pointerEvents = "none";    // evita pegar clique/drag no img, só no container

  // usa SEMPRE a imagem do index (pokemontcg.io ou scrydex)
  if (meta?.img) img.src = meta.img;

  el.appendChild(img);

  return el;
}

/* =========================
   RENDER BINDER (PÁGINA)
========================= */

function renderBinder() {
  const isBook = binder?.config?.displayMode === "book";
  renderPages(isBook ? 2 : 1);
}

function updatePageIndicator() {
  const indicator = document.getElementById("pageIndicator");
  if (!indicator) return;

  const isBook = binder?.config?.displayMode === "book";

  if (!isBook) {
    indicator.textContent = `Página ${currentPage + 1} / ${binder.config.totalPages}`;
    return;
  }

  if (currentPage === 0) {
    indicator.textContent = `Capa / ${binder.config.totalPages}`;
  } else {
    const left = currentPage + 1;
    const right = Math.min(currentPage + 2, binder.config.totalPages);
    indicator.textContent = `Páginas ${left}–${right} / ${binder.config.totalPages}`;
  }
}

/**
 * Renderiza 1 ou 2 páginas visíveis.
 * visibleCount = 1 (normal) ou 2 (book/spread)
 */
function renderPages(visibleCount) {
  binderPage.innerHTML = "";

  const isBook = visibleCount === 2;
  binderPage.classList.toggle("is-book", isBook);

  // cria 1 ou 2 folhas
  const pageIndexes = [];
  if (isBook) {
    if (currentPage === 0) {
      pageIndexes.push(-1, 0); // -1 represents the empty left side cover block
    } else {
      pageIndexes.push(currentPage, currentPage + 1);
    }
  } else {
    pageIndexes.push(currentPage);
  }

  pageIndexes.forEach((pageIndex) => {
    const sheet = document.createElement("div");
    sheet.className = "binder-sheet";
    sheet.dataset.pageIndex = String(pageIndex);

    // se passou do total (última “página par”) ou é fantasma contracapa (-1), cria folha vazia
    if (pageIndex < 0 || pageIndex >= binder.config.totalPages) {
      sheet.classList.add("is-empty");
      binderPage.appendChild(sheet);
      return;
    }

    // grid da folha
    sheet.style.gridTemplateColumns = `repeat(${binder.config.columns}, 1fr)`;
    sheet.style.gridTemplateRows = `repeat(${binder.config.rows}, max-content)`;

    // Injetando variavéis de controle pré-computadas para não quebrar a spec do CSS de divisão por variáveis.
    const aspectW = binder.config.columns * 5;
    const aspectH = binder.config.rows * 7;
    sheet.style.setProperty("--auto-max-w", `calc(55vh * ${aspectW} / ${aspectH})`);
    // calculando o slotW da folha dinamicamente de acordo com qtd de colunas
    // (Pega width base de css diminuindo os gapings: padding 16*2 e gap 4px)
    const cw = isBook ? 420 : 500;
    const computedSlot = Math.floor((cw - (16 * 2) - ((binder.config.columns - 1) * 4)) / binder.config.columns);
    sheet.style.setProperty("--slotW", `${Math.max(45, computedSlot)}px`);

    const pageData = binder.pages[pageIndex];

    pageData.forEach((cardId, slotIndex) => {
      const slot = document.createElement("div");
      slot.classList.add("slot");
      slot.dataset.slotIndex = String(slotIndex);
      slot.dataset.pageIndex = String(pageIndex);

      if (cardId) {
        const card = buildCardElement(cardId);
        makeBinderCard(card);
        slot.appendChild(card);
      }

      sheet.appendChild(slot);
    });

    binderPage.appendChild(sheet);
  });

  updatePageIndicator();
}
/* =========================
   SAVE / LOAD
========================= */

function serializeHand() {
  return [...hand.querySelectorAll(":scope > .card")]
    .map(c => c.dataset.cardId)
    .filter(Boolean);
}

function serializePageToModel() {
  const allSlots = binderPage.querySelectorAll(".slot");

  allSlots.forEach((slot) => {
    const pageIndex = parseInt(slot.dataset.pageIndex, 10);
    const slotIndex = parseInt(slot.dataset.slotIndex, 10);

    if (Number.isNaN(pageIndex) || pageIndex < 0 || Number.isNaN(slotIndex)) return;

    const card = slot.querySelector(".card");
    binder.pages[pageIndex][slotIndex] = card ? card.dataset.cardId : null;
  });
}



function saveAll() {
  if (!binder || !activeBinderId) return;

  serializePageToModel();

  BinderStore.saveBinder(activeBinderId, binder);
  BinderStore.saveHand(activeBinderId, serializeHand());
  BinderStore.touch(activeBinderId);
}

function loadHandFromIds(ids) {
  hand.innerHTML = "";
  ids.forEach(id => {
    const card = buildCardElement(id);
    makeHandCard(card);
    hand.appendChild(card);
  });
  refreshHandLayout();
}

/* =========================
   PAGE NAV
========================= */

document.getElementById("prevPage")?.addEventListener("click", () => {
  if (!binder) return;

  saveAll();

  const isBook = binder.config.displayMode === "book";
  if (isBook) {
    const step = currentPage === 1 ? 1 : 2;
    currentPage = Math.max(0, currentPage - step);
  } else {
    currentPage = Math.max(0, currentPage - 1);
  }

  renderBinder();
});

document.getElementById("nextPage")?.addEventListener("click", () => {
  if (!binder) return;

  saveAll();

  const isBook = binder.config.displayMode === "book";
  if (isBook) {
    const step = currentPage === 0 ? 1 : 2;
    if (currentPage + step < binder.config.totalPages) {
      currentPage += step;
    }
  } else {
    if (currentPage + 1 < binder.config.totalPages) {
      currentPage += 1;
    }
  }

  renderBinder();
});

document.getElementById("addPage")?.addEventListener("click", () => {
  if (!binder) return;
  saveAll();

  // Aumenta o número total de páginas na configuração
  binder.config.totalPages += 1;
  // Adiciona um novo array (nova página) cheio de null preenchendo todos os slots (rows * columns)
  const totalSlots = binder.config.rows * binder.config.columns;
  binder.pages.push(Array(totalSlots).fill(null));

  saveAll();
  renderBinder();
});

document.getElementById("toggleDisplayMode")?.addEventListener("click", () => {
  if (!binder) return;

  const currentMode = binder.config.displayMode;
  const isNowBook = currentMode !== "book";
  binder.config.displayMode = isNowBook ? "book" : "buttons";

  saveAll();

  // Smart Page Retention Logic (Math fixes for spread mapping)
  if (isNowBook) {
    // Normal to Book (Spread indices map to 2-page pairs, 0->0, 1->1, 2->1, 3->2)
    currentPage = Math.floor((currentPage + 1) / 2);
  } else {
    // Book to Normal (Expands spread index back to left page of that pair, e.g 1->1 (Page 2), 2->3 (Page 4))
    currentPage = currentPage > 0 ? (currentPage * 2) - 1 : 0;
  }

  renderBinder();
});

/* =========================
   CUSTOM POINTER DRAG & DROP
========================= */

let isDragging = false;
let pointerGhost = null;
let sourceCard = null;
let startX = 0;
let startY = 0;

document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return; // Apenas clique esquerdo

  // Se clicamos em uma carta ou num resultado de busca
  const card = e.target.closest(".card") || e.target.closest(".result-card");
  if (!card || !card.dataset.cardId) return;

  sourceCard = card;
  startX = e.clientX;
  startY = e.clientY;
});

document.addEventListener("pointermove", (e) => {
  if (!sourceCard) return;

  if (!isDragging) {
    // Detecta intenção de arrastar com uma janela de tolerância pequena
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 4 || dy > 4) {
      isDragging = true;
      document.body.classList.add("is-dragging");
      sourceCard.classList.add("is-dragging-source");

      // Constroi o fantasma visual atrelado ao rato
      pointerGhost = document.createElement("div");
      pointerGhost.className = "drag-ghost";
      const imgClone = sourceCard.querySelector("img").cloneNode(true);
      pointerGhost.appendChild(imgClone);

      pointerGhost.style.left = e.clientX + "px";
      pointerGhost.style.top = e.clientY + "px";
      document.body.appendChild(pointerGhost);
    }
  }

  // Se já está arrastando, segue o mouse fluidamente
  if (isDragging && pointerGhost) {
    pointerGhost.style.left = e.clientX + "px";
    pointerGhost.style.top = e.clientY + "px";
  }
});

document.addEventListener("pointerup", (e) => {
  if (!sourceCard) return;

  if (isDragging) {
    // Cleanup visual do Drag
    if (pointerGhost) pointerGhost.remove();
    pointerGhost = null;
    document.body.classList.remove("is-dragging");
    sourceCard.classList.remove("is-dragging-source");

    // Identificar o alvo físico exato ignorando a carta fantasma e origens bloqueadas por pointer-events
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);

    if (dropTarget) {
      const slot = dropTarget.closest(".slot");
      const isTrash = dropTarget.closest("#trashZone");
      const isHand = dropTarget.closest(".hand-viewport") || dropTarget.closest("#handDropZone") || dropTarget.closest(".hand-container");

      const isFromSearch = sourceCard.classList.contains("result-card");
      let cardToMove = sourceCard;

      if (isFromSearch && (slot || isHand)) {
        cardToMove = buildCardElement(sourceCard.dataset.cardId);
        window._justDragged = true;
        setTimeout(() => { window._justDragged = false; }, 50);
      }

      const origin = sourceCard.parentElement;
      const originSlot = sourceCard.closest(".slot");
      const originSheet = originSlot?.closest(".binder-sheet");

      // === LOGICA 1: LIXEIRA ===
      if (isTrash) {
        if (originSlot && originSheet) {
          const pageIndex = parseInt(originSheet.dataset.pageIndex, 10);
          const slotIndex = parseInt(originSlot.dataset.slotIndex, 10);
          if (!Number.isNaN(pageIndex) && !Number.isNaN(slotIndex)) {
            binder.pages[pageIndex][slotIndex] = null;
          }
        }
        if (!isFromSearch) sourceCard.remove();
      }

      // === LOGICA 2: BINDER SLOT ===
      else if (slot) {
        const existingCard = slot.querySelector(".card");

        // Swap visual se já existir carta
        if (existingCard) {
          if (!isFromSearch) {
            origin.appendChild(existingCard);
            if (origin === hand) makeHandCard(existingCard);
            else makeBinderCard(existingCard);
          } else {
            // Se veio da busca e já tem carta, o swap deleta a velha carta da busca?
            // O mais seguro na busca é apenas substituir. O card existente vai para a lixeira se for drop de busca.
            existingCard.remove();
          }
        }

        // Limpa old binder model if moved entirely out of an old slot
        if (originSlot && originSheet && (!existingCard || origin !== hand) && !isFromSearch) {
          const op = parseInt(originSheet.dataset.pageIndex, 10);
          const os = parseInt(originSlot.dataset.slotIndex, 10);
          if (!Number.isNaN(op) && !Number.isNaN(os)) binder.pages[op][os] = null;
        }

        slot.appendChild(cardToMove);
        makeBinderCard(cardToMove);
      }

      // === LOGICA 3: MÃO ===
      else if (isHand) {
        // Limpa modelo de slot de onde estava vindo
        if (originSlot && originSheet && !isFromSearch) {
          const op = parseInt(originSheet.dataset.pageIndex, 10);
          const os = parseInt(originSlot.dataset.slotIndex, 10);
          if (!Number.isNaN(op) && !Number.isNaN(os)) binder.pages[op][os] = null;
        }
        hand.appendChild(cardToMove);
        makeHandCard(cardToMove);
      }
    }

    // Salvar e Renderizar de qualquer forma
    saveAll();
    refreshHandLayout();
  }

  // Reset variáveis
  sourceCard = null;
  isDragging = false;
});

const trashZone = document.getElementById("trashZone");

/* =========================
   NATIVE SCROLL DA MÃO (MOUSEWHEEL)
========================= */
const handVp = document.querySelector(".hand-viewport");
if (handVp) {
  handVp.addEventListener("wheel", (e) => {
    // Apenas se houver barra de rolagem horizontal necessária
    if (handVp.scrollWidth > handVp.clientWidth) {
      if (e.deltaY !== 0) {
        handVp.scrollLeft += e.deltaY;
        e.preventDefault(); // Evita scroll da tela de fundo se houver
      }
    }
  });
}

/*====================================
    Delete binder (old nav button)
====================*/

document.getElementById("deleteBinder")?.addEventListener("click", () => {
  if (!activeBinderId) return;

  if (!confirm("Apagar este binder?")) return;

  BinderStore.deleteBinder(activeBinderId);

  // tenta abrir outro binder (ou volta pra home)
  const next = BinderStore.getActiveId();
  if (next && openBinderById(next)) return;

  showBinderHome();
});

/* =========================
   SEED LOCAL (SEM API)
========================= */

function pickFirstIdByName(name) {
  const q = name.trim().toLowerCase();
  const found = cardsIndex.find(c => (c.name || "").toLowerCase() === q)
    || cardsIndex.find(c => (c.name || "").toLowerCase().includes(q));
  return found?.id || null;
}

async function seedHandIfEmpty() {
  if (!activeBinderId) return;

  const savedHand = BinderStore.loadHand(activeBinderId);
  if (Array.isArray(savedHand) && savedHand.length) {
    loadHandFromIds(savedHand);
    return;
  }

  const wanted = ["Fezandipiti ex", "Poké Pad", "Mega Meganium", "Mega Meganium ex"];
  const ids = [];

  for (const n of wanted) {
    const id = pickFirstIdByName(n);
    if (id) ids.push(id);
  }

  BinderStore.saveHand(activeBinderId, ids);
  loadHandFromIds(ids);
}

// atualizar seleção do binder (AGORA em formato de galeria)

function refreshBinderGallery() {
  const gallery = document.getElementById("binder-gallery");
  if (!gallery) return;

  const index = BinderStore.loadIndex();

  gallery.innerHTML = "";

  if (index.length === 0) {
    gallery.innerHTML = `<p style="color:#94a3b8; font-size:14px;">Você ainda não tem nenhum binder.</p>`;
    return;
  }

  index.forEach(b => {
    const card = document.createElement("div");
    card.className = "binder-preview";

    // Obter data de criação formatada se quiser
    const d = new Date(b.createdAt);
    const dateStr = d.toLocaleDateString();

    // Pegar algumas cartas reais para fazer a capa-thumbnail do binder
    const targetBinderObj = BinderStore.loadBinder(b.id);
    let thumbnailsHTML = "";
    if (targetBinderObj && targetBinderObj.pages && targetBinderObj.pages.length > 0) {
      // Procura qual o ID da primeira carta preenchida no binder inteiro
      const allStoredIds = targetBinderObj.pages.flat().filter(Boolean);
      const coverId = allStoredIds.length > 0 ? allStoredIds[0] : null;

      if (coverId) {
        const meta = getCardMeta(coverId);
        if (meta && meta.img) {
          thumbnailsHTML = `<div class="binder-feature-cover"><img src="${meta.img}" alt="cover"></div>`;
        } else {
          thumbnailsHTML = `<div class="binder-feature-cover empty"></div>`;
        }
      } else {
        thumbnailsHTML = `<div class="binder-feature-cover empty"></div>`;
      }
    }

    card.innerHTML = `
      ${thumbnailsHTML}
      <h4>${b.name}</h4>
      <p>${b.config?.totalPages || 0} páginas</p>
      <p style="font-size:10px; opacity:0.6">${dateStr}</p>
      <button class="delete-btn" title="Excluir este binder">🗑</button>
    `;

    // Clicar no cartão abre o binder
    card.addEventListener("click", (e) => {
      // Ignora se clicou no botão de apagar
      if (e.target.closest(".delete-btn")) return;
      openBinderById(b.id);
    });

    // Clicar no botão de lixeira apaga o binder (embutido na galeria)
    const delBtn = card.querySelector(".delete-btn");
    delBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // setTimeout to avoid blocking browser render loop overlapping with hovers
      setTimeout(() => {
        if (!window.confirm(`Apagar o binder "${b.name}" permanentemente?`)) return;
        BinderStore.deleteBinder(b.id);
        refreshBinderGallery();

        // se excluiu o binder aberto
        if (activeBinderId === b.id) {
          binder = null;
          activeBinderId = "";
        }
      }, 10);
    });

    gallery.appendChild(card);
  });
}


/* =========================
   FORM / INIT BINDER
========================= */

function setBinderUI(visible) {
  const displayStyle = visible ? "flex" : "none";
  // Hand UI
  const hc = document.querySelector(".hand-container");
  if (hc) hc.style.display = displayStyle;

  // Search Panel
  const sp = document.querySelector(".search-panel");
  if (sp) sp.style.display = displayStyle;

  // Trash Zone
  const tz = document.getElementById("trashZone");
  if (tz) tz.style.display = displayStyle;

  // Page Controls (Header)
  const pc = document.querySelector(".page-controls");
  if (pc) pc.style.display = displayStyle;
}

function showBinderHome() {
  saveAll();

  binder = null;
  currentPage = 0;
  activeBinderId = "";

  document.getElementById("create-binder-screen").style.display = "flex";

  // Hide binder UI elements
  setBinderUI(false);

  binderPage.innerHTML = "";
  hand.innerHTML = "";

  refreshBinderGallery();
}

function openBinderById(id) {
  const obj = BinderStore.loadBinder(id);
  if (!obj?.config?.rows || !obj?.pages) return false;

  activeBinderId = id;
  BinderStore.setActiveId(id);

  binder = obj;
  currentPage = 0;

  document.getElementById("create-binder-screen").style.display = "none";
  // Show binder UI elements
  setBinderUI(true);

  renderBinder();

  loadHandFromIds(BinderStore.loadHand(id));
  refreshHandLayout();

  return true;
}

function initBinder() {
  const createScreen = document.getElementById("create-binder-screen");
  const createBtn = document.getElementById("create-binder-btn");

  refreshBinderGallery();

  // Força abrir na tela inicial de escolha/criação
  createScreen.style.display = "flex";
  setBinderUI(false);

  // Bind the internal 'Delete Binder' button to destroy the current binder specifically
  const innerDeleteBtn = document.getElementById("deleteBinder");
  if (innerDeleteBtn) {
    // Remove listeners preventing duplicate binds if initBinder runs again
    const newInnerDeleteBtn = innerDeleteBtn.cloneNode(true);
    innerDeleteBtn.parentNode.replaceChild(newInnerDeleteBtn, innerDeleteBtn);

    newInnerDeleteBtn.addEventListener("click", () => {
      if (!activeBinderId) return;
      if (window.confirm(`Tem certeza que deseja excluir o Fichário ativo atual ("${binder?.name || 'Vazio'}") do sistema?`)) {
        BinderStore.deleteBinder(activeBinderId);
        showBinderHome();
      }
    });
  }

  // criar binder novo
  createBtn?.addEventListener("click", () => {
    const rows = parseInt(document.getElementById("rows-input").value, 10);
    const columns = parseInt(document.getElementById("columns-input").value, 10);
    const totalPages = parseInt(document.getElementById("pages-input").value, 10);

    const name = document.getElementById("binder-name-input")?.value || "Binder";

    const config = { rows, columns, totalPages, displayMode: "buttons" }; // Default base mode

    const { id, binderObj } = BinderStore.createBinderEntry({ name, config });

    activeBinderId = id;
    binder = binderObj;
    currentPage = 0;

    refreshBinderGallery();

    createScreen.style.display = "none";
    setBinderUI(true); // Ensures Hand/Search/Navigation turns ON initially
    renderBinder();

    // seed desse binder
    seedHandIfEmpty();
    refreshHandLayout();
  });
}

/* =========================
   SEARCH (OPCIONAL)
   - só funciona se existir #searchInput e #searchResults no HTML
========================= */

function renderResults(list) {
  const box = document.getElementById("searchResults");
  if (!box) return;

  box.innerHTML = "";

  list.slice(0, 100).forEach(card => {
    const div = document.createElement("div");
    div.className = "result-card";
    div.dataset.cardId = card.id;
    div.ondragstart = (e) => { e.preventDefault(); return false; };
    div.style.touchAction = "none";
    div.style.userSelect = "none";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = card.img;               // ✅ large do index (scrydex/pokemontcg.io)
    img.alt = card.name || "Carta";
    img.draggable = false;
    img.style.pointerEvents = "none";
    img.style.userSelect = "none";
    div.appendChild(img);

    div.addEventListener("click", () => {
      if (window._justDragged) return;
      const el = buildCardElement(card.id);
      makeHandCard(el);
      hand.appendChild(el);

      saveAll();
      refreshHandLayout();
    });

    box.appendChild(div);
  });
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  if (!input || !box) return;

  let t = null;

  const doSearch = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      box.innerHTML = "";
      return;
    }

    const out = cardsIndex.filter(c => (c.name || "").toLowerCase().includes(q));
    renderResults(out);
  };

  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(doSearch, 120);
  });
}

/* =========================
   START
========================= */

window.addEventListener("load", async () => {
  await loadCardsIndex();
  initBinder();

  // botão "Voltar" / Home de Binders
  document.getElementById("manageBinders")?.addEventListener("click", () => {
    showBinderHome();
  });

  // se NÃO estivémos na tela inicial e abrimos um binder (desativado mas seguro)
  if (activeBinderId) {
    await seedHandIfEmpty();
    refreshHandLayout();
  }

  setupSearch();
});
