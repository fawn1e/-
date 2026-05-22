// ===== Avatar Gallery Extension for SillyTavern =====
// Allows uploading multiple avatars per character/persona,
// browsing them in a gallery, and permanently applying them
// via /api/characters/edit so all other extensions see the change.

import { extension_settings, saveSettingsDebounced } from "../../../extensions.js";
import { getContext, event_types } from "../../../extensions.js";

const EXT_NAME = "avatar-gallery";
const LOG_PREFIX = "[AvatarGallery]";

// ──────────────────────────────────────────────
//  Settings store
//  Structure: extension_settings[EXT_NAME][charKey] = { avatars: [{ data, name }], activeIdx }
// ──────────────────────────────────────────────
function ensureSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }
    return extension_settings[EXT_NAME];
}

function save() {
    saveSettingsDebounced();
}

// ──────────────────────────────────────────────
//  Character helpers
// ──────────────────────────────────────────────
function getCharData() {
    try {
        const ctx = getContext();
        if (!ctx) return null;
        const chid = ctx.characterId;
        if (chid === undefined || chid === null || chid < 0) return null;
        const char = ctx.characters?.[chid];
        if (!char) return null;
        return { id: chid, char, name: char.name, avatar: char.avatar };
    } catch (e) {
        console.warn(LOG_PREFIX, "getCharData error:", e);
        return null;
    }
}

function charKey() {
    const d = getCharData();
    return d ? `char::${d.avatar || d.name}` : null;
}

function getGallery(key) {
    if (!key) return null;
    const store = ensureSettings();
    if (!store[key]) store[key] = { avatars: [], activeIdx: -1 };
    return store[key];
}

