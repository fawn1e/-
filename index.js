// ===== Avatar Gallery Extension for SillyTavern =====
// Adds a multi-avatar gallery to characters and personas

import { extension_settings, saveSettingsDebounced } from "../../../extensions.js";
import { eventSource, event_types, this_chid, characters } from "../../../../script.js";

const EXT = "avatar-gallery";

// Init settings storage
if (!extension_settings[EXT]) extension_settings[EXT] = {};
const store = extension_settings[EXT]; // { [charKey]: { avatars: [{src,label}], activeIdx: 0 } }

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────
function currentCharKey() {
    try {
        const ctx = SillyTavern?.getContext?.();
        if (ctx?.name2) return `char::${ctx.name2}`;
        if (typeof this_chid !== "undefined" && this_chid >= 0 && characters?.[this_chid]) {
            return `char::${characters[this_chid].name}`;
        }
    } catch {}
    return null;
}

function currentCharName() {
    try {
        const ctx = SillyTavern?.getContext?.();
        if (ctx?.name2) return ctx.name2;
        if (typeof this_chid !== "undefined" && this_chid >= 0 && characters?.[this_chid]) {
            return characters[this_chid].name;
        }
    } catch {}
    return "Unknown";
}

function getGallery(key) {
    if (!key) return null;
    if (!store[key]) store[key] = { avatars: [], activeIdx: -1 };
    return store[key];
}

function save() { saveSettingsDebounced(); }

// ──────────────────────────────────────────────
//  Build modal HTML (once)
// ──────────────────────────────────────────────
function buildModal() {
    if (document.getElementById("ag-modal")) return;

    const html = `
<div id="ag-modal">
  <div class="ag-panel">

    <div class="ag-header">
      <div>
        <span class="ag-title">🖼 Gallery</span>
        <span class="ag-char-name" id="ag-char-name"></span>
      </div>
      <button class="ag-close" id="ag-close" title="Close">✕</button>
    </div>

    <div class="ag-preview-wrap">
      <button class="ag-arrow" id="ag-prev" title="Previous">‹</button>
      <div class="ag-main-img-box" id="ag-main-box">
        <img id="ag-main-img" src="" alt="avatar" />
        <div class="ag-active-glow"></div>
      </div>
      <button class="ag-arrow" id="ag-next" title="Next">›</button>
    </div>

    <div class="ag-meta">
      <span class="ag-counter" id="ag-counter">0 / 0</span>
      <button class="ag-set-btn" id="ag-set-btn">✓ Выбрать</button>
    </div>

    <div class="ag-thumbs" id="ag-thumbs"></div>

    <div class="ag-footer">
      <button class="ag-upload-btn" id="ag-upload-btn">
        <span>＋</span> Загрузить аватарку
      </button>
      <input type="file" id="ag-file-input" accept="image/*" multiple style="display:none" />
    </div>

  </div>
</div>`;

    document.body.insertAdjacentHTML("beforeend", html);

    // Wire events
    document.getElementById("ag-close").addEventListener("click", closeModal);
    document.getElementById("ag-modal").addEventListener("click", e => {
        if (e.target === document.getElementById("ag-modal")) closeModal();
    });
    document.getElementById("ag-prev").addEventListener("click", () => navigate(-1));
    document.getElementById("ag-next").addEventListener("click", () => navigate(1));
    document.getElementById("ag-set-btn").addEventListener("click", applySelected);
    document.getElementById("ag-upload-btn").addEventListener("click", () =>
        document.getElementById("ag-file-input").click()
    );
    document.getElementById("ag-file-input").addEventListener("change", onFilesChosen);

    // Keyboard
    document.addEventListener("keydown", e => {
        if (!document.getElementById("ag-modal").classList.contains("ag-open")) return;
        if (e.key === "ArrowLeft")  navigate(-1);
        if (e.key === "ArrowRight") navigate(1);
        if (e.key === "Escape")     closeModal();
        if (e.key === "Enter")      applySelected();
    });
}

// ──────────────────────────────────────────────
//  Modal state
// ──────────────────────────────────────────────
let _modalKey   = null;   // active char key in modal
let _viewIdx    = 0;      // currently viewed index in gallery

