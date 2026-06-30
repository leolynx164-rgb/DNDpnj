/* =====================================================
 F ORGE DU PNJ — ap*p.js
 ===================================================== */

// ── Window Controls (Electron IPC via preload) ─────────
(function() {
  const closeBtn = document.getElementById('tl-close');
  const minBtn   = document.getElementById('tl-minimize');
  const maxBtn   = document.getElementById('tl-maximize');
  const appWindow = document.querySelector('.app-window');

  if (!window.electronAPI) return; // running in plain browser — no-op

  closeBtn?.addEventListener('click', () => window.electronAPI.close());
  minBtn?.addEventListener('click', () => window.electronAPI.minimize());
  maxBtn?.addEventListener('click', () => window.electronAPI.maximizeToggle());

  function setMaximized(isMaximized) {
    maxBtn?.classList.toggle('is-maximized', isMaximized);
    // Native apps drop their rounded corners once the window fills the
    // screen (Windows 11 / KDE Wayland snap behavior) — mirror that here.
    appWindow?.classList.toggle('maximized', isMaximized);
  }

  window.electronAPI.onMaximizedChange?.((isMaximized) => setMaximized(isMaximized));

  // Catch the case where the window is already maximized when this
  // renderer loads (e.g. remembered window state, or a reload).
  window.electronAPI.isMaximized?.().then((isMaximized) => setMaximized(isMaximized));
})();

// ── Theme & Accent Color ───────────────────────────────
const ACCENT_PRESETS = [
  { name: 'Violet',  h: 252, s: 83, l: 71 },
{ name: 'Bleu',     h: 211, s: 92, l: 60 },
{ name: 'Sarcelle', h: 174, s: 62, l: 47 },
{ name: 'Vert',     h: 142, s: 50, l: 49 },
{ name: 'Or',       h: 38,  s: 75, l: 55 },
{ name: 'Corail',   h: 9,   s: 78, l: 64 },
{ name: 'Rose',     h: 330, s: 70, l: 65 },
{ name: 'Ardoise',  h: 220, s: 14, l: 46 },
];

const Theme = {
  accent: () => {
    const stored = localStorage.getItem('dnd_accent');
    return stored ? JSON.parse(stored) : ACCENT_PRESETS[0];
  },
  mode: () => localStorage.getItem('dnd_theme') || 'light',

  setAccent(hsl) {
    localStorage.setItem('dnd_accent', JSON.stringify(hsl));
    this.applyAccent(hsl);
  },
  setMode(mode) {
    localStorage.setItem('dnd_theme', mode);
    this.applyMode(mode);
  },

  applyAccent(hsl) {
    const root = document.documentElement;
    root.style.setProperty('--accent-h', hsl.h);
    root.style.setProperty('--accent-s', hsl.s + '%');
    root.style.setProperty('--accent-l', hsl.l + '%');
  },
  applyMode(mode) {
    document.documentElement.setAttribute('data-theme', mode);
  },

  init() {
    this.applyAccent(this.accent());
    this.applyMode(this.mode());
  },

  // Convert a hex color (from <input type="color">) to {h,s,l}
  hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
};

Theme.init();

function initAccentSwatches() {
  const wrap = document.getElementById('accent-swatches');
  if (!wrap) return;
  const current = Theme.accent();

  wrap.innerHTML = ACCENT_PRESETS.map(p => {
    const isSelected = p.h === current.h && p.s === current.s && p.l === current.l;
    return `<button class="swatch ${isSelected ? 'selected' : ''}"
    style="background: hsl(${p.h} ${p.s}% ${p.l}%)"
    data-h="${p.h}" data-s="${p.s}" data-l="${p.l}"
    title="${p.name}"></button>`;
  }).join('');

  wrap.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const hsl = { h: +sw.dataset.h, s: +sw.dataset.s, l: +sw.dataset.l };
      Theme.setAccent(hsl);
      wrap.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
  });
}

document.getElementById('accent-custom-picker')?.addEventListener('input', (e) => {
  const hsl = Theme.hexToHsl(e.target.value);
  Theme.setAccent(hsl);
  document.querySelectorAll('#accent-swatches .swatch').forEach(s => s.classList.remove('selected'));
});

document.querySelectorAll('.theme-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Theme.setMode(btn.dataset.theme);
  });
});

(function initThemeToggleUI() {
  const mode = Theme.mode();
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === mode);
  });
})();

initAccentSwatches();

// ── Settings ──────────────────────────────────────────
const Settings = {
  apiKey:   () => localStorage.getItem('dnd_apikey')   || '',
  model:    () => localStorage.getItem('dnd_model')    || 'openai/gpt-4o-mini',
  endpoint: () => localStorage.getItem('dnd_endpoint') || 'https://openrouter.ai/api/v1/chat/completions',
  save(key, model, endpoint) {
    localStorage.setItem('dnd_apikey',   key);
    localStorage.setItem('dnd_model',    model);
    localStorage.setItem('dnd_endpoint', endpoint);
  }
};

