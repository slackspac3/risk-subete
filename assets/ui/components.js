/**
 * components.js — Reusable UI components
 */

const UI = (() => {
  // ─── Toast ────────────────────────────────────────────────
  function toast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✓', danger: '✕', warning: '⚠', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${message}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 320); }, duration);
  }

  // ─── Modal ────────────────────────────────────────────────
  function modal({ title, body, footer = '', onClose }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const closeBtn = `<button class="modal-close" aria-label="Close">✕</button>`;
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">${title}</h3>
          ${closeBtn}
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(backdrop);

    let closed = false;
    const esc = e => {
      if (e.key === 'Escape') close();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', esc);
      backdrop.remove();
      if (onClose) onClose();
    };
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', esc);
    return { close };
  }

  // ─── Citation Modal ───────────────────────────────────────
  function citationModal(doc) {
    modal({
      title: `Source: ${doc.title}`,
      body: `
        <div style="margin-bottom:12px">
          <span class="badge badge--neutral">${doc.lastUpdated || 'Unknown date'}</span>
          ${(doc.tags || []).map(t => `<span class="badge badge--primary" style="margin-left:4px">${t}</span>`).join('')}
        </div>
        <p style="line-height:1.8; font-size:0.9rem; color: var(--text-secondary)">${doc.excerpt || doc.contentExcerpt || 'No excerpt available.'}</p>
        ${doc.url && doc.url !== '#/admin/docs' ? `<div style="margin-top:16px"><a href="${doc.url}" target="_blank" class="btn btn--secondary btn--sm">Open document</a></div>` : ''}
      `
    });
  }

  // ─── Stepper ──────────────────────────────────────────────
  function renderStepper(currentStep) {
    const steps = [
      { n: 1, label: 'Risk Builder' },
      { n: 2, label: 'Scenario' },
      { n: 3, label: 'FAIR Inputs' },
      { n: 4, label: 'Review & Run' }
    ];
    return `<nav class="stepper" aria-label="Assessment steps">
      ${steps.map((s, i) => {
        const state = s.n < currentStep ? 'complete' : s.n === currentStep ? 'active' : '';
        const connState = s.n < currentStep ? 'complete' : s.n === currentStep ? 'active' : '';
        return `
          ${i > 0 ? `<div class="step-connector ${connState}"></div>` : ''}
          <div class="step-item">
            <div class="step-dot-wrap">
              <div class="step-dot ${state}" aria-current="${s.n === currentStep ? 'step' : 'false'}">
                ${s.n < currentStep ? '✓' : s.n}
              </div>
              <span class="step-label ${state}">${s.label}</span>
            </div>
          </div>`;
      }).join('')}
    </nav>`;
  }

  // ─── Skeleton ─────────────────────────────────────────────
  function skeletonBlock(height = 40, borderRadius = 8) {
    return `<div class="skeleton" style="height:${height}px;border-radius:${borderRadius}px"></div>`;
  }
  function skeletonCard() {
    return `<div class="card">
      ${skeletonBlock(20, 6)}
      <div style="margin-top:12px">${skeletonBlock(14, 4)}</div>
      <div style="margin-top:8px">${skeletonBlock(14, 4)}</div>
      <div style="margin-top:8px; width:60%">${skeletonBlock(14, 4)}</div>
    </div>`;
  }

  // ─── Tag Input ────────────────────────────────────────────
  function tagInput(containerId, initialTags = [], onChange = null) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    let tags = [...initialTags];
    const notify = () => {
      if (typeof onChange === 'function') onChange([...tags]);
    };

    function render() {
      wrap.innerHTML = `
        ${tags.map((t, i) => `<span class="tag-item">${t}<button type="button" data-idx="${i}" aria-label="Remove ${t}">×</button></span>`).join('')}
        <input class="tag-input" type="text" placeholder="Add tag…" />`;
      wrap.querySelectorAll('.tag-item button').forEach(btn => {
        btn.addEventListener('click', () => {
          tags.splice(parseInt(btn.dataset.idx), 1);
          render();
          notify();
        });
      });
      const input = wrap.querySelector('.tag-input');
      input.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
          e.preventDefault();
          const val = input.value.trim().replace(/,$/, '');
          if (val && !tags.includes(val)) tags.push(val);
          render();
          notify();
        }
        if (e.key === 'Backspace' && !input.value && tags.length) {
          tags.pop();
          render();
          notify();
        }
      });
    }

    render();
    return {
      getTags: () => [...tags],
      setTags: (newTags) => { tags = [...newTags]; render(); notify(); }
    };
  }

  // ─── Confirm Dialog ───────────────────────────────────────
  function confirm(message) {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const m = modal({
        title: 'Confirm',
        body: `<p>${message}</p>`,
        footer: `<button class="btn btn--ghost" id="confirm-cancel">Cancel</button>
                 <button class="btn btn--danger" id="confirm-ok">Confirm</button>`,
        onClose: () => finish(false)
      });
      document.getElementById('confirm-ok').addEventListener('click', () => { finish(true); m.close(); });
      document.getElementById('confirm-cancel').addEventListener('click', () => { finish(false); m.close(); });
    });
  }


  function _getCurrencyPrefix(currency) {
    return currency === 'AED' ? 'AED ' : '$';
  }

  // ─── Chart: Histogram ────────────────────────────────────
  function drawHistogram(canvas, bins, threshold, currency = 'USD', fxRate = 3.6725) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.width  = canvas.offsetWidth * (window.devicePixelRatio || 1);
    const H   = canvas.height = 240 * (window.devicePixelRatio || 1);
    canvas.style.height = '240px';
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    const w = canvas.offsetWidth;
    const h = 240;

    const pad = { top: 20, right: 20, bottom: 50, left: 70 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top  - pad.bottom;

    const converted = bins.map(b => ({
      x: currency === 'AED' ? b.x * fxRate : b.x,
      count: b.count
    }));
    const thr = currency === 'AED' ? threshold * fxRate : threshold;

    const maxCount = Math.max(...converted.map(b => b.count));
    const minX = converted[0].x;
    const maxX = converted[converted.length - 1].x;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + plotH - (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    }

    // Bars
    const barW = plotW / converted.length * 0.85;
    const gap  = plotW / converted.length;
    converted.forEach((b, i) => {
      const bh = (b.count / maxCount) * plotH;
      const bx = pad.left + i * gap + (gap - barW) / 2;
      const by = pad.top + plotH - bh;
      const overThresh = b.x > thr;
      ctx.fillStyle = overThresh ? 'rgba(239,68,68,0.65)' : 'rgba(26,86,219,0.65)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, barW, bh, [2, 2, 0, 0]) : ctx.rect(bx, by, barW, bh);
      ctx.fill();
    });

    // Threshold line
    const thrX = pad.left + ((thr - minX) / (maxX - minX)) * plotW;
    if (thrX > pad.left && thrX < pad.left + plotW) {
      ctx.strokeStyle = 'rgba(245,158,11,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(thrX, pad.top); ctx.lineTo(thrX, pad.top + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,158,11,0.9)';
      ctx.font = '10px DM Sans, sans-serif';
      ctx.fillText('Threshold', thrX + 4, pad.top + 14);
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // X labels (every 5th bin)
    ctx.fillStyle = 'rgba(156,163,175,0.9)';
    ctx.font = '10px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    converted.forEach((b, i) => {
      if (i % Math.ceil(converted.length / 6) === 0) {
        const bx = pad.left + i * gap + gap / 2;
        const label = _fmtShort(b.x, currency);
        ctx.fillText(label, bx, pad.top + plotH + 16);
      }
    });

    // Y label
    ctx.save();
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Frequency', 0, 0);
    ctx.restore();
  }

  // ─── Chart: LEC ──────────────────────────────────────────
  function drawLEC(canvas, lecPoints, threshold, currency = 'USD', fxRate = 3.6725) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.width  = canvas.offsetWidth * (window.devicePixelRatio || 1);
    const H   = canvas.height = 240 * (window.devicePixelRatio || 1);
    canvas.style.height = '240px';
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    const w = canvas.offsetWidth;
    const h = 240;

    const pad = { top: 20, right: 20, bottom: 50, left: 70 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top  - pad.bottom;

    const converted = lecPoints.map(pt => ({
      x: currency === 'AED' ? pt.x * fxRate : pt.x,
      p: pt.p
    }));
    const thr = currency === 'AED' ? threshold * fxRate : threshold;

    const minX = converted[0].x;
    const maxX = converted[converted.length - 1].x;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
      const pLabel = ((1 - i / 4) * 100).toFixed(0) + '%';
      ctx.fillStyle = 'rgba(156,163,175,0.9)';
      ctx.font = '10px DM Sans, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(pLabel, pad.left - 6, y + 4);
    }

    const toCanvasX = x => pad.left + ((x - minX) / (maxX - minX)) * plotW;
    const toCanvasY = p => pad.top + plotH - p * plotH;

    // Fill under curve
    ctx.beginPath();
    ctx.moveTo(toCanvasX(converted[0].x), toCanvasY(0));
    converted.forEach(pt => ctx.lineTo(toCanvasX(pt.x), toCanvasY(pt.p)));
    ctx.lineTo(toCanvasX(converted[converted.length - 1].x), toCanvasY(0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, 'rgba(26,86,219,0.25)');
    grad.addColorStop(1, 'rgba(26,86,219,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.strokeStyle = 'rgba(59,130,246,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    converted.forEach((pt, i) => {
      const cx = toCanvasX(pt.x);
      const cy = toCanvasY(pt.p);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    // Threshold vertical line
    const thrX = toCanvasX(thr);
    if (thrX > pad.left && thrX < pad.left + plotW) {
      ctx.strokeStyle = 'rgba(245,158,11,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(thrX, pad.top); ctx.lineTo(thrX, pad.top + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,158,11,0.9)';
      ctx.font = '10px DM Sans, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${_fmtShort(thr, currency)} threshold`, thrX + 4, pad.top + 14);
    }

    // X axis labels
    ctx.fillStyle = 'rgba(156,163,175,0.9)'; ctx.font = '10px DM Sans, sans-serif'; ctx.textAlign = 'center';
    converted.forEach((pt, i) => {
      if (i % Math.ceil(converted.length / 6) === 0) {
        ctx.fillText(_fmtShort(pt.x, currency), toCanvasX(pt.x), pad.top + plotH + 16);
      }
    });

    // Axis
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Y axis label
    ctx.save();
    ctx.fillStyle = 'rgba(156,163,175,0.9)';
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '10px DM Sans, sans-serif';
    ctx.fillText('Exceedance Probability', 0, 0);
    ctx.restore();

    // X axis label
    ctx.textAlign = 'center';
    ctx.fillText(`Annual Loss (${currency})`, pad.left + plotW / 2, h - 8);
  }

  function _fmtShort(v, currency) {
    const displayValue = Math.round(Number(v || 0));
    return `${_getCurrencyPrefix(currency)}${displayValue.toLocaleString(currency === 'AED' ? 'en-AE' : 'en-US')}`;
  }

  return { toast, modal, citationModal, renderStepper, skeletonBlock, skeletonCard, tagInput, confirm, drawHistogram, drawLEC };
})();