function openModal(key) {
    buildModal();
    _modalKey = key || currentCharKey();
    if (!_modalKey) return;

    const gallery = getGallery(_modalKey);

    document.getElementById("ag-char-name").textContent = currentCharName();
    document.getElementById("ag-modal").classList.add("ag-open");

    _viewIdx = gallery.activeIdx >= 0 ? gallery.activeIdx : 0;
    renderModal();
}

function closeModal() {
    document.getElementById("ag-modal")?.classList.remove("ag-open");
}

function renderModal() {
    const gallery = getGallery(_modalKey);
    const total   = gallery.avatars.length;
    const img     = document.getElementById("ag-main-img");
    const box     = document.getElementById("ag-main-box");
    const counter = document.getElementById("ag-counter");
    const prevBtn = document.getElementById("ag-prev");
    const nextBtn = document.getElementById("ag-next");
    const setBtn  = document.getElementById("ag-set-btn");
    const thumbsEl= document.getElementById("ag-thumbs");

    if (total === 0) {
        img.src = "";
        img.style.display = "none";
        // Show empty state
        let es = box.querySelector(".ag-empty-state");
        if (!es) {
            es = document.createElement("div");
            es.className = "ag-empty-state";
            es.innerHTML = `<div class="ag-empty-icon">🖼</div><div>Нет аватарок</div><div style="font-size:11px;opacity:.6">Загрузи первую!</div>`;
            box.appendChild(es);
        }
        es.style.display = "flex";
        counter.textContent = "0 / 0";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        setBtn.style.display = "none";
        thumbsEl.innerHTML = "";
        return;
    }

    // Hide empty state
    const es = box.querySelector(".ag-empty-state");
    if (es) es.style.display = "none";
    img.style.display = "block";

    if (_viewIdx >= total) _viewIdx = total - 1;
    if (_viewIdx < 0) _viewIdx = 0;

    const cur = gallery.avatars[_viewIdx];
    const isActive = _viewIdx === gallery.activeIdx;

    // Animate image swap
    img.classList.add("ag-img-fade");
    setTimeout(() => {
        img.src = cur.src;
        img.classList.remove("ag-img-fade");
    }, 130);

    box.classList.toggle("ag-is-active", isActive);
    counter.textContent = `${_viewIdx + 1} / ${total}`;
    prevBtn.disabled = total <= 1;
    nextBtn.disabled = total <= 1;

    setBtn.style.display = "";
    if (isActive) {
        setBtn.textContent = "✓ Активна";
        setBtn.classList.add("ag-active-btn");
    } else {
        setBtn.textContent = "✓ Выбрать";
        setBtn.classList.remove("ag-active-btn");
    }

    // Thumbnails
    thumbsEl.innerHTML = "";
    gallery.avatars.forEach((av, i) => {
        const wrap = document.createElement("div");
        wrap.className = "ag-thumb-wrap";

        const t = document.createElement("img");
        t.className = "ag-thumb" + (i === _viewIdx ? " ag-thumb-active" : "");
        t.src = av.src;
        t.title = av.label || `Аватар ${i + 1}`;
        t.addEventListener("click", () => { _viewIdx = i; renderModal(); });

        const del = document.createElement("button");
        del.className = "ag-thumb-del";
        del.title = "Удалить";
        del.textContent = "✕";
        del.addEventListener("click", e => { e.stopPropagation(); deleteAvatar(i); });

        wrap.appendChild(t);
        wrap.appendChild(del);
        thumbsEl.appendChild(wrap);
    });
}

function navigate(dir) {
    const gallery = getGallery(_modalKey);
    if (!gallery || !gallery.avatars.length) return;
    _viewIdx = (_viewIdx + dir + gallery.avatars.length) % gallery.avatars.length;
    renderModal();
}

function deleteAvatar(idx) {
    const gallery = getGallery(_modalKey);
    gallery.avatars.splice(idx, 1);
    if (gallery.activeIdx === idx) gallery.activeIdx = -1;
    else if (gallery.activeIdx > idx) gallery.activeIdx--;
    if (_viewIdx >= gallery.avatars.length) _viewIdx = Math.max(0, gallery.avatars.length - 1);
    save();
    renderModal();
    updateBadge();
}

function applySelected() {
    const gallery = getGallery(_modalKey);
    if (!gallery || !gallery.avatars.length) return;
    gallery.activeIdx = _viewIdx;
    save();
    renderModal();

    // Apply to DOM: swap avatar images visible on screen
    const src = gallery.avatars[_viewIdx].src;
    applyAvatarToDOM(src);
}

