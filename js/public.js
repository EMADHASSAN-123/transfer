import { isEmailAllowedForAdmin } from "./auth.js";
import { getSupabase, getConfigError } from "./supabase.js";
import { showToast, setSkeletonCards, setSkeletonTable, openImageModal, openTransferDetailDialog } from "./ui.js";

const STATUS_META = {
  pending: { label: "قيد الانتظار", class: "bg-amber-50 text-amber-800 ring-amber-200/60" },
  sent: { label: "تم الإرسال", class: "bg-sky-50 text-sky-800 ring-sky-200/60" },
  delivered: { label: "تم التسليم", class: "bg-emerald-50 text-emerald-800 ring-emerald-200/60" },
};

const VIEW_STORAGE_KEY = "transfer_public_view";

let channel = null;
let allRows = [];
/** @type {"table"|"cards"} */
let viewMode = "table";
/** Snapshot of rows currently rendered (for delegated clicks) */
let interactiveRows = [];

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const filteredEmpty = Boolean(q) && allRows.length > 0;
  container.innerHTML = filteredEmpty
    ? `<div class="rounded-3xl border border-dashed border-slate-200 bg-white/50 p-12 text-center backdrop-blur">
        <p class="text-lg font-semibold text-slate-800">لا توجد نتائج</p>
        <p class="mt-2 text-sm text-slate-500">جرّب كلمات بحث أخرى أو امسح حقل البحث.</p>
      </div>`
    : `<div class="rounded-3xl border border-dashed border-slate-200 bg-white/50 p-12 text-center backdrop-blur">
        <p class="text-lg font-semibold text-slate-800">لا توجد تحويلات بعد</p>
        <p class="mt-2 text-sm text-slate-500">ستظهر السجلات هنا فور إضافتها من لوحة الإدارة.</p>
      </div>`;
}

function renderTable(container, rows, searchQuery) {
  if (!rows.length) {
    renderEmpty(container, searchQuery);
    return;
  }

  container.innerHTML = `
    <div class="glass-card overflow-hidden rounded-3xl shadow-soft ring-1 ring-white/40">
      <div class="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table class="w-full min-w-[720px] border-separate border-spacing-0 text-right text-sm">
          <thead>
            <tr class="bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200/60">
              <th scope="col" class="w-16 px-4 py-3 font-semibold"></th>
              <th scope="col" class="px-4 py-3 font-semibold">المستفيد</th>
              <th scope="col" class="px-4 py-3 font-semibold">المبلغ</th>
              <th scope="col" class="px-4 py-3 font-semibold">الحالة</th>
              <th scope="col" class="min-w-[9rem] px-4 py-3 font-semibold">التاريخ</th>
            </tr>
          </thead>
          <tbody class="bg-white/50">
            ${rows
              .map((t) => {
                const st = STATUS_META[t.status] ?? STATUS_META.pending;
                const thumb = t.image_url
                  ? `<img src="${escapeHtml(t.image_url)}" alt="" width="40" height="40" class="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-200/80" loading="lazy" decoding="async" />`
                  : `<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xs font-medium text-slate-400">—</span>`;
                const name = escapeHtml(t.person_name ?? "");
                return `<tr
                  data-transfer-id="${escapeHtml(t.id)}"
                  tabindex="0"
                  role="button"
                  aria-label="عرض تفاصيل التحويل لـ ${name}"
                  class="cursor-pointer border-b border-slate-100/90 outline-none transition hover:bg-emerald-50/45 focus-visible:bg-emerald-50/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600/35"
                >
                  <td class="px-4 py-3 align-middle">${thumb}</td>
                  <td class="px-4 py-3 align-middle font-semibold text-slate-900">${name}</td>
                  <td class="px-4 py-3 align-middle font-bold tabular-nums text-emerald-800">${escapeHtml(formatMoney(t.amount))}</td>
                  <td class="px-4 py-3 align-middle">
                    <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${st.class}">${escapeHtml(st.label)}</span>
                  </td>
                  <td class="px-4 py-3 align-middle text-xs text-slate-500">${escapeHtml(formatDate(t.created_at))}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
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

function wireDelegatedInteractions(viewRoot) {
  viewRoot.addEventListener("click", (e) => {
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
  const rows = applySearch(searchInput?.value ?? "");
  renderView(container, rows, searchInput?.value ?? "");
  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = String(rows.length);
}

export async function initPublicPage() {
  const viewRoot = document.getElementById("transfers-view");
  const search = document.getElementById("search");
  const countEl = document.getElementById("result-count");
  const supabase = await getSupabase();

  const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
  if (stored === "cards" || stored === "table") viewMode = stored;

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
  wireDelegatedInteractions(viewRoot);

  if (viewMode === "table") setSkeletonTable(viewRoot);
  else setSkeletonCards(viewRoot);

  await loadTransfers(supabase, viewRoot, search);

  const refreshView = () => {
    const rows = applySearch(search.value);
    renderView(viewRoot, rows, search.value);
    if (countEl) countEl.textContent = String(rows.length);
  };

  search?.addEventListener("input", () => {
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

  channel = supabase
    .channel("public-transfers")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transfers" },
      async () => {
        await loadTransfers(supabase, viewRoot, search);
      }
    )
    .subscribe();
}
