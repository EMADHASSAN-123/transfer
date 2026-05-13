import { isEmailAllowedForAdmin } from "./auth.js";
import { getSupabase, getConfigError } from "./supabase.js";
import { showToast, setSkeletonCards, setSkeletonTable, openImageModal, openTransferDetailDialog } from "./ui.js";

const STATUS_META = {
  pending: { label: "قيد الانتظار", class: "bg-amber-50 text-amber-800 ring-amber-200/60" },
  sent: { label: "تم الإرسال", class: "bg-sky-50 text-sky-800 ring-sky-200/60" },
  delivered: { label: "تم التسليم", class: "bg-emerald-50 text-emerald-800 ring-emerald-200/60" },
};

/** Stable order for sorting by workflow stage */
const STATUS_ORDER = { pending: 0, sent: 1, delivered: 2 };
const VALID_STATUS_FILTERS = new Set(["all", "pending", "sent", "delivered"]);

const VIEW_STORAGE_KEY = "transfer_public_view";
const STATUS_FILTER_STORAGE_KEY = "transfer_public_status_filter";

let channel = null;
let allRows = [];
/** @type {"table"|"cards"} */
let viewMode = "table";
/** @type {"all"|"pending"|"sent"|"delivered"} */
let statusFilter = "sent";
/** @type {null|"asc"|"desc"} */
let statusSortDir = null;
/** Snapshot of rows currently rendered (for delegated clicks) */
let interactiveRows = [];

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function readStoredStatusFilter() {
  const v = sessionStorage.getItem(STATUS_FILTER_STORAGE_KEY);
  return VALID_STATUS_FILTERS.has(v) ? v : "sent";
}

function statusRank(row) {
  const k = row.status || "pending";
  return STATUS_ORDER[k] ?? 0;
}