// ──────────────────────────────────────────────
//  Apply avatar to SillyTavern UI
// ──────────────────────────────────────────────
function applyAvatarToDOM(src) {
    // Character avatar in chat header / character info
    const targets = [
        "#ai_profile_pic",
        ".mes_block .avatar img",
        "#character_avatar_block img",
        ".right-nav-panel .avatar img",
        "#avatar_load_preview",
    ];
    targets.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (el.tagName === "IMG") el.src = src;
        });
    });

    // Flash feedback
    const setBtn = document.getElementById("ag-set-btn");
    if (setBtn) {
        setBtn.textContent = "✓ Активна";
        setBtn.classList.add("ag-active-btn");
    }

    // Update our badge
    updateBadge();
}

// ──────────────────────────────────────────────
//  File upload
// ──────────────────────────────────────────────
async function onFilesChosen(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const gallery = getGallery(_modalKey);
    for (const file of files) {
        const src = await fileToDataURL(file);
        gallery.avatars.push({ src, label: file.name.replace(/\.[^.]+$/, "") });
    }
    if (gallery.activeIdx < 0 && gallery.avatars.length > 0) {
        gallery.activeIdx = 0;
    }
    _viewIdx = gallery.avatars.length - 1;
    save();
    renderModal();
    updateBadge();
    e.target.value = "";
}

function fileToDataURL(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
    });
}

// ──────────────────────────────────────────────
//  Badge on the in-page avatar
// ──────────────────────────────────────────────
function updateBadge() {
    const key = currentCharKey();
    const gallery = store[key];
    const count = gallery?.avatars?.length || 0;

    document.querySelectorAll(".ag-avatar-badge").forEach(b => {
        b.textContent = count > 0 ? `🖼 ${count}` : "🖼";
    });

    // Also restore active avatar src if we have one
    if (key && gallery?.activeIdx >= 0 && gallery.avatars.length) {
        const src = gallery.avatars[gallery.activeIdx].src;
        applyAvatarToDOM(src);
    }
}

// ──────────────────────────────────────────────
//  Inject clickable badge onto avatar elements
// ──────────────────────────────────────────────
function wrapAvatarElement(imgEl) {
    if (!imgEl || imgEl.closest(".ag-avatar-wrap")) return; // already wrapped
    const parent = imgEl.parentElement;
    if (!parent) return;

    const wrap = document.createElement("div");
    wrap.className = "ag-avatar-wrap";
    wrap.title = "Открыть галерею аватарок";

    const badge = document.createElement("span");
    badge.className = "ag-avatar-badge";
    badge.textContent = "🖼";

    parent.insertBefore(wrap, imgEl);
    wrap.appendChild(imgEl);
    wrap.appendChild(badge);

    wrap.addEventListener("click", e => {
        e.stopPropagation();
        openModal(currentCharKey());
    });
}

function injectBadges() {
    // Main chat avatar (right panel character portrait)
    const targets = [
        "#ai_profile_pic",
        "#character_avatar_block img",
        ".right-nav-panel .avatar img",
    ];
    targets.forEach(sel => {
        document.querySelectorAll(sel).forEach(img => wrapAvatarElement(img));
    });

    updateBadge();
}

// ──────────────────────────────────────────────
//  Event hooks
// ──────────────────────────────────────────────
function onCharChanged() {
    setTimeout(() => {
        injectBadges();
        updateBadge();
    }, 400);
}

// ──────────────────────────────────────────────
//  Init
// ──────────────────────────────────────────────
(function init() {
    buildModal();
    // Hook into ST events
    try {
        eventSource.on(event_types.CHAT_CHANGED,         onCharChanged);
        eventSource.on(event_types.CHARACTER_SELECTED,   onCharChanged);
        eventSource.on(event_types.SETTINGS_UPDATED,     onCharChanged);
    } catch (err) {
        console.warn("[AvatarGallery] Could not bind ST events:", err);
    }

    // Inject on load + watch DOM for avatar elements appearing
    setTimeout(injectBadges, 800);
    setTimeout(injectBadges, 2000);

    const observer = new MutationObserver(() => injectBadges());
    observer.observe(document.body, { childList: true, subtree: true });

    console.log("[AvatarGallery] Extension loaded ✓");
})();