// ──────────────────────────────────────────────
//  Convert data URL to File/Blob
// ──────────────────────────────────────────────
function dataURLtoBlob(dataURL) {
    const [header, base64] = dataURL.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/png";
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// ──────────────────────────────────────────────
//  Persist avatar to server via /api/characters/edit
//  This ensures all ST extensions and features see the new avatar
// ──────────────────────────────────────────────
async function persistAvatarToServer(dataURL) {
    const charData = getCharData();
    if (!charData) {
        console.warn(LOG_PREFIX, "No active character to persist avatar for");
        return false;
    }

    try {
        const blob = dataURLtoBlob(dataURL);
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "png";
        const file = new File([blob], `avatar.${ext}`, { type: blob.type });

        // Build FormData matching SillyTavern's /api/characters/edit API
        const formData = new FormData();
        formData.append("avatar", file);

        // We need to send the character JSON data as well
        // Copy existing character data and set avatar_url
        const charJSON = JSON.stringify({
            name: charData.char.name,
            description: charData.char.description || "",
            personality: charData.char.personality || "",
            scenario: charData.char.scenario || "",
            first_mes: charData.char.first_mes || "",
            mes_example: charData.char.mes_example || "",
            creator_notes: charData.char.creator_notes || "",
            system_prompt: charData.char.system_prompt || "",
            post_history_instructions: charData.char.post_history_instructions || "",
            tags: charData.char.tags || [],
            creator: charData.char.creator || "",
            character_version: charData.char.character_version || "",
            alternate_greetings: charData.char.alternate_greetings || [],
            extensions: charData.char.extensions || {},
            avatar: charData.char.avatar || "none",
        });

        formData.append("json_data", charJSON);

        const response = await fetch("/api/characters/edit", {
            method: "POST",
            body: formData,
            headers: getContext().getRequestHeaders ? {} : {},
        });

        if (!response.ok) {
            console.error(LOG_PREFIX, "Failed to persist avatar:", response.status, await response.text());
            return false;
        }

        console.log(LOG_PREFIX, "Avatar persisted successfully to server");

        // Reload character list to reflect changes
        try {
            const ctx = getContext();
            if (ctx.reloadCurrentChat) {
                await ctx.reloadCurrentChat();
            }
        } catch (e) {
            // Fallback: just reload the character data
            console.warn(LOG_PREFIX, "Could not reload chat:", e);
        }

        return true;
    } catch (e) {
        console.error(LOG_PREFIX, "Error persisting avatar:", e);
        return false;
    }
}

// ──────────────────────────────────────────────
//  UI: Build modal
// ──────────────────────────────────────────────
let _modalKey = null;
let _viewIdx = 0;
let _saving = false;

function buildModal() {
    if (document.getElementById("ag-modal")) return;

    const html = `
<div id="ag-modal" class="ag-modal-overlay">
  <div class="ag-panel">
    <div class="ag-header">
      <div class="ag-header-left">
        <span class="ag-title">Галерея аватаров</span>
        <span class="ag-char-name" id="ag-char-name"></span>
      </div>
      <button class="ag-close" id="ag-close" title="Закрыть">✕</button>
    </div>

    <div class="ag-preview-wrap">
      <button class="ag-arrow ag-arrow-left" id="ag-prev" title="Назад">❮</button>
      <div class="ag-main-img-box" id="ag-main-box">
        <img id="ag-main-img" src="" alt="avatar" draggable="false" />
        <div class="ag-active-glow"></div>
        <div class="ag-empty-state" id="ag-empty" style="display:none">
          <div class="ag-empty-icon">📷</div>
          <div>Нет аватарок</div>
          <div class="ag-empty-sub">Загрузи первую!</div>
        </div>
      </div>
      <button class="ag-arrow ag-arrow-right" id="ag-next" title="Вперёд">❯</button>
    </div>

    <div class="ag-meta">
      <span class="ag-counter" id="ag-counter">0 / 0</span>
      <button class="ag-set-btn" id="ag-set-btn">✓ Установить</button>
    </div>

    <div class="ag-thumbs" id="ag-thumbs"></div>

    <div class="ag-footer">
      <button class="ag-upload-btn" id="ag-upload-btn">
        <span class="ag-upload-icon">＋</span> Загрузить
      </button>
      <input type="file" id="ag-file-input" accept="image/*" multiple hidden />
    </div>

    <div class="ag-status" id="ag-status" style="display:none"></div>
  </div>
</div>`;

    document.body.insertAdjacentHTML("beforeend", html);

    // Event bindings
    const modal = document.getElementById("ag-modal");
    document.getElementById("ag-close").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    document.getElementById("ag-prev").addEventListener("click", () => navigate(-1));
    document.getElementById("ag-next").addEventListener("click", () => navigate(1));
    document.getElementById("ag-set-btn").addEventListener("click", applySelected);
    document.getElementById("ag-upload-btn").addEventListener("click", () => {
        document.getElementById("ag-file-input").click();
    });
    document.getElementById("ag-file-input").addEventListener("change", onFilesChosen);

    // Keyboard navigation
    document.addEventListener("keydown", (e) => {
        if (!modal.classList.contains("ag-open")) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); navigate(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); navigate(1); }
        if (e.key === "Escape") closeModal();
        if (e.key === "Enter" && !_saving) applySelected();
    });
}

// ──────────────────────────────────────────────
//  Modal open/close
// ──────────────────────────────────────────────
function openModal() {
    buildModal();
    const key = charKey();
    if (!key) {
        showStatus("Сначала выбери персонажа!", "warn");
        return;
    }
    _modalKey = key;
    _viewIdx = 0;

    const gallery = getGallery(_modalKey);
    if (gallery.activeIdx >= 0 && gallery.activeIdx < gallery.avatars.length) {
        _viewIdx = gallery.activeIdx;
    }

    const charData = getCharData();
    document.getElementById("ag-char-name").textContent = charData?.name || "";
    document.getElementById("ag-modal").classList.add("ag-open");
    renderModal();
}

function closeModal() {
    document.getElementById("ag-modal")?.classList.remove("ag-open");
    hideStatus();
}