function formatMoney(amount) {
  const n = Number(amount);
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function openDetail(t) {
  const st = STATUS_META[t.status] ?? STATUS_META.pending;
  openTransferDetailDialog({
    personName: t.person_name ?? "",
    amountText: formatMoney(t.amount),
    dateText: formatDate(t.created_at),
    statusLabel: st.label,
    statusClass: st.class,
    imageUrl: t.image_url || null,
    imageAlt: t.person_name ?? "",
  });
}

function renderEmpty(container, searchQuery) {
  const q = searchQuery.trim();
  if (!allRows.length) {
    container.innerHTML = `<div class="rounded-3xl border border-dashed border-slate-200 bg-white/50 p-12 text-center backdrop-blur">
        <p class="text-lg font-semibold text-slate-800">لا توجد تحويلات بعد</p>
        <p class="mt-2 text-sm text-slate-500">ستظهر السجلات هنا فور إضافتها من لوحة الإدارة.</p>
      </div>`;
    return;
  }
  const hints = [];
  if (q) hints.push("البحث الحالي");
  if (statusFilter !== "all") hints.push(`تصفية الحالة (${STATUS_META[statusFilter]?.label ?? statusFilter})`);
  const hint = hints.length ? `لا توجد تحويلات تطابق ${hints.join(" و")}. غيّر التصفية أو امسح البحث.` : "جرّب تعديل عوامل العرض.";
  container.innerHTML = `<div class="rounded-3xl border border-dashed border-slate-200 bg-white/50 p-12 text-center backdrop-blur">
        <p class="text-lg font-semibold text-slate-800">لا توجد نتائج</p>
        <p class="mt-2 text-sm text-slate-500">${escapeHtml(hint)}</p>
      </div>`;
}

function renderTable(container, rows, searchQuery) {
  if (!rows.length) {
    renderEmpty(container, searchQuery);
    return;
  }

  const sortThAria =
    statusSortDir === "asc" ? ' aria-sort="ascending"' : statusSortDir === "desc" ? ' aria-sort="descending"' : "";
  const sortLabel =
    statusSortDir === null
      ? "ترتيب حسب الحالة"
      : statusSortDir === "asc"
        ? "ترتيب تصاعدي حسب الحالة — اضغط للعكس"
        : "ترتيب تنازلي حسب الحالة — اضغط لإلغاء الترتيب";

  container.innerHTML = `
    <div class="glass-card overflow-hidden rounded-3xl shadow-soft ring-1 ring-white/40">
      <div class="transfers-table-wrap">
        <table class="transfers-table w-full min-w-[520px] border-separate border-spacing-0 text-right text-sm">
          <thead>
            <tr class="bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200/60">
              <th scope="col" class="w-12 px-2 py-3 font-semibold sm:w-14 sm:px-3"></th>
              <th scope="col" class="w-[24%] max-w-[5.5rem] px-2 py-3 font-semibold sm:max-w-[9rem] sm:px-3">المستفيد</th>
              <th scope="col" class="w-[20%] whitespace-nowrap px-2 py-3 font-semibold sm:w-auto sm:px-3">المبلغ</th>
              <th scope="col" class="sortable-status w-[22%] px-2 py-3 font-semibold sm:w-auto sm:px-3"${sortThAria}>
                <button type="button" id="status-sort-btn" class="focus-ring inline-flex max-w-full items-center gap-1 rounded-lg text-start font-semibold text-slate-600 transition hover:text-emerald-900" title="${escapeAttr(sortLabel)}" aria-label="${escapeAttr(sortLabel)}">
                  <span>الحالة</span>
                  <span class="tabular-nums text-[10px] font-bold text-slate-400" aria-hidden="true">${statusSortDir === "asc" ? "↑" : statusSortDir === "desc" ? "↓" : "↕"}</span>
                </button>
              </th>
              <th scope="col" class="min-w-[6.75rem] px-2 py-3 font-semibold sm:min-w-[9rem] sm:px-3">التاريخ</th>
            </tr>
          </thead>
          <tbody class="bg-white/50">
            ${rows
              .map((t) => {
                const st = STATUS_META[t.status] ?? STATUS_META.pending;
                const thumb = t.image_url
                  ? `<img src="${escapeHtml(t.image_url)}" alt="" width="40" height="40" class="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200/80 sm:h-10 sm:w-10 sm:rounded-xl" loading="lazy" decoding="async" />`
                  : `<span class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-medium text-slate-400 sm:h-10 sm:w-10 sm:rounded-xl">—</span>`;
                const name = escapeHtml(t.person_name ?? "");
                const rawName = t.person_name ?? "";
                return `<tr
                  data-transfer-id="${escapeHtml(t.id)}"
                  tabindex="0"
                  role="button"
                  aria-label="عرض تفاصيل التحويل لـ ${name}"
                  class="cursor-pointer border-b border-slate-100/90 outline-none transition hover:bg-emerald-50/45 focus-visible:bg-emerald-50/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600/35"
                >
                  <td class="px-2 py-3 align-middle sm:px-3">${thumb}</td>
                  <td class="min-w-0 max-w-[5.5rem] px-2 py-3 align-middle sm:max-w-[9rem] sm:px-3">
                    <span class="block truncate font-semibold text-slate-900" title="${escapeAttr(rawName)}">${name}</span>
                  </td>
                  <td class="whitespace-nowrap px-2 py-3 align-middle text-xs font-bold tabular-nums text-emerald-800 sm:px-3 sm:text-sm">${escapeHtml(formatMoney(t.amount))}</td>
                  <td class="min-w-0 px-2 py-3 align-middle sm:px-3">
                    <span class="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 sm:text-xs ${st.class}">${escapeHtml(st.label)}</span>
                  </td>
                  <td class="whitespace-nowrap px-2 py-3 align-middle text-[11px] text-slate-500 sm:px-3 sm:text-xs">${escapeHtml(formatDate(t.created_at))}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <p class="border-t border-slate-100/80 px-3 py-2 text-center text-[11px] text-slate-400 sm:hidden">لرؤية كل الأعمدة، مرّر الجدول أفقيًا.</p>
    </div>
    `;
}

function renderCards(container, rows, searchQuery) {
  if (!rows.length) {
    renderEmpty(container, searchQuery);
    return;
  }

  container.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      ${rows
        .map((t) => {
          const st = STATUS_META[t.status] ?? STATUS_META.pending;
          const name = escapeHtml(t.person_name ?? "");
          const img = t.image_url
            ? `<button type="button" class="group relative z-10 block w-full overflow-hidden rounded-2xl bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" data-preview="${encodeURIComponent(t.image_url)}" data-alt="${encodeURIComponent(t.person_name ?? "")}" aria-label="معاينة الصورة">
                 <img src="${escapeHtml(t.image_url)}" alt="" loading="lazy" decoding="async" class="aspect-video w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
                 <span class="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/35 to-transparent opacity-0 transition group-hover:opacity-100"></span>
               </button>`
            : `<div class="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">بدون صورة</div>`;
          return `
            <article
              data-transfer-id="${escapeHtml(t.id)}"
              tabindex="0"
              role="button"
              aria-label="عرض تفاصيل التحويل لـ ${name}"
              class="glass-card flex flex-col overflow-hidden rounded-3xl p-5 shadow-sm ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              ${img}
              <div class="mt-4 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="truncate text-base font-semibold text-slate-900">${name}</h3>
                  <p class="mt-1 text-2xl font-bold tracking-tight text-emerald-800">${escapeHtml(formatMoney(t.amount))}</p>
                  <p class="mt-2 text-xs text-slate-500">${escapeHtml(formatDate(t.created_at))}</p>
                </div>
                <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${st.class}">${escapeHtml(st.label)}</span>
              </div>
            </article>`;
        })
        .join("")}
    </div>
    <p class="mt-3 text-center text-xs text-slate-500 sm:text-start">اضغط البطاقة لعرض التفاصيل؛ زر الصورة يفتح المعاينة مباشرة.</p>`;
}

function renderView(container, rows, searchQuery) {
  interactiveRows = rows;
  if (viewMode === "table") renderTable(container, rows, searchQuery);
  else renderCards(container, rows, searchQuery);
}

function applySearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allRows;
  return allRows.filter((r) => String(r.person_name || "").toLowerCase().includes(q));
}

function getVisibleRows(query) {
  let rows = applySearch(query);
  if (statusFilter !== "all") {
    rows = rows.filter((r) => (r.status || "pending") === statusFilter);
  }
  if (statusSortDir === "asc") {
    rows = [...rows].sort((a, b) => statusRank(a) - statusRank(b));
  } else if (statusSortDir === "desc") {
    rows = [...rows].sort((a, b) => statusRank(b) - statusRank(a));
  }
  return rows;
}

function cycleStatusSort() {
  statusSortDir = statusSortDir === null ? "asc" : statusSortDir === "asc" ? "desc" : null;
}

function wireDelegatedInteractions(viewRoot, refreshView) {
  viewRoot.addEventListener("click", (e) => {
    const sortBtn = e.target.closest("#status-sort-btn");
    if (sortBtn && viewRoot.contains(sortBtn)) {
      e.preventDefault();
      e.stopPropagation();
      cycleStatusSort();
      refreshView?.();
      return;
    }
    const previewBtn = e.target.closest("[data-preview]");
    if (previewBtn && viewRoot.contains(previewBtn)) {
      e.stopPropagation();
      const src = decodeURIComponent(previewBtn.getAttribute("data-preview") || "");
      const alt = decodeURIComponent(previewBtn.getAttribute("data-alt") || "");
      openImageModal(src, alt);
      return;
    }
    const row = e.target.closest("[data-transfer-id]");
    if (!row || !viewRoot.contains(row)) return;
    const id = row.getAttribute("data-transfer-id");
    const t = interactiveRows.find((r) => r.id === id);
    if (t) openDetail(t);
  });

  viewRoot.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest("[data-transfer-id]");
    if (!row || !viewRoot.contains(row)) return;
    if (e.target.closest("[data-preview]")) return;
    e.preventDefault();
    const id = row.getAttribute("data-transfer-id");
    const t = interactiveRows.find((r) => r.id === id);
    if (t) openDetail(t);
  });
}

function syncViewToggleUi() {
  const btnTable = document.getElementById("view-table");
  const btnCards = document.getElementById("view-cards");
  const active = "focus-ring bg-emerald-800 text-white shadow-md ring-1 ring-emerald-900/20";
  const idle = "focus-ring text-slate-600 hover:bg-white/90 hover:text-slate-900";
  if (btnTable && btnCards) {
    btnTable.className = `rounded-xl px-4 py-2 text-xs font-bold transition ${viewMode === "table" ? active : idle}`;
    btnCards.className = `rounded-xl px-4 py-2 text-xs font-bold transition ${viewMode === "cards" ? active : idle}`;
    btnTable.setAttribute("aria-pressed", viewMode === "table" ? "true" : "false");
    btnCards.setAttribute("aria-pressed", viewMode === "cards" ? "true" : "false");
  }
}

/** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
async function syncAdminLoginNav(supabase) {
  const link = document.getElementById("nav-admin-login");
  if (!link) return;
  link.classList.add("hidden");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const email = session?.user?.email;
  if (!email) return;
  if (await isEmailAllowedForAdmin(supabase, email)) {
    link.classList.remove("hidden");
  }
}

async function loadTransfers(supabase, container, searchInput) {
  const { data, error } = await supabase
    .from("transfers")
    .select("id,person_name,amount,image_url,status,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    showToast("error", "تعذر تحميل البيانات");
    container.innerHTML = `<p class="text-center text-sm text-red-700">${escapeHtml(error.message)}</p>`;
    return;
  }

  allRows = data ?? [];
  const rows = getVisibleRows(searchInput?.value ?? "");
  renderView(container, rows, searchInput?.value ?? "");
  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = String(rows.length);
}

export async function initPublicPage() {
  const viewRoot = document.getElementById("transfers-view");
  const search = document.getElementById("search");
  const statusSelect = document.getElementById("status-filter");
  const countEl = document.getElementById("result-count");
  const supabase = await getSupabase();

  const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
  if (stored === "cards" || stored === "table") viewMode = stored;

  statusFilter = readStoredStatusFilter();
  if (statusSelect) statusSelect.value = statusFilter;

  if (!viewRoot) return;
  if (!supabase) {
    const cfgErr = getConfigError();
    viewRoot.innerHTML = `<p class="text-center text-sm text-red-700">${escapeHtml(cfgErr?.message ?? "راجع إعدادات Supabase.")}</p>`;
    return;
  }

  await syncAdminLoginNav(supabase);
  supabase.auth.onAuthStateChange(() => {
    void syncAdminLoginNav(supabase);
  });

  syncViewToggleUi();

  const refreshView = () => {
    const rows = getVisibleRows(search?.value ?? "");
    renderView(viewRoot, rows, search?.value ?? "");
    if (countEl) countEl.textContent = String(rows.length);
  };

  wireDelegatedInteractions(viewRoot, refreshView);

  if (viewMode === "table") setSkeletonTable(viewRoot);
  else setSkeletonCards(viewRoot);

  await loadTransfers(supabase, viewRoot, search);

  let searchDebounceTimer = 0;
  search?.addEventListener("input", () => {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => refreshView(), 200);
  });

  statusSelect?.addEventListener("change", () => {
    const v = statusSelect.value;
    statusFilter = VALID_STATUS_FILTERS.has(v) ? v : "sent";
    sessionStorage.setItem(STATUS_FILTER_STORAGE_KEY, statusFilter);
    refreshView();
  });

  document.getElementById("view-table")?.addEventListener("click", () => {
    viewMode = "table";
    sessionStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    syncViewToggleUi();
    refreshView();
  });
  document.getElementById("view-cards")?.addEventListener("click", () => {
    viewMode = "cards";
    sessionStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    syncViewToggleUi();
    refreshView();
  });

  if (channel) {
    await supabase.removeChannel(channel);
    channel = null;
  }

  let reloadDebounceTimer = 0;
  channel = supabase
    .channel("public-transfers")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transfers" },
      () => {
        window.clearTimeout(reloadDebounceTimer);
        reloadDebounceTimer = window.setTimeout(() => {
          void loadTransfers(supabase, viewRoot, search);
        }, 400);
      }
    )
    .subscribe();
}
