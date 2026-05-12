const TOAST_HOST_ID = "toast-host";
const MODAL_HOST_ID = "modal-host";

function ensureHost(id, className) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = className;
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {"success"|"error"|"info"} type
 * @param {string} message
 * @param {number} [durationMs]
 */
export function showToast(type, message, durationMs = 3800) {
  const host = ensureHost(
    TOAST_HOST_ID,
    "fixed bottom-4 left-4 right-4 z-[100] flex flex-col items-stretch gap-2 sm:left-auto sm:right-6 sm:max-w-sm pointer-events-none"
  );
  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.className =
    "pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-300 " +
    (type === "success"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-900"
      : type === "error"
        ? "border-red-200/80 bg-red-50/90 text-red-900"
        : "border-slate-200/80 bg-white/90 text-slate-800");
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  toast.style.opacity = "0";
  toast.style.transform = "translateY(8px)";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 280);
  }, durationMs);
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.confirmText]
 * @param {string} [opts.cancelText]
 * @param {"danger"|"primary"} [opts.variant]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts) {
  return new Promise((resolve) => {
    const host = ensureHost(MODAL_HOST_ID, "fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center");
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "absolute inset-0 bg-slate-900/40 backdrop-blur-sm";
    backdrop.setAttribute("aria-label", "إغلاق");

    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
  panel.className =
    "relative w-full max-w-md scale-100 rounded-3xl border border-white/30 bg-white/85 p-6 opacity-100 shadow-2xl backdrop-blur-xl transition duration-200";

    const title = document.createElement("h2");
    title.className = "text-lg font-semibold text-slate-900";
    title.textContent = opts.title;

    const msg = document.createElement("p");
    msg.className = "mt-2 text-sm leading-relaxed text-slate-600";
    msg.textContent = opts.message;

    const actions = document.createElement("div");
    actions.className = "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className =
      "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50";
    cancel.textContent = opts.cancelText ?? "إلغاء";

    const confirm = document.createElement("button");
    confirm.type = "button";
    const danger = opts.variant === "danger";
    confirm.className =
      "rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition " +
      (danger
        ? "bg-red-600 hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        : "bg-emerald-700 hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700");
    confirm.textContent = opts.confirmText ?? "تأكيد";

    function close(value) {
      host.remove();
      resolve(value);
    }

    backdrop.addEventListener("click", () => close(false));
    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));

    actions.append(cancel, confirm);
    panel.append(title, msg, actions);
    host.append(backdrop, panel);
    confirm.focus();
  });
}

/** @param {HTMLElement} el */
export function setSkeletonTable(el) {
  el.innerHTML = `
    <div class="space-y-3" aria-busy="true" aria-label="جاري التحميل">
      ${Array.from({ length: 6 })
        .map(
          () => `
        <div class="flex animate-pulse gap-4 rounded-2xl border border-slate-100 bg-white/60 p-4">
          <div class="h-14 w-14 shrink-0 rounded-xl bg-slate-200/80"></div>
          <div class="flex flex-1 flex-col gap-2">
            <div class="h-4 w-1/3 rounded bg-slate-200/80"></div>
            <div class="h-3 w-1/2 rounded bg-slate-100"></div>
          </div>
        </div>`
        )
        .join("")}
    </div>`;
}

/** @param {HTMLElement} el */
export function setSkeletonCards(el) {
  el.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="جاري التحميل">
      ${Array.from({ length: 6 })
        .map(
          () => `
        <div class="animate-pulse rounded-3xl border border-slate-100 bg-white/50 p-5 shadow-sm">
          <div class="mb-4 aspect-video w-full rounded-2xl bg-slate-200/70"></div>
          <div class="mb-2 h-4 w-2/3 rounded bg-slate-200/80"></div>
          <div class="h-3 w-1/2 rounded bg-slate-100"></div>
        </div>`
        )
        .join("")}
    </div>`;
}

/** @param {HTMLElement} el @param {boolean} on */
export function toggleSpinner(el, on) {
  if (!el) return;
  el.classList.toggle("hidden", !on);
  el.setAttribute("aria-hidden", on ? "false" : "true");
}

/**
 * @param {string} src
 * @param {string} [alt]
 */
export function openImageModal(src, alt = "") {
  const host = ensureHost("image-modal-host", "fixed inset-0 z-[95] flex items-center justify-center p-4");
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "absolute inset-0 bg-slate-950/70 backdrop-blur-md";
  backdrop.setAttribute("aria-label", "إغلاق");

  const wrap = document.createElement("div");
  wrap.className =
    "relative max-h-[90vh] max-w-5xl overflow-hidden rounded-3xl border border-white/20 bg-white/10 p-2 shadow-2xl";

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.loading = "eager";
  img.decoding = "async";
  img.className = "max-h-[85vh] w-auto max-w-full rounded-2xl object-contain";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className =
    "absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow backdrop-blur";
  closeBtn.textContent = "إغلاق";

  function close() {
    host.remove();
  }

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  wrap.append(closeBtn, img);
  host.append(backdrop, wrap);
}

const DETAIL_HOST_ID = "transfer-detail-host";

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0] || ""}${parts[1][0] || ""}` || "؟";
}