// ──────────────────────────────────────────────
//  Modal rendering
// ──────────────────────────────────────────────
function renderModal() {
    const gallery = getGallery(_modalKey);
    if (!gallery) return;

    const total = gallery.avatars.length;
    const img = document.getElementById("ag-main-img");
    const emptyEl = document.getElementById("ag-empty");
    const counter = document.getElementById("ag-counter");
    const prevBtn = document.getElementById("ag-prev");
    const nextBtn = document.getElementById("ag-next");
    const setBtn = document.getElementById("ag-set-btn");
    const thumbsEl = document.getElementById("ag-thumbs");
    const box = document.getElementById("ag-main-box");

    if (total === 0) {
        img.style.display = "none";
        emptyEl.style.display = "flex";
        counter.textContent = "0 / 0";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        setBtn.style.display = "none";
        thumbsEl.innerHTML = "";
        box.classList.remove("ag-is-active");
        return;
    }

    emptyEl.style.display = "none";
    img.style.display = "block";

    _viewIdx = Math.max(0, Math.min(_viewIdx, total - 1));

    const cur = gallery.avatars[_viewIdx];
    const isActive = _viewIdx === gallery.activeIdx;

    // Smooth image transition
    img.classList.add("ag-img-fade");
    requestAnimationFrame(() => {
        setTimeout(() => {
            img.src = cur.data;
            img.classList.remove("ag-img-fade");
        }, 120);
    });

    box.classList.toggle("ag-is-active", isActive);
    counter.textContent = `${_viewIdx + 1} / ${total}`;
    prevBtn.disabled = total <= 1;
    nextBtn.disabled = total <= 1;

    setBtn.style.display = "";
    if (isActive) {
        setBtn.textContent = "✓ Активна";
        setBtn.classList.add("ag-active-btn");
        setBtn.disabled = true;
    } else {
        setBtn.textContent = "✓ Установить";
        setBtn.classList.remove("ag-active-btn");
        setBtn.disabled = _saving;
    }

    // Thumbnails
    thumbsEl.innerHTML = "";
    gallery.avatars.forEach((av, i) => {
        const wrap = document.createElement("div");
        wrap.className = "ag-thumb-wrap" + (i === gallery.activeIdx ? " ag-thumb-is-active" : "");

        const thumb = document.createElement("img");
        thumb.className = "ag-thumb" + (i === _viewIdx ? " ag-thumb-selected" : "");
        thumb.src = av.data;
        thumb.alt = av.name || `Аватар ${i + 1}`;
        thumb.draggable = false;
        thumb.addEventListener("click", () => { _viewIdx = i; renderModal(); });

        const del = document.createElement("button");
        del.className = "ag-thumb-del";
        del.title = "Удалить";
        del.innerHTML = "×";
        del.addEventListener("click", (e) => { e.stopPropagation(); removeAvatar(i); });

        wrap.appendChild(thumb);
        wrap.appendChild(del);
        thumbsEl.appendChild(wrap);
    });
}

// ──────────────────────────────────────────────
//  Navigation
// ──────────────────────────────────────────────
function navigate(dir) {
    const gallery = getGallery(_modalKey);
    if (!gallery || gallery.avatars.length <= 1) return;
    _viewIdx = (_viewIdx + dir + gallery.avatars.length) % gallery.avatars.length;
    renderModal();
}

// ──────────────────────────────────────────────
//  Apply selected avatar (persist to server!)
// ──────────────────────────────────────────────
async function applySelected() {
    if (_saving) return;
    const gallery = getGallery(_modalKey);
    if (!gallery || !gallery.avatars.length) return;

    const avatar = gallery.avatars[_viewIdx];
    _saving = true;
    showStatus("Сохранение...", "info");
    renderModal();

    // Persist to the SillyTavern server
    const success = await persistAvatarToServer(avatar.data);

    if (success) {
        gallery.activeIdx = _viewIdx;
        save();
        showStatus("✓ Аватар установлен!", "success");
    } else {
        showStatus("⚠ Ошибка сохранения. Попробуй ещё раз.", "error");
    }

    _saving = false;
    renderModal();

    // Auto-hide status after 2s
    setTimeout(hideStatus, 2500);
}