// ── History (Récents) ──────────────────────────────────
const History = {
  KEY: 'dnd_history',
  MAX: 20,

  all() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch {
      return [];
    }
  },

  _write(list) {
    localStorage.setItem(this.KEY, JSON.stringify(list));
  },

  // Saves or updates a sheet. `id` is stable across edits (random
  // generation, description generation, and dock modifications) so a
  // modified PNJ updates its existing entry instead of duplicating it.
  save(sheet, mode, id = null) {
    const list = this.all();
    const entryId = id || `pnj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id: entryId,
      mode,
      sheet,
      name: sheet['NOM'] || 'PNJ sans nom',
      race: sheet['RACE'] || '',
      cls: sheet['CLASSE'] || '',
      updatedAt: Date.now(),
    };

    const existingIndex = list.findIndex(e => e.id === entryId);
    if (existingIndex !== -1) {
      list[existingIndex] = entry;
    } else {
      list.unshift(entry);
    }

    // Keep most recently updated first, capped to MAX entries
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    this._write(list.slice(0, this.MAX));
    return entryId;
  },

  remove(id) {
    this._write(this.all().filter(e => e.id !== id));
  },

  get(id) {
    return this.all().find(e => e.id === id) || null;
  },
};

function renderRecentsList() {
  const wrap = document.getElementById('recents-group');
  if (!wrap) return;
  const items = History.all();

  if (items.length === 0) {
    wrap.innerHTML = '<div class="nav-empty">Aucun PNJ récent</div>';
    return;
  }

  wrap.innerHTML = items.map(e => `
  <button class="nav-item recent-item" data-id="${e.id}" title="${e.name}${e.race ? ' · ' + e.race : ''}${e.cls ? ' · ' + e.cls : ''}">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
  <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>
  </svg>
  <span class="recent-item-label">${e.name}</span>
  <button class="recent-item-delete" data-delete-id="${e.id}" title="Supprimer">✕</button>
  </button>
  `).join('');

  wrap.querySelectorAll('.recent-item').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      // Ignore clicks on the inner delete button — handled separately below
      if (ev.target.closest('.recent-item-delete')) return;
      openRecentEntry(btn.dataset.id);
    });
  });

  wrap.querySelectorAll('.recent-item-delete').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      History.remove(btn.dataset.deleteId);
      renderRecentsList();
    });
  });
}

function openRecentEntry(id) {
  const entry = History.get(id);
  if (!entry) return;

  state.currentSheet = entry.sheet;
  state.currentHistoryId = entry.id;

  // Always reopen into the Description panel: it has the editable sheet
  // view plus the modification dock, which fits a re-opened PNJ either way.
  // preserveContent=true: skip the usual "switching tabs clears the sheet"
  // reset, since we're about to render the sheet we just loaded.
  switchToPanel('describe', { preserveContent: true });
  document.getElementById('describe-empty')?.classList.add('hidden');
  renderSheet(entry.sheet, 'describe-sheet-container', 'describe');
  showDock();
}

// ── State ──────────────────────────────────────────────
let state = {
  currentSheet: null,
  currentHistoryId: null,
  currentPanel: 'random',
  difficulty: '1',
  pendingAnswers: {},
  pendingDescription: '',
  dockCollapsed: false,
};

// ── AI Call ────────────────────────────────────────────
async function callAI(systemPrompt, userPrompt, _attempt = 1) {
  const key = Settings.apiKey();
  if (!key) throw new Error('Clef API manquante. Configurez-la dans Paramètres.');

  const model = Settings.model();
  if (!model) throw new Error('Aucun modèle configuré. Renseignez-le dans Paramètres.');

  let res;
  try {
    res = await fetch(Settings.endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://forge-du-pnj.app',
        'X-Title': 'Forge du PNJ'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt }
        ]
      })
    });
  } catch (networkErr) {
    throw new Error(`Impossible de joindre l'endpoint (${Settings.endpoint()}). Vérifiez votre connexion ou l'URL configurée.`);
  }

  // 429 from OpenRouter usually means: rate-limited, OR no upstream
  // provider currently has capacity for this model (common on ":free"
  // models). A couple of short retries often succeeds.
  if (res.status === 429 && _attempt < 3) {
    const waitMs = 1200 * _attempt;
    showLoading(`Aucun fournisseur disponible, nouvelle tentative (${_attempt}/2)…`);
    await new Promise(r => setTimeout(r, waitMs));
    return callAI(systemPrompt, userPrompt, _attempt + 1);
  }

  const data = await res.json().catch(() => null);

  // OpenRouter sometimes answers with HTTP 200 but embeds the real failure
  // in the body (e.g. the upstream provider rejected the request). Catch
  // that case as well as the standard non-2xx error shape.
  const apiError = data?.error;
  if (!res.ok || apiError) {
    const baseMsg = apiError?.message || `Erreur API ${res.status}`;
    const providerName = apiError?.metadata?.provider_name;
    const rawDetail = apiError?.metadata?.raw;
    let detail = '';
    if (providerName) detail += ` (provider: ${providerName})`;
    if (rawDetail) {
      const rawStr = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
      detail += ` — ${rawStr.slice(0, 200)}`;
    }
    let hint = '';
    if (res.status === 401) hint = ' Vérifiez votre clef API.';
    else if (res.status === 402) hint = ' Crédit OpenRouter insuffisant.';
    else if (res.status === 404 || /not found|invalid model/i.test(baseMsg)) hint = ` Le modèle "${model}" est introuvable ou mal orthographié.`;
    else if (res.status === 429) hint = ` Aucun fournisseur n'a pu traiter la demande pour "${model}" après plusieurs tentatives. Ce modèle est probablement saturé (fréquent sur les modèles ":free") — réessayez dans un instant ou changez de modèle dans Paramètres.`;

    throw new Error(`${baseMsg}${detail}.${hint}`);
  }

  const choice = data?.choices?.[0];
  const content = choice?.message?.content;

  if (!content) {
    // Generated but empty — usually a finish_reason worth surfacing (e.g. length, content_filter)
    const reason = choice?.finish_reason ? ` (raison: ${choice.finish_reason})` : '';
    throw new Error(`Le modèle n'a renvoyé aucun contenu${reason}. Essayez un autre modèle.`);
  }

  return content;
}

