// Small canvas chart class: line/candle price chart, extra series, guide lines and a cursor.
const UP_COLOR = '#34d399';
const DOWN_COLOR = '#f87171';
const PRICE_COLOR = '#cbd5e1';
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
const TEXT_COLOR = '#8a8a9a';
const FONT = '11px system-ui, sans-serif';

const formatValue = (v) => (v == null ? '-' : Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));

class CanvasChart {
    // data: { dates, type: 'line' | 'candle', open, high, low, close, series: [{ name, color, dash, values }], guides: [] }
    constructor(box, { onHover } = {}) {
        this.box = box;
        this.onHover = onHover;
        this.data = null;
        this.cursor = null;
        this.pad = { top: 48, right: 56, bottom: 24, left: 10 };

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'chart-canvas';
        box.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.observer = new ResizeObserver(() => this.draw());
        this.observer.observe(box);
        this.canvas.addEventListener('mousemove', (e) => this.handleMove(e));
        this.canvas.addEventListener('mouseleave', () => this.onHover && this.onHover(null));
    }

    setData(data) {
        this.data = data;
        this.cursor = null;
        this.draw();
    }

    setCursor(index) {
        if (this.cursor === index) return;
        this.cursor = index;
        this.draw();
    }

    destroy() {
        this.observer.disconnect();
        this.canvas.remove();
    }

    handleMove(e) {
        if (!this.data || !this.data.dates.length) return;
        const rect = this.canvas.getBoundingClientRect();
        const n = this.data.dates.length;
        const plotW = rect.width - this.pad.left - this.pad.right;
        const index = Math.floor((e.clientX - rect.left - this.pad.left) / (plotW / n));
        const clamped = Math.max(0, Math.min(n - 1, index));
        if (this.onHover) this.onHover(clamped);
        else this.setCursor(clamped);
    }

    draw() {
        const { canvas, ctx, box, pad } = this;
        const w = box.clientWidth;
        const h = box.clientHeight;
        if (!w || !h) return;

        // Scale by screen density for a sharp image (resizing the canvas also clears it)
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!this.data || !this.data.dates.length) return;

        const { dates, type, open, high, low, close, series = [], guides = [] } = this.data;
        const n = dates.length;
        const plotW = w - pad.left - pad.right;
        const plotH = h - pad.top - pad.bottom;
        const step = plotW / n;
        const xAt = (i) => pad.left + step * (i + 0.5);

        // Y axis range: computed from every visible value
        let min = Infinity;
        let max = -Infinity;
        const take = (v) => {
            if (v != null && Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
        };
        if (type === 'candle') { high.forEach(take); low.forEach(take); }
        else if (close) close.forEach(take);
        series.forEach((s) => s.values.forEach(take));
        guides.forEach(take);
        if (min === Infinity) return;
        if (min === max) { min -= 1; max += 1; }
        const margin = (max - min) * 0.05;
        min -= margin;
        max += margin;
        const yAt = (v) => pad.top + ((max - v) / (max - min)) * plotH;

        // Grid and axis labels
        ctx.font = FONT;
        ctx.fillStyle = TEXT_COLOR;
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        for (let k = 0; k <= 4; k++) {
            const v = min + ((max - min) * k) / 4;
            const y = Math.round(yAt(v)) + 0.5;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
            ctx.fillText(formatValue(v), w - pad.right + 6, y);
        }
        ctx.textBaseline = 'alphabetic';
        const labelCount = Math.min(n, 6);
        for (let k = 0; k < labelCount; k++) {
            const i = labelCount === 1 ? 0 : Math.round(((n - 1) * k) / (labelCount - 1));
            ctx.textAlign = k === 0 ? 'left' : k === labelCount - 1 ? 'right' : 'center';
            const x = k === 0 ? pad.left : k === labelCount - 1 ? w - pad.right : xAt(i);
            ctx.fillText(dates[i], x, h - 8);
        }

        // Drawing is clipped to the plot area
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.left, pad.top, plotW, plotH);
        ctx.clip();

        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#5a5a6a';
        guides.forEach((g) => {
            const y = Math.round(yAt(g)) + 0.5;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        });
        ctx.setLineDash([]);

        if (type === 'candle') this.drawCandles(xAt, yAt, step);
        else if (close) this.drawLine(close, PRICE_COLOR, [], xAt, yAt);
        series.forEach((s) => this.drawLine(s.values, s.color, s.dash || [], xAt, yAt));

        if (this.cursor != null) {
            const x = Math.round(xAt(this.cursor)) + 0.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
        }
        ctx.restore();

        this.drawLegend(w);
    }

    drawLine(values, color, dash, xAt, yAt) {
        const { ctx } = this;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let started = false;
        values.forEach((v, i) => {
            if (v == null) { started = false; return; }  // the line breaks at empty values
            if (started) ctx.lineTo(xAt(i), yAt(v));
            else ctx.moveTo(xAt(i), yAt(v));
            started = true;
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawCandles(xAt, yAt, step) {
        const { ctx } = this;
        const { open, high, low, close } = this.data;
        const bodyW = Math.max(1, step * 0.7);
        ctx.lineWidth = 1;
        close.forEach((c, i) => {
            if (c == null || open[i] == null) return;
            const color = c >= open[i] ? UP_COLOR : DOWN_COLOR;
            const x = xAt(i);
            const top = yAt(Math.max(open[i], c));
            const bottom = yAt(Math.min(open[i], c));
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.moveTo(x, yAt(high[i])); ctx.lineTo(x, yAt(low[i])); ctx.stroke();
            ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, bottom - top));
        });
    }

    // Legend line on top: shows the values under the cursor (or the last ones)
    drawLegend(w) {
        const { ctx, pad } = this;
        const { dates, type, open, high, low, close, series = [] } = this.data;
        const i = this.cursor != null ? this.cursor : dates.length - 1;
        const items = [];
        if (type === 'candle') {
            items.push({ color: PRICE_COLOR, text: `O ${formatValue(open[i])}  H ${formatValue(high[i])}  L ${formatValue(low[i])}  C ${formatValue(close[i])}` });
        } else if (close) {
            items.push({ color: PRICE_COLOR, text: `Close ${formatValue(close[i])}` });
        }
        series.forEach((s) => items.push({ color: s.color, text: `${s.name} ${formatValue(s.values[i])}` }));

        ctx.font = FONT;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        let x = pad.left + 4;
        for (const item of items) {
            const width = ctx.measureText(item.text).width + 22;
            if (x + width > w - 10) break;
            ctx.fillStyle = item.color;
            ctx.beginPath(); ctx.arc(x + 4, 37, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = TEXT_COLOR;
            ctx.fillText(item.text, x + 12, 41);
            x += width + 6;
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(dates[i], w - 12, 22);
    }
}
