/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   editor-toolbar.js
   Shared rich-text floating toolbar for admin editing.
   Works in both index.html (data-editable) and tool-detail.html (contenteditable blocks).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function () {
    'use strict';

    /* ── 1. PRESETS ── */
    const FONTS = [
        { label: '系統預設', value: 'inherit' },
        { label: 'Noto Sans TC', value: "'Noto Sans TC', sans-serif" },
        { label: 'Noto Serif TC', value: "'Noto Serif TC', serif" },
        { label: 'Inter', value: "'Inter', sans-serif" },
        { label: 'Montserrat', value: "'Montserrat', sans-serif" },
        { label: '獅尾四季春', value: "'Iansui', cursive" },
    ];

    const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 72];

    const COLORS = [
        '#1E1B4B', '#312E81', '#4F46E5', '#6366F1', '#8B5CF6',
        '#EC4899', '#EF4444', '#F97316', '#EAB308', '#22C55E',
        '#06B6D4', '#FFFFFF', '#F1F5F9', '#64748B', '#000000',
    ];

    const GRADIENTS = [
        { label: '品牌紅橘漸層', value: 'linear-gradient(135deg,#EF4444,#F97316)' },
        { label: '紫藍漸層', value: 'linear-gradient(135deg,#6366F1,#06B6D4)' },
        { label: '玫瑰紫漸層', value: 'linear-gradient(135deg,#EC4899,#8B5CF6)' },
        { label: '綠青漸層', value: 'linear-gradient(135deg,#22C55E,#06B6D4)' },
        { label: '金橘漸層', value: 'linear-gradient(135deg,#EAB308,#F97316)' },
        { label: '夜藍漸層', value: 'linear-gradient(135deg,#1E1B4B,#4F46E5)' },
        { label: '移除漸層', value: '__remove__' },
    ];

    /* ── 2. INJECT CSS ── */
    const style = document.createElement('style');
    style.textContent = `
    #sh-editor-toolbar {
      position: fixed;
      z-index: 99999;
      display: none;
      align-items: center;
      gap: 2px;
      background: #18181B;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px;
      padding: 5px 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,.45);
      flex-wrap: wrap;
      max-width: 560px;
      user-select: none;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #sh-editor-toolbar.visible { display: flex; }

    .sh-tb-sep { width: 1px; height: 20px; background: rgba(255,255,255,.15); margin: 0 3px; flex-shrink:0; }

    .sh-tb-btn {
      background: none; border: none; color: #E2E8F0;
      font-size: 13px; font-weight: 600; padding: 4px 7px;
      border-radius: 6px; cursor: pointer; line-height: 1;
      transition: background .15s;
      white-space: nowrap;
    }
    .sh-tb-btn:hover { background: rgba(255,255,255,.12); }
    .sh-tb-btn.active { background: rgba(99,102,241,.5); color: #fff; }

    .sh-tb-select {
      background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.15);
      color: #E2E8F0; font-size: 11px; border-radius: 6px;
      padding: 3px 5px; cursor: pointer; outline: none;
      max-width: 120px;
    }
    .sh-tb-select option { background: #1E1E2E; color: #E2E8F0; }

    .sh-tb-size {
      background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.15);
      color: #E2E8F0; font-size: 12px; border-radius: 6px;
      width: 46px; padding: 3px 5px; text-align: center; outline: none;
    }

    .sh-color-swatch { width:16px; height:16px; border-radius:3px; display:inline-block; cursor:pointer; border:1.5px solid transparent; flex-shrink:0; }
    .sh-color-swatch:hover { border-color: rgba(255,255,255,.5); transform: scale(1.2); }

    .sh-color-popup {
      position: fixed; z-index: 100000;
      background: #18181B; border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px; padding: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      display: none; flex-wrap: wrap; gap: 5px; width: 180px;
    }
    .sh-color-popup.open { display: flex; }

    .sh-gradient-popup {
      position: fixed; z-index: 100000;
      background: #18181B; border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px; padding: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      display: none; flex-direction: column; gap: 5px; width: 180px;
    }
    .sh-gradient-popup.open { display: flex; }
    .sh-gradient-item {
      height: 26px; border-radius: 6px; cursor: pointer;
      border: 1.5px solid transparent; font-size: 10px;
      color: white; display: flex; align-items: center; padding: 0 8px;
      font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.4);
    }
    .sh-gradient-item:hover { border-color: rgba(255,255,255,.4); }
    .sh-gradient-item.remove-item { background: rgba(255,255,255,.08); color: #94A3B8; }
  `;
    document.head.appendChild(style);

    /* ── 3. BUILD TOOLBAR DOM ── */
    const tb = document.createElement('div');
    tb.id = 'sh-editor-toolbar';
    tb.setAttribute('aria-label', '文字格式工具列');

    // Font family
    const fontSel = document.createElement('select');
    fontSel.className = 'sh-tb-select';
    fontSel.title = '字型';
    FONTS.forEach(f => {
        const o = document.createElement('option');
        o.value = f.value; o.textContent = f.label;
        fontSel.appendChild(o);
    });

    // Font size input
    const sizeInput = document.createElement('input');
    sizeInput.className = 'sh-tb-size';
    sizeInput.type = 'number'; sizeInput.min = '8'; sizeInput.max = '144';
    sizeInput.placeholder = 'px'; sizeInput.title = '字型大小 (px)';

    const sep = () => { const d = document.createElement('div'); d.className = 'sh-tb-sep'; return d; };
    const btn = (label, title, onclick) => {
        const b = document.createElement('button');
        b.className = 'sh-tb-btn'; b.textContent = label; b.title = title;
        b.type = 'button';
        b.addEventListener('mousedown', e => { e.preventDefault(); onclick(b); });
        return b;
    };

    // Color picker button + popup
    const colorBtn = btn('A', '文字顏色', () => togglePopup(colorPopup, colorBtn));
    colorBtn.style.cssText += '; position:relative; text-decoration: underline 2px #EF4444;';
    const colorPopup = document.createElement('div');
    colorPopup.className = 'sh-color-popup';
    COLORS.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'sh-color-swatch'; sw.style.background = c;
        sw.title = c;
        sw.addEventListener('mousedown', e => { e.preventDefault(); applyColor(c); closeAllPopups(); });
        colorPopup.appendChild(sw);
    });
    // custom color input
    const customColor = document.createElement('input');
    customColor.type = 'color'; customColor.title = '自訂顏色';
    customColor.style.cssText = 'width:40px;height:22px;border:none;background:none;cursor:pointer;border-radius:4px;';
    customColor.addEventListener('change', () => { applyColor(customColor.value); });
    colorPopup.appendChild(customColor);
    document.body.appendChild(colorPopup);

    // Gradient button + popup
    const gradBtn = btn('✦', '文字漸層', () => togglePopup(gradPopup, gradBtn));
    gradBtn.style.cssText += '; background:linear-gradient(135deg,#EF4444,#F97316); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;';
    const gradPopup = document.createElement('div');
    gradPopup.className = 'sh-gradient-popup';
    GRADIENTS.forEach(g => {
        const item = document.createElement('div');
        item.className = 'sh-gradient-item' + (g.value === '__remove__' ? ' remove-item' : '');
        item.style.background = g.value === '__remove__' ? '' : g.value;
        item.textContent = g.label;
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            applyGradient(g.value === '__remove__' ? null : g.value);
            closeAllPopups();
        });
        gradPopup.appendChild(item);
    });
    document.body.appendChild(gradPopup);

    // Assemble toolbar
    tb.append(
        fontSel, sep(),
        sizeInput, sep(),
        btn('B', '粗體 (Ctrl+B)', () => document.execCommand('bold')),
        btn('I', '斜體 (Ctrl+I)', () => document.execCommand('italic')),
        btn('U', '底線 (Ctrl+U)', () => document.execCommand('underline')),
        btn('S', '刪除線', () => document.execCommand('strikeThrough')),
        sep(),
        colorBtn,
        gradBtn,
        sep(),
        btn('≡⬅', '靠左', () => applyAlign('left')),
        btn('≡⬜', '置中', () => applyAlign('center')),
        btn('≡➡', '靠右', () => applyAlign('right')),
        sep(),
        btn('🔗', '插入連結', () => execLinkPrompt()),
    );
    document.body.appendChild(tb);

    /* ── 4. STATE ── */
    let savedRange = null;
    let activeEditable = null;

    /* ── 5. HELPERS ── */
    function saveSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
    }

    function restoreSelection() {
        if (!savedRange) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
    }

    function wrapSelectionWithSpan(styles) {
        restoreSelection();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;
        try {
            const span = document.createElement('span');
            Object.assign(span.style, styles);
            range.surroundContents(span);
            sel.removeAllRanges();
        } catch (_) {
            // If surroundContents fails (multi-element selection), use execCommand fallback
            document.execCommand('foreColor', false, styles.color || 'inherit');
        }
    }

    function applyColor(c) {
        restoreSelection();
        wrapSelectionWithSpan({ color: c });
        // Update color indicator
        colorBtn.style.textDecorationColor = c;
    }

    function applyGradient(gradient) {
        if (!gradient) {
            // Remove gradient: just set to inherit color
            restoreSelection();
            wrapSelectionWithSpan({
                background: 'none',
                webkitBackgroundClip: 'unset',
                webkitTextFillColor: 'unset',
                backgroundClip: 'unset',
            });
            return;
        }
        restoreSelection();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;
        try {
            const span = document.createElement('span');
            span.style.background = gradient;
            span.style.webkitBackgroundClip = 'text';
            span.style.backgroundClip = 'text';
            span.style.webkitTextFillColor = 'transparent';
            span.style.color = 'transparent';
            range.surroundContents(span);
            sel.removeAllRanges();
        } catch (_) { }
    }

    function applyAlign(dir) {
        const el = activeEditable;
        if (el) el.style.textAlign = dir;
    }

    function execLinkPrompt() {
        restoreSelection();
        const url = prompt('輸入連結 URL：', 'https://');
        if (url) document.execCommand('createLink', false, url);
    }

    function togglePopup(popup, anchor) {
        saveSelection();
        closeAllPopups();
        const rect = anchor.getBoundingClientRect();
        popup.style.top = (rect.bottom + 6) + 'px';
        popup.style.left = rect.left + 'px';
        popup.classList.toggle('open');
    }

    function closeAllPopups() {
        colorPopup.classList.remove('open');
        gradPopup.classList.remove('open');
    }

    /* ── 6. SHOW / HIDE TOOLBAR ── */
    function positionToolbar() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            /* Keep toolbar visible if activeEditable is focused (for align/font on whole element) */
            return;
        }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || rect.width === 0) return;

        const tbRect = tb.getBoundingClientRect();
        let top = rect.top + window.scrollY - tbRect.height - 10;
        let left = rect.left + window.scrollX;
        if (top < 8) top = rect.bottom + window.scrollY + 8;
        const maxLeft = window.innerWidth - tbRect.width - 10;
        if (left > maxLeft) left = maxLeft;
        if (left < 8) left = 8;

        tb.style.top = top + 'px';
        tb.style.left = left + 'px';
        tb.style.position = 'fixed';
        // recalculate with viewport coords
        tb.style.top = (rect.top - tbRect.height - 10) + 'px';
        tb.style.left = Math.min(Math.max(rect.left, 8), window.innerWidth - tbRect.width - 8) + 'px';
        tb.classList.add('visible');
    }

    function hideToolbar() {
        tb.classList.remove('visible');
        activeEditable = null;
        closeAllPopups();
    }

    /* ── 7. DETECT ACTIVE EDITABLE ── */
    function getEditableAncestor(node) {
        while (node && node !== document.body) {
            if (node.contentEditable === 'true') return node;
            if (node.dataset && node.dataset.editable !== undefined) return node;
            node = node.parentNode;
        }
        return null;
    }

    document.addEventListener('mouseup', () => {
        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) return;
            const anchor = getEditableAncestor(sel.anchorNode);
            if (!anchor) return;
            activeEditable = anchor;
            saveSelection();
            positionToolbar();
        }, 10);
    });

    document.addEventListener('keyup', () => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            const anchor = getEditableAncestor(sel.anchorNode);
            if (anchor) { activeEditable = anchor; saveSelection(); positionToolbar(); }
        } else {
            if (tb.classList.contains('visible')) hideToolbar();
        }
    });

    // Clicks inside toolbar don't collapse selection / close toolbar
    tb.addEventListener('mousedown', e => { e.stopPropagation(); });

    // Clicking outside editable area hides toolbar
    document.addEventListener('mousedown', e => {
        if (tb.contains(e.target)) return;
        if (colorPopup.contains(e.target)) return;
        if (gradPopup.contains(e.target)) return;
        if (getEditableAncestor(e.target)) {
            activeEditable = getEditableAncestor(e.target);
            return;
        }
        hideToolbar();
    });

    /* ── 8. FONT FAMILY APPLY ── */
    fontSel.addEventListener('change', () => {
        saveSelection();
        restoreSelection();
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            wrapSelectionWithSpan({ fontFamily: fontSel.value });
        } else if (activeEditable) {
            activeEditable.style.fontFamily = fontSel.value;
        }
    });

    /* ── 9. FONT SIZE APPLY ── */
    sizeInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const px = parseInt(sizeInput.value);
        if (!px || px < 8) return;
        restoreSelection();
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            wrapSelectionWithSpan({ fontSize: px + 'px' });
        } else if (activeEditable) {
            activeEditable.style.fontSize = px + 'px';
        }
    });

    sizeInput.addEventListener('mousedown', e => e.stopPropagation());
    fontSel.addEventListener('mousedown', e => e.stopPropagation());

    /* ── 10. EXPOSE GLOBALLY ── */
    window.EditorToolbar = {
        show: positionToolbar,
        hide: hideToolbar,
        applyColor,
        applyGradient,
    };

})();