// ── Prompts ────────────────────────────────────────────
function buildSystemPrompt() {
  return `Tu es un expert en Donjons & Dragons 5e. Tu génères des PNJ complets et cohérents.

  Tu dois TOUJOURS répondre avec exactement ce format de balises. Ne mets rien en dehors de ces balises.

  [NOM:texte];[RACE:texte];[CLASSE:texte];[NIVEAU:texte];[ALIGNEMENT:texte];[CA:texte];[PV:texte];[VITESSE:texte];[BONUS_MAITRISE:texte];
  [FOR:nombre];[DEX:nombre];[CON:nombre];[INT:nombre];[SAG:nombre];[CHA:nombre];
  [MAÎTRISES:texte];[LANGUES:texte];[SENS:texte];
  [ARMES:texte];[EQUIPEMENT:texte];
  [SORTS:texte];
  [CAPACITES:texte];
  [HISTOIRE:texte];
  [PERSONNALITE:texte];
  [DEFAUTS:texte];
  [LIENS:texte];
  [IDEAUX:texte];
  [APPARENCE:texte]

  Règles importantes:
  - Le NOM doit être culturellement cohérent avec la race (ex: nain→ Thorin Ironhelm, elfe→ Aelindra Silversong)
  - SORTS: si pas de sorts, écris "Aucun". Sinon: "Niveau 0: sort1, sort2 | Niveau 1: sort3, sort4"
  - MAÎTRISES: liste les compétences séparées par des virgules
  - ARMES: liste séparée par des virgules
  - EQUIPEMENT: liste séparée par des virgules
  - CAPACITES: liste les traits spéciaux séparés par " | "
  - HISTOIRE: 3-5 phrases narratives
  - Tous les textes en français`;
}

function buildRandomPrompt(difficulty) {
  const crMap = { '1': 'CR 1 à 4 (novice, ~20-45 PV)', '2': 'CR 5 à 10 (vétéran, ~50-120 PV)', '3': 'CR 11 à 16 (élite, ~130-250 PV)', '4': 'CR 17 à 25 (légendaire, ~260+ PV)' };
  const races = ['Humain','Elfe','Demi-Elfe','Nain','Halfelin','Gnome','Demi-Orc','Tieflin','Dragonborn','Aarakocra','Genasi','Goliath','Tabaxi','Triton','Aasimar'];
  const classes = ['Guerrier','Rôdeur','Voleur','Mage','Ensorceleur','Druide','Clerc','Paladin','Barde','Moine','Sorcier','Barbare','Artificier'];
  const race = races[Math.floor(Math.random() * races.length)];
  const cls  = classes[Math.floor(Math.random() * classes.length)];

  return `Génère un PNJ aléatoire complet avec les paramètres suivants:
  - Race: ${race}
  - Classe: ${cls}
  - Puissance cible: ${crMap[difficulty]}
  - Rends-le intéressant, avec une personnalité distincte et une histoire originale.`;
}

function buildDescribePrompt(description, answers) {
  let prompt = `L'utilisateur décrit ce PNJ: "${description}"`;
  if (Object.keys(answers).length > 0) {
    prompt += '\n\nRéponses aux questions de clarification:';
    for (const [q, a] of Object.entries(answers)) {
      prompt += `\n- ${q}: ${a}`;
    }
  }
  prompt += '\n\nGénère la fiche complète de ce PNJ.';
  return prompt;
}

