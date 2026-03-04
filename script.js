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
    const id = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
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

const PAN_THRESHOLD = 12;
const PAN_ANGLE_BIAS = 1.2;

let handTranslateX = 0;

let panPointerId = null;
let isHandPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartTranslate = 0;
let pendingPanCard = null;

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

function getPanLimits() {
  const vw = handViewport.clientWidth;
  const hw = hand.scrollWidth;
  if (hw <= vw) return { min: 0, max: 0 };
  return { min: vw - hw, max: 0 };
}

function applyHandTranslate(x) {
  const { min, max } = getPanLimits();
  handTranslateX = clamp(x, min, max);
  hand.style.transform = `translateX(${handTranslateX}px)`;
}

function refreshHandLayout() {
  updateHandFan();
  applyHandTranslate(handTranslateX);
}

/* =========================
   CARTA (DOM)
========================= */

function makeBinderCard(cardEl) {
  cardEl.dataset.zone = "binder";
  cardEl.draggable = true;
}

function makeHandCard(cardEl) {
  cardEl.dataset.zone = "hand";
  cardEl.draggable = false;

  // garante que não duplica listeners
  if (cardEl.dataset.handInit === "1") return;
  cardEl.dataset.handInit = "1";

  let armTimer = null;
  let downX = 0;
  let downY = 0;

  const disarm = () => {
    if (armTimer) clearTimeout(armTimer);
    armTimer = null;
    cardEl.draggable = false;
  };

  cardEl._handDisarm = disarm;

  cardEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;

    downX = e.clientX;
    downY = e.clientY;

    if (isHandPanning) return;

    armTimer = setTimeout(() => {
      cardEl.draggable = true;
    }, DRAG_ARM_MS);
  });

  cardEl.addEventListener("pointermove", (e) => {
    if (!armTimer) return;
    const dx = Math.abs(e.clientX - downX);
    const dy = Math.abs(e.clientY - downY);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      clearTimeout(armTimer);
      armTimer = null;
    }
  });

  cardEl.addEventListener("pointerup", disarm);
  cardEl.addEventListener("pointercancel", disarm);
  cardEl.addEventListener("dragend", disarm);
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

  // dragstart: ghost reto + 10% maior
  el.addEventListener("dragstart", (e) => {
    if (isHandPanning) {
      e.preventDefault();
      return;
    }

    draggedCard = el;

    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);

    ghost.style.position = "fixed";
    ghost.style.left = "-9999px";
    ghost.style.top = "-9999px";
    ghost.style.transform = "none";
    ghost.style.setProperty("--fan-rotate", "0deg");
    ghost.style.setProperty("--fan-lift", "0px");

    ghost.style.width = `${rect.width * 1.1}px`;
    ghost.style.height = `${rect.height * 1.1}px`;

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, (rect.width * 1.1) / 2, (rect.height * 1.1) / 2);
    setTimeout(() => ghost.remove(), 0);

    setTimeout(() => (el.style.opacity = "0.4"), 0);
  });

  el.addEventListener("dragend", () => {
    el.style.opacity = "1";
    draggedCard = null;
  });

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

  const left = currentPage + 1;
  const right = Math.min(currentPage + 2, binder.config.totalPages);
  indicator.textContent = `Páginas ${left}–${right} / ${binder.config.totalPages}`;
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
  const pageIndexes = [currentPage];
  if (isBook) pageIndexes.push(currentPage + 1);

  pageIndexes.forEach((pageIndex) => {
    const sheet = document.createElement("div");
    sheet.className = "binder-sheet";
    sheet.dataset.pageIndex = String(pageIndex);

    // se passou do total (última “página par”), cria folha vazia
    if (pageIndex >= binder.config.totalPages) {
      sheet.classList.add("is-empty");
      binderPage.appendChild(sheet);
      return;
    }

    // grid da folha
    sheet.style.gridTemplateColumns = `repeat(${binder.config.columns}, 1fr)`;
    sheet.style.gridTemplateRows = `repeat(${binder.config.rows}, 1fr)`;

    const pageData = binder.pages[pageIndex];

    pageData.forEach((cardId, slotIndex) => {
      const slot = document.createElement("div");
      slot.classList.add("slot");
      slot.dataset.slotIndex = String(slotIndex);
	  slot.dataset.pageIndex = String(pageIndex);

      slot.addEventListener("dragover", (e) => e.preventDefault());

      slot.addEventListener("drop", () => {
        if (!draggedCard) return;

        const origin = draggedCard.parentElement;
        const existing = slot.querySelector(".card");

        // swap
        if (existing) {
          origin.appendChild(existing);
          if (origin === hand) makeHandCard(existing);
          else makeBinderCard(existing);
        }

        slot.appendChild(draggedCard);
        makeBinderCard(draggedCard);

        saveAll();
        refreshHandLayout();
      });

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

    if (Number.isNaN(pageIndex) || Number.isNaN(slotIndex)) return;

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
  const step = isBook ? 2 : 1;

  currentPage = Math.max(0, currentPage - step);
  renderBinder();
});

document.getElementById("nextPage")?.addEventListener("click", () => {
  if (!binder) return;

  saveAll();

  const isBook = binder.config.displayMode === "book";
  const step = isBook ? 2 : 1;

  const maxStart = isBook
    ? Math.max(0, binder.config.totalPages - 2)
    : Math.max(0, binder.config.totalPages - 1);

  currentPage = Math.min(maxStart, currentPage + step);
  renderBinder();
});

/* =========================
   DROP NA MÃO
========================= */

hand.addEventListener("dragover", e => e.preventDefault());

hand.addEventListener("drop", () => {
  if (!draggedCard) return;

  const draggedId = draggedCard.dataset.cardId;

  // se veio do binder, limpar origem no MODEL
  const originSlot = draggedCard.closest(".slot");
  const originSheet = originSlot?.closest(".binder-sheet");
  const originPage = originSheet ? parseInt(originSheet.dataset.pageIndex, 10) : null;
  const originSlotIndex = originSlot ? parseInt(originSlot.dataset.slotIndex, 10) : null;

  if (originSlot && originSheet && Number.isFinite(originPage) && Number.isFinite(originSlotIndex)) {
    binder.pages[originPage][originSlotIndex] = null;
  }

  hand.appendChild(draggedCard);
  makeHandCard(draggedCard);

  saveAll();
  refreshHandLayout();
});

/* =========================
   TRASH ZONE
========================= */

const trashZone = document.getElementById("trashZone");

trashZone.addEventListener("dragover", e => {
  e.preventDefault();
  trashZone.classList.add("drag-hover");
});

trashZone.addEventListener("dragleave", () => {
  trashZone.classList.remove("drag-hover");
});

trashZone.addEventListener("drop", () => {
  trashZone.classList.remove("drag-hover");

  if (!draggedCard) return;

  const originSlot = draggedCard.closest(".slot");
  const originSheet = originSlot?.closest(".binder-sheet");

  if (originSlot && originSheet) {
    const pageIndex = parseInt(originSheet.dataset.pageIndex, 10);
    const slotIndex = parseInt(originSlot.dataset.slotIndex, 10);

    if (!Number.isNaN(pageIndex) && !Number.isNaN(slotIndex)) {
      binder.pages[pageIndex][slotIndex] = null;
    }
  }

  draggedCard.remove();

  saveAll();
  refreshHandLayout();
});

/* =========================
   PAN DA MÃO
========================= */

handViewport.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;

  panPointerId = e.pointerId;
  pendingPanCard = e.target.closest(".card");

  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartTranslate = handTranslateX;

  isHandPanning = false;

  handViewport.setPointerCapture(e.pointerId);
});