/**
 * @param {object} d
 * @param {string} d.personName
 * @param {string} d.amountText
 * @param {string} d.dateText
 * @param {string} d.statusLabel
 * @param {string} d.statusClass Tailwind classes for status pill
 * @param {string|null} d.imageUrl
 * @param {string} [d.imageAlt]
 */
export function openTransferDetailDialog(d) {
  const host = ensureHost(
    DETAIL_HOST_ID,
    "fixed inset-0 z-[96] flex items-end justify-center sm:items-center sm:p-6"
  );
  host.innerHTML = "";

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "absolute inset-0 bg-slate-900/45 backdrop-blur-sm transition-opacity";
  backdrop.setAttribute("aria-label", "إغلاق النافذة");

  const panel = document.createElement("div");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "transfer-detail-title");
  panel.className =
    "relative flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/40 bg-gradient-to-b from-white/95 to-slate-50/95 shadow-2xl shadow-slate-900/20 ring-1 ring-white/60 sm:max-h-[85vh] sm:rounded-3xl";

  const accent = document.createElement("div");
  accent.className = "h-1.5 w-full shrink-0 bg-gradient-to-l from-emerald-900 via-emerald-600 to-teal-500";
  panel.appendChild(accent);

  const head = document.createElement("div");
  head.className = "flex items-start justify-between gap-4 border-b border-slate-100/90 px-5 pb-4 pt-5 sm:px-6";

  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-1 items-start gap-3";

  const av = document.createElement("div");
  av.className =
    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-900 text-lg font-bold text-white shadow-md ring-2 ring-emerald-100";
  av.textContent = initialsFromName(d.personName);
  av.setAttribute("aria-hidden", "true");

  const titles = document.createElement("div");
  titles.className = "min-w-0 flex-1";
  const h2 = document.createElement("h2");
  h2.id = "transfer-detail-title";
  h2.className = "truncate text-lg font-bold text-slate-900 sm:text-xl";
  h2.textContent = d.personName || "—";
  const badge = document.createElement("span");
  badge.className = `mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${d.statusClass}`;
  badge.textContent = d.statusLabel;
  titles.append(h2, badge);

  left.append(av, titles);

  const closeTop = document.createElement("button");
  closeTop.type = "button";
  closeTop.className =
    "focus-ring shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50";
  closeTop.textContent = "إغلاق";

  head.append(left, closeTop);

  const body = document.createElement("div");
  body.className = "flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6";

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 gap-3 sm:grid-cols-2";

  function addField(label, value) {
    const wrap = document.createElement("div");
    wrap.className =
      "rounded-2xl border border-slate-100/80 bg-white/70 px-4 py-3 shadow-sm ring-1 ring-white/40 backdrop-blur-sm";
    const lab = document.createElement("p");
    lab.className = "text-xs font-semibold uppercase tracking-wide text-slate-500";
    lab.textContent = label;
    const val = document.createElement("p");
    val.className = "mt-1 text-base font-semibold text-slate-900";
    val.textContent = value;
    wrap.append(lab, val);
    grid.append(wrap);
  }

  addField("المبلغ", d.amountText);
  addField("تاريخ التسجيل", d.dateText);

  body.appendChild(grid);

  if (d.imageUrl) {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 ring-1 ring-white/60";
    const mediaLabel = document.createElement("p");
    mediaLabel.className = "mb-2 text-xs font-semibold text-slate-600";
    mediaLabel.textContent = "مرفق التحويل";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "focus-ring group relative block w-full overflow-hidden rounded-xl bg-white shadow-inner ring-1 ring-slate-200/60";
    const img = document.createElement("img");
    img.src = d.imageUrl;
    img.alt = d.imageAlt || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.className = "max-h-56 w-full object-contain transition duration-300 group-hover:scale-[1.02]";
    const cap = document.createElement("span");
    cap.className =
      "pointer-events-none absolute bottom-2 start-2 rounded-lg bg-slate-900/75 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100";
    cap.textContent = "معاينة بحجم كامل";
    btn.append(img, cap);
    btn.addEventListener("click", () => {
      close();
      openImageModal(d.imageUrl, d.imageAlt || "");
    });
    mediaWrap.append(mediaLabel, btn);
    body.appendChild(mediaWrap);
  } else {
    const empty = document.createElement("p");
    empty.className =
      "mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center text-sm text-slate-500";
    empty.textContent = "لا توجد صورة مرفقة لهذا التحويل.";
    body.appendChild(empty);
  }

  const foot = document.createElement("div");
  foot.className = "border-t border-slate-100/90 bg-white/60 px-5 py-4 sm:px-6";
  const closePrimary = document.createElement("button");
  closePrimary.type = "button";
  closePrimary.className =
    "focus-ring w-full rounded-2xl bg-emerald-800 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 sm:w-auto sm:px-8";
  closePrimary.textContent = "تم";

  foot.appendChild(closePrimary);

  panel.append(head, body, foot);
  host.append(backdrop, panel);

  function close() {
    document.removeEventListener("keydown", onKey);
    host.innerHTML = "";
    host.remove();
  }

  function onKey(ev) {
    if (ev.key === "Escape") close();
  }

  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", close);
  closeTop.addEventListener("click", close);
  closePrimary.addEventListener("click", close);
  closeTop.focus();
}