// ──────────────────────────────────────────────
//  Remove avatar from gallery
// ──────────────────────────────────────────────
function removeAvatar(idx) {
    const gallery = getGallery(_modalKey);
    if (!gallery) return;

    gallery.avatars.splice(idx, 1);
    if (gallery.activeIdx === idx) gallery.activeIdx = -1;
    else if (gallery.activeIdx > idx) gallery.activeIdx--;

    _viewIdx = Math.max(0, Math.min(_viewIdx, gallery.avatars.length - 1));
    save();
    renderModal();
}

// ──────────────────────────────────────────────
//  File upload handler
// ──────────────────────────────────────────────
async function onFilesChosen(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const gallery = getGallery(_modalKey);
    if (!gallery) return;

    showStatus(`Загрузка ${files.length} файл(ов)...`, "info");

    for (const file of files) {
        try {
            const data = await fileToDataURL(file);
            const name = file.name.replace(/\.[^.]+$/, "");
            gallery.avatars.push({ data, name });
        } catch (err) {
            console.error(LOG_PREFIX, "Failed to read file:", err);
        }
    }

    if (gallery.activeIdx < 0 && gallery.avatars.length > 0) {
        gallery.activeIdx = 0;
    }
    _viewIdx = gallery.avatars.length - 1;
    save();
    renderModal();
    hideStatus();

    e.target.value = "";
}

// ──────────────────────────────────────────────
//  Status messages
// ──────────────────────────────────────────────
function showStatus(text, type) {
    const el = document.getElementById("ag-status");
    if (!el) return;
    el.textContent = text;
    el.className = "ag-status ag-status-" + type;
    el.style.display = "block";
}

function hideStatus() {
    const el = document.getElementById("ag-status");
    if (el) el.style.display = "none";
}

// ──────────────────────────────────────────────
//  Inject gallery button into ST UI
// ──────────────────────────────────────────────
function injectGalleryButton() {
    if (document.getElementById("ag-open-btn")) return;

    // Try to find the avatar area in the right panel or character info
    const targets = [
        "#form_character_url",
        "#character_popup",
        "#avatar_div",
        ".avatar_upload_form",
    ];

    // Create a floating button that always works
    const btn = document.createElement("button");
    btn.id = "ag-open-btn";
    btn.className = "ag-fab-btn";
    btn.innerHTML = "🖼";
    btn.title = "Галерея аватаров";
    btn.addEventListener("click", openModal);
    document.body.appendChild(btn);
}

// No longer intercepting avatar clicks — this was blocking
// the native SillyTavern character gallery from opening.
function injectAvatarClick() {
    // intentionally empty — FAB button is the only entry point now
}

// ──────────────────────────────────────────────
//  Init
// ──────────────────────────────────────────────
jQuery(async () => {
    ensureSettings();
    buildModal();
    injectGalleryButton();

    // Bind to ST events
    try {
        const ctx = getContext();
        const eventSource = ctx.eventSource;

        if (eventSource) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
                setTimeout(injectAvatarClick, 500);
            });
            eventSource.on("characterSelected", () => {
                setTimeout(injectAvatarClick, 500);
            });
        }
    } catch (e) {
        console.warn(LOG_PREFIX, "Could not bind events:", e);
    }

    // Periodic re-injection for dynamic content
    setTimeout(injectAvatarClick, 1000);
    setTimeout(injectAvatarClick, 3000);

    // MutationObserver for dynamic DOM updates
    const observer = new MutationObserver(() => {
        injectAvatarClick();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    console.log(LOG_PREFIX, "Extension loaded ✓");
});