function buildDescribeSystemPromptWithQuestions() {
  return `Tu es un expert en Donjons & Dragons 5e.

  Analyse la description du PNJ. Si tu as besoin de précisions sur au plus 3 points importants, pose des questions AVANT de générer.

  Format des questions (si nécessaire):
  [Q:Texte de la question 1?:option1;option2;option3;Autre];[Q:Texte de la question 2?:option1;option2;Autre]

  Si tu as assez d'informations, génère directement la fiche complète avec ce format:
  [NOM:texte];[RACE:texte];[CLASSE:texte];[NIVEAU:texte];[ALIGNEMENT:texte];[CA:texte];[PV:texte];[VITESSE:texte];[BONUS_MAITRISE:texte];[FOR:nombre];[DEX:nombre];[CON:nombre];[INT:nombre];[SAG:nombre];[CHA:nombre];[MAÎTRISES:texte];[LANGUES:texte];[SENS:texte];[ARMES:texte];[EQUIPEMENT:texte];[SORTS:texte];[CAPACITES:texte];[HISTOIRE:texte];[PERSONNALITE:texte];[DEFAUTS:texte];[LIENS:texte];[IDEAUX:texte];[APPARENCE:texte]

  Ne pose JAMAIS plus de 3 questions. Si tu génères la fiche, ne pose PAS de questions.`;
}

function buildModifyPrompt(currentSheetData, modification) {
  return `Voici la fiche actuelle du PNJ:
  ${JSON.stringify(currentSheetData, null, 2)}

  L'utilisateur demande la modification suivante: "${modification}"

  Génère la fiche COMPLÈTE mise à jour avec toutes les balises, en appliquant la modification demandée.`;
}

// ── Parse Sheet ────────────────────────────────────────
function parseSheet(text) {
  const sheet = {};
  const regex = /\[([A-ZÀÂÇÉÈÊËÎÏÔÛÙÜŸÆŒ_Î]+):([^\]]*)\]/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1].toUpperCase().trim();
    const val = match[2].trim();
    sheet[key] = val;
  }
  return sheet;
}