handViewport.addEventListener("pointermove", (e) => {
  if (panPointerId !== e.pointerId) return;

  const dx = e.clientX - panStartX;
  const dy = e.clientY - panStartY;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (!isHandPanning) {
    const horizontal = absX >= PAN_THRESHOLD && absX > absY * PAN_ANGLE_BIAS;
    if (!horizontal) return;

    isHandPanning = true;

    // se começou em carta, desarma o drag dela
    if (pendingPanCard && pendingPanCard._handDisarm) pendingPanCard._handDisarm();
  }

  applyHandTranslate(panStartTranslate + dx);
});




function endPan() {
  panPointerId = null;
  isHandPanning = false;
  pendingPanCard = null;
}

handViewport.addEventListener("pointerup", endPan);
handViewport.addEventListener("pointercancel", endPan);

/*====================================
		Delete binder
		
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

// atualizar seleção do binder

function refreshBinderSelect() {
  const sel = document.getElementById("binder-select");
  if (!sel) return;

  const index = BinderStore.loadIndex();
  const active = BinderStore.getActiveId();

  sel.innerHTML = `<option value="">(Criar novo)</option>`;
  index.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name;
    if (b.id === active) opt.selected = true;
    sel.appendChild(opt);
  });
}


/* =========================
   FORM / INIT BINDER
========================= */

function showBinderHome() {
  saveAll();

  binder = null;
  currentPage = 0;
  activeBinderId = "";

  document.getElementById("create-binder-screen").style.display = "flex";
  binderPage.innerHTML = "";
  hand.innerHTML = "";

  refreshBinderSelect();
}

function openBinderById(id) {
  const obj = BinderStore.loadBinder(id);
  if (!obj?.config?.rows || !obj?.pages) return false;

  activeBinderId = id;
  BinderStore.setActiveId(id);

  binder = obj;
  currentPage = 0;

  document.getElementById("create-binder-screen").style.display = "none";
  renderBinder();

  loadHandFromIds(BinderStore.loadHand(id));
  refreshHandLayout();

  return true;
}

function initBinder() {
  const createScreen = document.getElementById("create-binder-screen");
  const createBtn = document.getElementById("create-binder-btn");
  const sel = document.getElementById("binder-select"); // seu select

  refreshBinderSelect();

  // tenta abrir o último ativo
  const last = BinderStore.getActiveId();
  if (last && openBinderById(last)) {
    createScreen.style.display = "none";
  } else {
    createScreen.style.display = "flex";
  }

  // trocar binder no select
  sel?.addEventListener("change", () => {
    const id = sel.value;
    if (!id) return; // (Criar novo) deixa na tela
    openBinderById(id);
  });

  // criar binder novo
  createBtn?.addEventListener("click", () => {
    const rows = parseInt(document.getElementById("rows-input").value, 10);
    const columns = parseInt(document.getElementById("columns-input").value, 10);
    const totalPages = parseInt(document.getElementById("pages-input").value, 10);
    const displayMode = document.getElementById("display-mode-input").value;

    const name = document.getElementById("binder-name")?.value || "Binder";

    const config = { rows, columns, totalPages, displayMode };

    const { id, binderObj } = BinderStore.createBinderEntry({ name, config });

    activeBinderId = id;
    binder = binderObj;
    currentPage = 0;

    refreshBinderSelect();

    createScreen.style.display = "none";
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

  list.slice(0, 24).forEach(card => {
    const div = document.createElement("div");
    div.className = "result-card";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = card.img;               // ✅ large do index (scrydex/pokemontcg.io)
    img.alt = card.name || "Carta";
    div.appendChild(img);

    div.addEventListener("click", () => {
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

  // se abriu um binder, seed por binder
  if (activeBinderId) {
    await seedHandIfEmpty();
    refreshHandLayout();
  }

  setupSearch();
});
