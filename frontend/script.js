// ---- Definitions ----
const PALETTE = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c'];
const TIMEFRAME_DAYS = { '1y': 365, '1m': 30, '1w': 7, '1d': 1 };

const definitions = {};  // key -> indicator definition (loaded from the server)
let stocks = [];         // stock list loaded from the server
const state = { chartType: 'line', timeframe: 'all', stock: null, indicators: [], data: null };
let nextId = 1;

const $ = (id) => document.getElementById(id);
const searchInput = $('searchInput');
const searchDropdown = $('searchDropdown');
const cardsList = $('cardsList');
const subPlots = $('subPlotsContainer');

const ICON_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
const ICON_MINUS = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ICON_PLUS = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>';
const ICON_CLOSE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
const ICON_CHECK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>';

// ---- Server communication ----
async function request(url, options) {
    const res = await fetch(url, options);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (HTTP ${res.status}).`);
    return body;
}

const errorText = (err) => (err instanceof TypeError ? 'Cannot reach the server.' : err.message);

function showError(text) {
    const el = $('errorBox');
    el.textContent = text;
    el.hidden = !text;
}

$('errorBox').addEventListener('click', () => showError(''));  // click the message to dismiss it

let refreshTimer = null;
let controller = null;

// Debounced so that dragging or typing does not fire a request per keystroke
function scheduleRefresh(delay = 250) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
}

async function refresh() {
    if (!state.stock) return;
    if (controller) controller.abort();  // the previous request is now obsolete
    controller = new AbortController();
    try {
        state.data = await request('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stock: state.stock.name,
                // Hidden indicators are not calculated at all
                indicators: state.indicators.filter((i) => i.visible).map((i) => ({ id: i.id, key: i.key, params: i.params }))
            }),
            signal: controller.signal
        });
        showError('');
        render();
    } catch (err) {
        if (err.name === 'AbortError') return;
        showError(errorText(err));
    }
}

// ---- Charts ----
const charts = new Map();  // indicator id -> sub chart

function syncCursor(index) {
    mainChart.setCursor(index);
    charts.forEach((c) => c.setCursor(index));
}

const mainChart = new CanvasChart($('mainPlot'), { onHover: syncCursor });

// First visible row for the selected timeframe (indicators are calculated on all data, only the view is cut)
function visibleStart(dates) {
    const days = TIMEFRAME_DAYS[state.timeframe];
    if (!days) return 0;
    const cutoff = new Date(Date.parse(dates[dates.length - 1]) - days * 86400000).toISOString().slice(0, 10);
    const start = dates.findIndex((d) => d >= cutoff);
    return Math.max(0, Math.min(start, dates.length - 2));  // at least 2 points are shown
}

function render() {
    const data = state.data;
    if (!data) return;
    const start = visibleStart(data.dates);
    const cut = (arr) => arr.slice(start);
    const dates = cut(data.dates);
    const overlays = [];

    state.indicators.forEach((ind) => {
        const result = ind.visible && data.indicators.find((r) => r.id === ind.id);
        if (!result) return;  // hidden or not calculated yet
        const series = Object.entries(result.series).map(([name, values], i) => ({
            name, color: ind.color, dash: i === 0 ? [] : [5, 4], values: cut(values)
        }));
        if (result.panel === 'separate') {
            const chart = charts.get(ind.id);
            if (chart) chart.setData({ dates, type: 'line', series, guides: result.guides });
        } else {
            overlays.push(...series);
        }
    });

    mainChart.setData({
        dates, type: state.chartType, series: overlays,
        open: cut(data.open), high: cut(data.high), low: cut(data.low), close: cut(data.close)
    });
}

function clearCharts() {
    state.data = null;
    mainChart.setData(null);
    charts.forEach((c) => c.setData(null));
}

// ---- Segmented controls (chart type and timeframe) ----
function initSegmented(el, onChange) {
    const options = [...el.querySelectorAll('.seg-option')];
    el.addEventListener('click', (e) => {
        const opt = e.target.closest('.seg-option');
        if (!opt) return;
        const index = options.indexOf(opt);
        el.style.setProperty('--index', index);
        options.forEach((o, i) => o.classList.toggle('active', i === index));
        onChange(opt.dataset.value);
    });
}

initSegmented($('chartTypeSwitch'), (v) => { state.chartType = v; render(); });
initSegmented($('timeframeSwitch'), (v) => { state.timeframe = v; render(); });

// ---- Search / dropdown ----
let dropdownItems = [];
let dropdownEmpty = null;

function buildDropdown() {
    searchDropdown.innerHTML = Object.values(definitions).map((def) => `
        <button class="dropdown-item" data-type="${def.key}" data-search="${[def.key, def.label, ...def.aliases].join(' ').toLowerCase()}">
            <span>${def.key.toUpperCase()} - ${def.label}</span>
            <span class="badge">${def.panel === 'separate' ? 'Separate' : 'Overlay'}</span>
        </button>`).join('') + '<div class="dropdown-empty" hidden>No results found</div>';
    dropdownItems = [...searchDropdown.querySelectorAll('.dropdown-item')];
    dropdownEmpty = searchDropdown.querySelector('.dropdown-empty');
}

function filterDropdown() {
    const q = searchInput.value.trim().toLowerCase();
    let visible = 0;
    dropdownItems.forEach((item) => {
        const match = item.dataset.search.includes(q);
        item.hidden = !match;
        if (match) visible++;
    });
    if (dropdownEmpty) dropdownEmpty.hidden = visible > 0;
}

searchInput.addEventListener('focus', () => { filterDropdown(); searchDropdown.classList.add('show'); });
searchInput.addEventListener('input', () => { filterDropdown(); searchDropdown.classList.add('show'); });
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchDropdown.classList.remove('show'); searchInput.blur(); }
    if (e.key === 'Enter') {
        const first = dropdownItems.find((i) => !i.hidden);
        if (first) addIndicator(first.dataset.type);
    }
});
searchDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (item) addIndicator(item.dataset.type);
});
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) searchDropdown.classList.remove('show');
});

// ---- Add / remove / update indicators ----
function pickColor() {
    const used = new Set(state.indicators.map((i) => i.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[state.indicators.length % PALETTE.length];
}

function updateEmptyHint() {
    $('emptyHint').hidden = state.indicators.length > 0;
}

// Parameter values shown next to the name, e.g. "(30)" or "(12, 26, 9)"
function paramSummary(ind) {
    return `(${definitions[ind.key].params.map((p) => ind.params[p.name]).join(', ')})`;
}

function addIndicator(key) {
    const def = definitions[key];
    if (!def) return;

    const params = Object.fromEntries(def.params.map((p) => [p.name, p.default]));
    const ind = { id: `ind-${nextId++}`, key, label: def.label, color: pickColor(), params, visible: true };
    state.indicators.push(ind);

    const card = createCard(ind);
    cardsList.appendChild(card);
    if (def.panel === 'separate') {
        const box = createSubPlot(ind);
        subPlots.appendChild(box);
        charts.set(ind.id, new CanvasChart(box, { onHover: syncCursor }));
    }

    searchInput.value = '';
    searchDropdown.classList.remove('show');
    updateEmptyHint();
    requestAnimationFrame(() => card.classList.add('open')); // smooth opening
    scheduleRefresh(0);
}

function removeIndicator(id) {
    state.indicators = state.indicators.filter((i) => i.id !== id);
    if (charts.has(id)) { charts.get(id).destroy(); charts.delete(id); }
    document.querySelectorAll(`[data-id="${id}"]`).forEach((el) => el.remove());
    updateEmptyHint();
    render();
    scheduleRefresh();
}

function setVisible(ind, visible) {
    ind.visible = visible;
    document.querySelectorAll(`[data-id="${ind.id}"]`).forEach((el) => {
        el.classList.toggle('is-off', !visible);
        el.querySelectorAll('.check').forEach((c) => c.setAttribute('aria-pressed', visible));
    });
    if (visible) scheduleRefresh(0);  // it was not calculated while hidden
    else render();
}

function setColor(ind, color) {
    ind.color = color;
    document.querySelectorAll(`[data-id="${ind.id}"]`).forEach((el) => {
        el.style.setProperty('--ind-color', color);
        el.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', s.dataset.color === color));
    });
    render();  // a color change does not need the server
}

function setParam(ind, name, input, commit) {
    const p = definitions[ind.key].params.find((x) => x.name === name);
    const value = Number(input.value);
    if (input.value === '' || Number.isNaN(value)) {
        if (commit) input.value = ind.params[name]; // restore the old value when invalid
        return;
    }
    const snapped = Math.round(value / p.step) * p.step;
    const clamped = Number(Math.min(p.max, Math.max(p.min, snapped)).toFixed(4));
    ind.params[name] = clamped;
    if (commit) input.value = clamped;
    input.closest('.indicator-card').querySelector('.summary').textContent = paramSummary(ind);
    if (ind.visible) scheduleRefresh();
}

// ---- DOM creation ----
function createCard(ind) {
    const card = document.createElement('div');
    card.className = 'indicator-card';
    card.dataset.id = ind.id;
    card.style.setProperty('--ind-color', ind.color);

    const swatches = PALETTE.map((c) =>
        `<button class="swatch" style="--swatch:${c}" data-action="pick" data-color="${c}" aria-label="Color ${c}" aria-pressed="${c === ind.color}"></button>`).join('');

    const params = definitions[ind.key].params.map((p) => `
        <div class="param-row">
            <span class="param-label">${p.label}:</span>
            <div class="stepper">
                <button class="step-btn" data-action="step" data-dir="-1" aria-label="Decrease">${ICON_MINUS}</button>
                <input type="number" class="param-input" data-param="${p.name}" value="${ind.params[p.name]}" min="${p.min}" max="${p.max}" step="${p.step}">
                <button class="step-btn" data-action="step" data-dir="1" aria-label="Increase">${ICON_PLUS}</button>
            </div>
        </div>`).join('');

    card.innerHTML = `
        <div class="card-header">
            <button class="check" data-action="visible" aria-pressed="true" aria-label="Show or hide on chart">${ICON_CHECK}</button>
            <button class="color-dot" data-action="color" aria-label="Change color"></button>
            <button class="card-title" data-action="toggle" title="${ind.label}">${ind.key.toUpperCase()}<small class="summary">${paramSummary(ind)}</small></button>
            <button class="icon-btn chevron" data-action="toggle" aria-label="Toggle settings">${ICON_CHEVRON}</button>
            <button class="icon-btn delete" data-action="remove" aria-label="Delete">${ICON_CLOSE}</button>
        </div>
        <div class="collapse color-panel"><div><div class="swatches">${swatches}</div></div></div>
        <div class="collapse params-panel"><div><div class="params">${params}</div></div></div>`;
    return card;
}

function createSubPlot(ind) {
    const box = document.createElement('div');
    box.className = 'plot-box sub-plot';
    box.dataset.id = ind.id;
    box.style.setProperty('--ind-color', ind.color);
    box.innerHTML = `<span class="plot-label">${ind.key.toUpperCase()} - ${ind.label}</span>`;
    return box;
}

// ---- Card events (event delegation) ----
function findIndicator(el) {
    const card = el.closest('.indicator-card');
    return card && { card, ind: state.indicators.find((i) => i.id === card.dataset.id) };
}

cardsList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    const found = btn && findIndicator(btn);
    if (!found || !found.ind) return;
    const { card, ind } = found;

    switch (btn.dataset.action) {
        case 'toggle':  card.classList.toggle('open'); break;
        case 'color':   card.classList.toggle('picking'); break;
        case 'remove':  removeIndicator(ind.id); break;
        case 'visible': setVisible(ind, !ind.visible); break;
        case 'pick':    setColor(ind, btn.dataset.color); card.classList.remove('picking'); break;
        case 'step': {
            const input = btn.parentElement.querySelector('.param-input');
            const step = Number(input.step) || 1;
            input.value = (Number(input.value) || 0) + Number(btn.dataset.dir) * step;
            setParam(ind, input.dataset.param, input, true);
            break;
        }
    }
});

['input', 'change'].forEach((evt) => {
    cardsList.addEventListener(evt, (e) => {
        const input = e.target.closest('[data-param]');
        const found = input && findIndicator(input);
        if (found && found.ind) setParam(found.ind, input.dataset.param, input, evt === 'change');
    });
});

// ---- Stock selector ----
const stockSelect = $('stockSelect');
const stockMenu = $('stockMenu');

function renderStocks() {
    const stock = state.stock;
    stockSelect.querySelector('.stock-btn .name').textContent = stock ? stock.name : 'No file';
    $('emptyState').hidden = stocks.length > 0;

    if (!stocks.length) {
        const none = document.createElement('button');
        none.className = 'stock-option';
        none.disabled = true;
        none.textContent = 'No files uploaded';
        stockMenu.replaceChildren(none);
        return;
    }
    stockMenu.replaceChildren(...stocks.map((s, index) => {
        const opt = document.createElement('button');
        opt.className = 'stock-option';
        opt.dataset.index = index;
        opt.setAttribute('role', 'option');
        opt.setAttribute('aria-selected', stock !== null && s.name === stock.name);
        opt.textContent = s.name;
        return opt;
    }));
}

function selectStock(stock) {
    state.stock = stock;
    renderStocks();
    if (stock) scheduleRefresh(0);
    else clearCharts();
}

// Re-reads the list so files copied into the data folder show up without a restart
async function syncStocks() {
    const currentName = state.stock ? state.stock.name : null;
    stocks = await request('/api/stocks');
    const next = stocks.find((s) => s.name === currentName) || stocks[0] || null;
    if ((next ? next.name : null) !== currentName) {
        selectStock(next);
    } else {
        state.stock = next;
        renderStocks();
    }
}

$('stockBtn').addEventListener('click', async () => {
    stockSelect.classList.toggle('open');
    if (!stockSelect.classList.contains('open')) return;
    try { await syncStocks(); } catch (err) { showError(errorText(err)); }
});
stockMenu.addEventListener('click', (e) => {
    const opt = e.target.closest('.stock-option');
    if (!opt || opt.disabled) return;
    stockSelect.classList.remove('open');
    selectStock(stocks[opt.dataset.index]);
});
document.addEventListener('click', (e) => {
    if (!e.target.closest('#stockSelect')) stockSelect.classList.remove('open');
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stockSelect.classList.remove('open');
});

// ---- Upload: the CSV is sent to the server, which saves it into the data folder ----
const fileInput = $('fileInput');
$('uploadBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // allow selecting the same file again
    if (!file) return;
    try {
        const stock = await request(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv' },
            body: file
        });
        showError('');
        stocks.push(stock);
        selectStock(stock);
    } catch (err) {
        showError(errorText(err));
    }
});

// ---- Startup ----
async function init() {
    renderStocks();
    updateEmptyHint();
    try {
        const [defs, list] = await Promise.all([request('/api/indicators'), request('/api/stocks')]);
        defs.forEach((d) => { definitions[d.key] = d; });
        stocks = list;
        buildDropdown();
        selectStock(stocks[0] || null);  // starts with the first file in the data folder, if any
    } catch (err) {
        showError(errorText(err));
    }
}

init();