function parseQuestions(text) {
  const questions = [];
  const regex = /\[Q:([^:]+):([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const question = match[1].trim();
    const options = match[2].split(';').map(o => o.trim()).filter(Boolean);
    questions.push({ question, options });
  }
  return questions;
}

// ── Stat Modifier ──────────────────────────────────────
function mod(score) {
  const n = parseInt(score) || 10;
  const m = Math.floor((n - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

// ── Render Sheet ───────────────────────────────────────
function renderSheet(sheet, containerId, mode = 'random') {
  const container = document.getElementById(containerId);

  const spells = sheet['SORTS'] && sheet['SORTS'].toLowerCase() !== 'aucun'
  ? renderSpells(sheet['SORTS'])
  : '<span class="tag">Aucun sort</span>';

  const capacites = sheet['CAPACITES']
  ? sheet['CAPACITES'].split('|').map(c => `<span class="tag accent">${c.trim()}</span>`).join('')
  : '';

  const armes = sheet['ARMES']
  ? sheet['ARMES'].split(',').map(a => `<span class="tag gold">${a.trim()}</span>`).join('')
  : '';

  const maitrisesArr = sheet['MAÎTRISES'] || sheet['MAITRISES'] || '';
  const maitriseTags = maitrisesArr.split(',').map(m => `<span class="tag">${m.trim()}</span>`).join('');

  const equipArr = sheet['EQUIPEMENT'] || '';
  const equipTags = equipArr.split(',').map(e => `<span class="tag">${e.trim()}</span>`).join('');

  const infoBlocks = [
    { label: 'CA', value: sheet['CA'] || '—' },
    { label: 'Points de Vie', value: sheet['PV'] || '—' },
    { label: 'Vitesse', value: sheet['VITESSE'] || '—' },
    { label: 'Alignement', value: sheet['ALIGNEMENT'] || '—' },
    { label: 'Bonus Maîtrise', value: sheet['BONUS_MAITRISE'] || '—' },
    { label: 'Langues', value: sheet['LANGUES'] || '—' },
  ].map(b => `
  <div class="info-block">
  <div class="info-label">${b.label}</div>
  <div class="info-value" contenteditable="true" spellcheck="false">${b.value}</div>
  </div>
  `).join('');

  const statsArr = [
    { name: 'FOR', key: 'FOR' }, { name: 'DEX', key: 'DEX' },
    { name: 'CON', key: 'CON' }, { name: 'INT', key: 'INT' },
    { name: 'SAG', key: 'SAG' }, { name: 'CHA', key: 'CHA' }
  ];

  const statsHtml = statsArr.map(s => `
  <div class="stat-block">
  <div class="stat-name">${s.name}</div>
  <input class="stat-value" type="number" value="${sheet[s.key] || 10}" min="1" max="30" data-stat="${s.key}">
  <div class="stat-mod">${mod(sheet[s.key] || 10)}</div>
  </div>
  `).join('');

  const dockBtn = mode === 'describe' ? `
  <button class="btn-icon" onclick="showDock()">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
  Modifier
  </button>` : '';

  container.innerHTML = `
  <div class="character-sheet" id="character-sheet">
  <div class="sheet-header">
  <div class="sheet-identity">
  <div class="sheet-name" contenteditable="true" spellcheck="false">${sheet['NOM'] || 'PNJ Inconnu'}</div>
  <div class="sheet-subtitle">${sheet['RACE'] || '—'} · ${sheet['CLASSE'] || '—'} · Niveau ${sheet['NIVEAU'] || '?'}</div>
  </div>
  <div class="sheet-actions">
  ${dockBtn}
  <button class="btn-icon" onclick="exportPDF()">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7,10 12,15 17,10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
  Exporter PDF
  </button>
  </div>
  </div>

  <div class="sheet-body">

  <div class="sheet-section">
  <div class="sheet-section-title">Caractéristiques</div>
  <div class="stats-grid">${statsHtml}</div>
  </div>

  <div class="sheet-section">
  <div class="sheet-section-title">Informations Générales</div>
  <div class="info-grid">${infoBlocks}</div>
  </div>

  ${sheet['APPARENCE'] ? `
    <div class="sheet-section">
    <div class="sheet-section-title">Apparence</div>
    <div class="text-block" contenteditable="true" spellcheck="false">${sheet['APPARENCE']}</div>
    </div>` : ''}

    <div class="sheet-section">
    <div class="sheet-section-title">Capacités & Traits</div>
    <div class="tags-list">${capacites || '<span class="tag">Aucune capacité spéciale</span>'}</div>
    </div>

    <div class="sheet-section">
    <div class="sheet-section-title">Maîtrises</div>
    <div class="tags-list">${maitriseTags}</div>
    </div>

    <div class="sheet-section">
    <div class="sheet-section-title">Armes</div>
    <div class="tags-list">${armes}</div>
    </div>

    <div class="sheet-section">
    <div class="sheet-section-title">Équipement</div>
    <div class="tags-list">${equipTags}</div>
    </div>

    <div class="sheet-section">
    <div class="sheet-section-title">Sorts</div>
    <div>${spells}</div>
    </div>

    <div class="sheet-2col">
    <div class="sheet-section">
    <div class="sheet-section-title">Personnalité</div>
    <div class="text-block" contenteditable="true" spellcheck="false">${sheet['PERSONNALITE'] || '—'}</div>
    </div>
    <div class="sheet-section">
    <div class="sheet-section-title">Idéaux</div>
    <div class="text-block" contenteditable="true" spellcheck="false">${sheet['IDEAUX'] || '—'}</div>
    </div>
    <div class="sheet-section">
    <div class="sheet-section-title">Liens</div>
    <div class="text-block" contenteditable="true" spellcheck="false">${sheet['LIENS'] || '—'}</div>
    </div>
    <div class="sheet-section">
    <div class="sheet-section-title">Défauts</div>
    <div class="text-block" contenteditable="true" spellcheck="false">${sheet['DEFAUTS'] || '—'}</div>
    </div>
    </div>

    <div class="sheet-section">
    <div class="sheet-section-title">Histoire</div>
    <div class="text-block" contenteditable="true" spellcheck="false">${sheet['HISTOIRE'] || '—'}</div>
    </div>

    ${sheet['SENS'] ? `
      <div class="sheet-section">
      <div class="sheet-section-title">Sens</div>
      <div class="text-block" contenteditable="true" spellcheck="false">${sheet['SENS']}</div>
      </div>` : ''}

      </div>
      </div>
      `;

      container.classList.remove('hidden');

      // Update stat modifiers live
      container.querySelectorAll('.stat-value').forEach(input => {
        input.addEventListener('input', () => {
          const modEl = input.closest('.stat-block').querySelector('.stat-mod');
          modEl.textContent = mod(input.value);
        });
      });
}

function renderSpells(sortsText) {
  // Format: "Niveau 0: sort1, sort2 | Niveau 1: sort3, sort4"
  const groups = sortsText.split('|');
  if (groups.length === 0) return `<span class="tag">${sortsText}</span>`;

  return `<div class="spells-list">` + groups.map(g => {
    const parts = g.split(':');
    if (parts.length < 2) return `<div class="spell-item"><span class="spell-name">${g.trim()}</span></div>`;
    const level = parts[0].trim();
    const spells = parts.slice(1).join(':').trim();
    return `<div class="spell-item">
    <span class="spell-level">${level.replace('Niveau ', 'Niv.')}</span>
    <span class="spell-name">${spells}</span>
    </div>`;
  }).join('') + `</div>`;
}

// ── Extract Current Sheet Data ─────────────────────────
function extractCurrentSheet() {
  const sheet = document.getElementById('character-sheet');
  if (!sheet) return {};

  const data = {};
  data['NOM'] = sheet.querySelector('.sheet-name')?.textContent?.trim() || '';
  const subtitle = sheet.querySelector('.sheet-subtitle')?.textContent || '';
  const subParts = subtitle.split('·').map(s => s.trim());
  data['RACE'] = subParts[0] || '';
  data['CLASSE'] = subParts[1] || '';
  data['NIVEAU'] = (subParts[2] || '').replace('Niveau ', '').trim();

  sheet.querySelectorAll('.stat-block').forEach(b => {
    const name = b.querySelector('.stat-name')?.textContent?.trim();
    const val  = b.querySelector('.stat-value')?.value;
    if (name && val) data[name] = val;
  });

    sheet.querySelectorAll('.info-block').forEach(b => {
      const label = b.querySelector('.info-label')?.textContent?.trim();
      const val   = b.querySelector('.info-value')?.textContent?.trim();
      if (label && val) {
        const keyMap = { 'CA': 'CA', 'Points de Vie': 'PV', 'Vitesse': 'VITESSE',
          'Alignement': 'ALIGNEMENT', 'Bonus Maîtrise': 'BONUS_MAITRISE', 'Langues': 'LANGUES' };
          const key = keyMap[label];
          if (key) data[key] = val;
      }
    });

    sheet.querySelectorAll('.text-block').forEach((b, i) => {
      // Best effort — grab what we can
    });

    return data;
}

// ── Navigation ─────────────────────────────────────────

// Clears whatever sheet/content was previously shown in a panel and
// brings back its empty/hero state. Called whenever the user switches
// tabs "from scratch" (not via openRecentEntry, which wants to keep the
// sheet it just loaded).
function resetPanelToEmpty(panel) {
  if (panel === 'random') {
    document.getElementById('random-sheet-container')?.classList.add('hidden');
    document.getElementById('random-sheet-container').innerHTML = '';
    document.getElementById('random-empty')?.classList.remove('hidden');
  } else if (panel === 'describe') {
    document.getElementById('describe-sheet-container')?.classList.add('hidden');
    document.getElementById('describe-sheet-container').innerHTML = '';
    document.getElementById('describe-empty')?.classList.remove('hidden');
    document.getElementById('questions-panel')?.classList.add('hidden');
    const input = document.getElementById('describe-input');
    if (input) input.value = '';
    hideDock();
  }
  state.currentSheet = null;
  state.currentHistoryId = null;
}

function switchToPanel(panel, { preserveContent = false } = {}) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.nav-item[data-panel="${panel}"]`)?.classList.add('active');
  document.getElementById(`panel-${panel}`)?.classList.add('active');

  if (!preserveContent) resetPanelToEmpty(panel);
  if (panel !== 'describe' && !preserveContent) hideDock();

  state.currentPanel = panel;
}

document.querySelectorAll('.nav-item[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => switchToPanel(btn.dataset.panel));
});

// ── Difficulty ─────────────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.difficulty = btn.dataset.diff;
  });
});

// ── Random Generate ────────────────────────────────────
document.getElementById('btn-random-generate').addEventListener('click', async () => {
  showLoading('Forge en cours…');
  try {
    const sys  = buildSystemPrompt();
    const user = buildRandomPrompt(state.difficulty);
    const raw  = await callAI(sys, user);
    const sheet = parseSheet(raw);

    if (!sheet['NOM'] && !sheet['RACE']) {
      throw new Error('Réponse invalide. Vérifiez votre clef API et le modèle.');
    }

    state.currentSheet = sheet;
    state.currentHistoryId = History.save(sheet, 'random');
    renderRecentsList();
    renderSheet(sheet, 'random-sheet-container', 'random');
    document.getElementById('random-empty')?.classList.add('hidden');
  } catch(e) {
    showError(e.message);
  } finally {
    hideLoading();
  }
});

// ── Describe Generate ──────────────────────────────────
document.getElementById('btn-describe-generate').addEventListener('click', async () => {
  const desc = document.getElementById('describe-input').value.trim();
  if (!desc) return;

  state.pendingDescription = desc;
  state.pendingAnswers = {};

  showLoading('Analyse de votre description…');
  try {
    const sys  = buildDescribeSystemPromptWithQuestions();
    const raw  = await callAI(sys, desc);

    const questions = parseQuestions(raw);

    if (questions.length > 0) {
      // Has questions — show them
      hideLoading();
      showQuestions(questions);
    } else {
      // Direct generation
      const sheet = parseSheet(raw);
      if (!sheet['NOM'] && !sheet['RACE']) throw new Error('Réponse invalide.');
      state.currentSheet = sheet;
      state.currentHistoryId = History.save(sheet, 'describe');
      renderRecentsList();
      renderSheet(sheet, 'describe-sheet-container', 'describe');
      document.getElementById('describe-empty')?.classList.add('hidden');
      showDock();
      hideLoading();
    }
  } catch(e) {
    hideLoading();
    showError(e.message);
  }
});

function showQuestions(questions) {
  const list = document.getElementById('questions-list');
  list.innerHTML = '';
  state._questions = questions;

  questions.forEach((q, qi) => {
    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `<div class="question-label">${q.question}</div>
    <div class="question-options">
    ${q.options.map(opt => `<button class="q-option" data-q="${qi}" data-val="${opt}">${opt}</button>`).join('')}
    </div>`;
    list.appendChild(div);
  });

  list.querySelectorAll('.q-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = btn.dataset.q;
      list.querySelectorAll(`.q-option[data-q="${qi}"]`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('questions-panel').classList.remove('hidden');
}

document.getElementById('btn-submit-answers').addEventListener('click', async () => {
  const qs = state._questions || [];
  const answers = {};

  qs.forEach((q, qi) => {
    const selected = document.querySelector(`.q-option[data-q="${qi}"].selected`);
    if (selected) answers[q.question] = selected.dataset.val;
  });

    document.getElementById('questions-panel').classList.add('hidden');
    showLoading('Génération de la fiche…');

    try {
      const sys  = buildSystemPrompt();
      const user = buildDescribePrompt(state.pendingDescription, answers);
      const raw  = await callAI(sys, user);
      const sheet = parseSheet(raw);
      if (!sheet['NOM'] && !sheet['RACE']) throw new Error('Réponse invalide.');
      state.currentSheet = sheet;
      state.currentHistoryId = History.save(sheet, 'describe');
      renderRecentsList();
      renderSheet(sheet, 'describe-sheet-container', 'describe');
      document.getElementById('describe-empty')?.classList.add('hidden');
      showDock();
    } catch(e) {
      showError(e.message);
    } finally {
      hideLoading();
    }
});

// ── Dock (Modify) ──────────────────────────────────────
function showDock() {
  document.getElementById('floating-dock').classList.remove('hidden');
}
function hideDock() {
  document.getElementById('floating-dock').classList.add('hidden');
}

document.getElementById('dock-toggle').addEventListener('click', () => {
  const dock = document.getElementById('floating-dock');
  state.dockCollapsed = !state.dockCollapsed;
  dock.classList.toggle('collapsed', state.dockCollapsed);
  document.getElementById('dock-toggle').textContent = state.dockCollapsed ? '+' : '−';
});

document.getElementById('btn-dock-send').addEventListener('click', async () => {
  const modText = document.getElementById('dock-input').value.trim();
  if (!modText) return;

  const currentData = extractCurrentSheet();
  showLoading('Application de la modification…');

  try {
    const sys  = buildSystemPrompt();
    const user = buildModifyPrompt(currentData, modText);
    const raw  = await callAI(sys, user);
    const sheet = parseSheet(raw);
    if (!sheet['NOM'] && !sheet['RACE']) throw new Error('Modification invalide.');
    state.currentSheet = sheet;
    state.currentHistoryId = History.save(sheet, 'describe', state.currentHistoryId);
    renderRecentsList();
    renderSheet(sheet, 'describe-sheet-container', 'describe');
    document.getElementById('dock-input').value = '';
  } catch(e) {
    showError(e.message);
  } finally {
    hideLoading();
  }
});

// ── Settings ───────────────────────────────────────────
// Pre-fill settings from storage
document.getElementById('setting-apikey').value   = Settings.apiKey();
document.getElementById('setting-model').value    = Settings.model();
document.getElementById('setting-endpoint').value = Settings.endpoint();

function updateModelPill() {
  const label = document.getElementById('model-pill-label');
  if (label) label.textContent = Settings.model() || 'Aucun modèle';
}
updateModelPill();

document.getElementById('btn-save-settings').addEventListener('click', () => {
  const key      = document.getElementById('setting-apikey').value.trim();
  const model    = document.getElementById('setting-model').value.trim();
  const endpoint = document.getElementById('setting-endpoint').value.trim();
  Settings.save(key, model, endpoint);
  updateModelPill();
  const status = document.getElementById('settings-status');
  status.textContent = '✓ Paramètres sauvegardés';
  status.className = 'settings-status ok';
  setTimeout(() => { status.textContent = ''; status.className = 'settings-status'; }, 3000);
});

document.getElementById('model-pill')?.addEventListener('click', () => {
  document.querySelector('.nav-item[data-panel="settings"]')?.click();
});

// ── Export PDF ─────────────────────────────────────────
function exportPDF() {
  const sheet = document.getElementById('character-sheet');
  if (!sheet) return;

  // Build a clean print window
  const name = sheet.querySelector('.sheet-name')?.textContent || 'pnj';
  const subtitle = sheet.querySelector('.sheet-subtitle')?.textContent || '';

  const printWin = window.open('', '_blank', 'width=900,height=700');
  printWin.document.write(`<!DOCTYPE html>
  <html><head>
  <meta charset="UTF-8">
  <title>PNJ — ${name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #fff; color: #111; padding: 32px; font-size: 12px; line-height: 1.5; }
  h1 { font-family: 'Cinzel', serif; font-size: 26px; color: #1a1a3a; margin-bottom: 4px; }
  .subtitle { color: #7c6af7; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: #7c6af7; border-bottom: 1px solid #e0dcf7; padding-bottom: 4px; margin-bottom: 10px; }
  .stats-grid { display: grid; grid-template-columns: repeat(6,1fr); gap: 8px; margin-bottom: 4px; }
  .stat-block { border: 1px solid #e0dcf7; border-radius: 6px; padding: 10px 6px; text-align: center; }
  .stat-name { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 4px; }
  .stat-val { font-size: 20px; font-weight: 600; font-family: 'Cinzel',serif; color: #1a1a3a; }
  .stat-mod { font-size: 11px; color: #888; margin-top: 2px; }
  .info-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .info-block { border: 1px solid #e0dcf7; border-radius: 6px; padding: 10px 12px; }
  .info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 3px; }
  .info-val { font-size: 13px; font-weight: 500; color: #1a1a3a; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { padding: 3px 10px; border: 1px solid #ddd; border-radius: 20px; font-size: 11px; color: #444; }
  .tag.accent { border-color: #c4baf7; color: #5a4ec4; }
  .tag.gold { border-color: #e0cb88; color: #9c7e36; }
  .text-box { border: 1px solid #e0dcf7; border-radius: 6px; padding: 12px 14px; color: #444; font-size: 12px; line-height: 1.6; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .spell-row { display: flex; gap: 10px; padding: 6px 12px; border: 1px solid #e0dcf7; border-radius: 6px; margin-bottom: 4px; font-size: 11px; }
  .spell-level { color: #7c6af7; font-weight: 600; min-width: 40px; }
  @media print { body { padding: 24px; } }
  </style>
  </head><body>`);

  printWin.document.write(`<h1>${name}</h1><div class="subtitle">${subtitle}</div>`);

  // Stats
  const statInputs = sheet.querySelectorAll('.stat-block');
  printWin.document.write('<div class="section"><div class="section-title">Caractéristiques</div><div class="stats-grid">');
  statInputs.forEach(sb => {
    const n = sb.querySelector('.stat-name')?.textContent || '';
    const v = sb.querySelector('.stat-value')?.value || '10';
    const m = sb.querySelector('.stat-mod')?.textContent || '';
    printWin.document.write(`<div class="stat-block"><div class="stat-name">${n}</div><div class="stat-val">${v}</div><div class="stat-mod">${m}</div></div>`);
  });
  printWin.document.write('</div></div>');

  // Info blocks
  const infoBlocks = sheet.querySelectorAll('.info-block');
  printWin.document.write('<div class="section"><div class="section-title">Informations</div><div class="info-grid">');
  infoBlocks.forEach(ib => {
    const l = ib.querySelector('.info-label')?.textContent || '';
    const v = ib.querySelector('.info-value')?.textContent || '';
    printWin.document.write(`<div class="info-block"><div class="info-label">${l}</div><div class="info-val">${v}</div></div>`);
  });
  printWin.document.write('</div></div>');

  // Sections with text blocks
  const sections = sheet.querySelectorAll('.sheet-section');
  sections.forEach(sec => {
    const title = sec.querySelector('.sheet-section-title')?.textContent?.trim() || '';
    if (title === 'Caractéristiques' || title === 'Informations Générales') return;

    printWin.document.write(`<div class="section"><div class="section-title">${title}</div>`);

    const textBlocks = sec.querySelectorAll('.text-block');
    const tagLists   = sec.querySelectorAll('.tags-list');
    const spellsList = sec.querySelector('.spells-list');

    if (textBlocks.length > 0) {
      textBlocks.forEach(tb => {
        printWin.document.write(`<div class="text-box">${tb.textContent}</div>`);
      });
    } else if (tagLists.length > 0) {
      tagLists.forEach(tl => {
        const tags = Array.from(tl.querySelectorAll('.tag')).map(t => {
          const cls = t.classList.contains('accent') ? 'accent' : t.classList.contains('gold') ? 'gold' : '';
          return `<span class="tag ${cls}">${t.textContent}</span>`;
        }).join('');
        printWin.document.write(`<div class="tags">${tags}</div>`);
      });
    } else if (spellsList) {
      const rows = Array.from(spellsList.querySelectorAll('.spell-item')).map(si => {
        const lv = si.querySelector('.spell-level')?.textContent || '';
        const nm = si.querySelector('.spell-name')?.textContent || '';
        return `<div class="spell-row"><span class="spell-level">${lv}</span><span>${nm}</span></div>`;
      }).join('');
      printWin.document.write(rows);
    }

    printWin.document.write('</div>');
  });

  printWin.document.write('</body></html>');
  printWin.document.close();
  setTimeout(() => { printWin.print(); }, 800);
}

// ── Loading ────────────────────────────────────────────
function showLoading(text) {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}
function showError(msg) {
  hideLoading();
  alert(`Erreur: ${msg}`);
}

// ── Startup ────────────────────────────────────────────
renderRecentsList();
