import { requireAdminSession, signOut } from "./auth.js";
import { getSupabase, getConfigError } from "./supabase.js";
import { uploadTransferImage, deleteTransferImageByUrl } from "./upload.js";
import { showToast, confirmDialog, setSkeletonTable, toggleSpinner } from "./ui.js";

const STATUS_OPTIONS = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "sent", label: "تم الإرسال" },
  { value: "delivered", label: "تم التسليم" },
];

let editingId = null;
let channel = null;
let listRows = [];

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
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function resetForm(form) {
  editingId = null;
  form.reset();
  const idInput = document.getElementById("edit-id");
  if (idInput) idInput.value = "";
  const preview = document.getElementById("image-preview");
  if (preview) {
    preview.innerHTML = "";
    preview.classList.add("hidden");
  }
  const title = document.getElementById("form-title");
  if (title) title.textContent = "إضافة تحويل";
}

async function renderList(supabase, tbody) {
  const { data, error } = await supabase
    .from("transfers")
    .select("id,person_name,amount,image_url,status,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-sm text-red-700">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  listRows = data ?? [];
  if (!listRows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500">لا توجد سجلات بعد.</td></tr>`;
    return;
  }

  tbody.innerHTML = listRows
    .map((t) => {
      const stLabel = STATUS_OPTIONS.find((o) => o.value === t.status)?.label ?? t.status;
      const thumb = t.image_url
        ? `<img src="${t.image_url}" alt="" loading="lazy" width="48" height="48" class="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200" />`
        : `<span class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500">—</span>`;
      return `<tr class="border-t border-slate-100/80 transition hover:bg-emerald-50/30">
        <td class="px-4 py-3">${thumb}</td>
        <td class="px-4 py-3 font-medium text-slate-900">${escapeHtml(t.person_name)}</td>
        <td class="px-4 py-3 font-semibold text-emerald-800">${formatMoney(t.amount)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(stLabel)}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${formatDate(t.created_at)}</td>
        <td class="px-4 py-3 text-left">
          <div class="flex flex-wrap gap-2 justify-end">
            <button type="button" class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" data-action="edit" data-id="${t.id}">تعديل</button>
            <button type="button" class="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700" data-action="delete" data-id="${t.id}">حذف</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      const row = listRows.find((r) => r.id === id);
      if (!row) return;

      if (action === "edit") {
        editingId = row.id;
        document.getElementById("edit-id").value = row.id;
        document.getElementById("person_name").value = row.person_name ?? "";
        document.getElementById("amount").value = String(row.amount ?? "");
        document.getElementById("status").value = row.status ?? "pending";
        document.getElementById("form-title").textContent = "تعديل تحويل";
        const preview = document.getElementById("image-preview");
        if (preview && row.image_url) {
          preview.classList.remove("hidden");
          preview.innerHTML = `<img src="${row.image_url}" alt="" class="max-h-40 rounded-2xl object-contain ring-1 ring-slate-200" />`;
        }
        document.getElementById("person_name")?.focus();
      }

      if (action === "delete") {
        const ok = await confirmDialog({
          title: "حذف التحويل؟",
          message: "لا يمكن التراجع عن هذا الإجراء.",
          confirmText: "حذف نهائي",
          cancelText: "إلغاء",
          variant: "danger",
        });
        if (!ok) return;
        toggleSpinner(document.getElementById("global-spinner"), true);
        const { error: delErr } = await supabase.from("transfers").delete().eq("id", row.id);
        toggleSpinner(document.getElementById("global-spinner"), false);
        if (delErr) {
          showToast("error", delErr.message);
          return;
        }
        await deleteTransferImageByUrl(row.image_url);
        showToast("success", "تم الحذف");
        await renderList(supabase, tbody);
      }
    });
  });
}

export async function initDashboard() {
  const ctx = await requireAdminSession();
  if (!ctx) return;
  if ("configMissing" in ctx && ctx.configMissing) {
    document.getElementById("config-banner")?.classList.remove("hidden");
    const err = getConfigError();
    showToast("error", err?.message ?? "أنشئ ملف js/configone.js من config.example.js");
    return;
  }

  const { supabase, session } = ctx;
  const userLabel = document.getElementById("user-email");
  if (userLabel) userLabel.textContent = session.user.email ?? "";

  const tbody = document.querySelector("#transfers-table tbody");
  const form = document.getElementById("transfer-form");
  const fileInput = document.getElementById("image");
  const spinner = document.getElementById("global-spinner");

  document.getElementById("logout-btn")?.addEventListener("click", () => signOut());
  document.getElementById("reset-form")?.addEventListener("click", () => resetForm(form));

  const skel = document.getElementById("table-skeleton");
  if (skel) {
    skel.classList.remove("hidden");
    setSkeletonTable(skel);
  }
  tbody.innerHTML = "";
  await renderList(supabase, tbody);
  if (skel) {
    skel.innerHTML = "";
    skel.classList.add("hidden");
  }

  if (channel) {
    await supabase.removeChannel(channel);
    channel = null;
  }
  channel = supabase
    .channel("admin-transfers")
    .on("postgres_changes", { event: "*", schema: "public", table: "transfers" }, async () => {
      await renderList(supabase, tbody);
    })
    .subscribe();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const person_name = document.getElementById("person_name").value.trim();
    const amount = Number(document.getElementById("amount").value);
    const status = document.getElementById("status").value;
    const file = fileInput?.files?.[0];

    if (!person_name) {
      showToast("error", "أدخل اسم الشخص");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      showToast("error", "أدخل مبلغاً صالحاً");
      return;
    }

    toggleSpinner(spinner, true);
    let image_url = null;
    const existing = editingId ? listRows.find((r) => r.id === editingId) : null;

    if (file) {
      const up = await uploadTransferImage(file);
      if ("error" in up) {
        toggleSpinner(spinner, false);
        showToast("error", up.error.message || "فشل رفع الصورة");
        return;
      }
      image_url = up.publicUrl;
      if (existing?.image_url && existing.image_url !== image_url) {
        await deleteTransferImageByUrl(existing.image_url);
      }
    } else if (existing?.image_url) {
      image_url = existing.image_url;
    }

    const payload = { person_name, amount, status, ...(image_url ? { image_url } : {}) };

    if (editingId) {
      const { error } = await supabase.from("transfers").update(payload).eq("id", editingId);
      toggleSpinner(spinner, false);
      if (error) {
        showToast("error", error.message);
        return;
      }
      showToast("success", "تم تحديث السجل");
    } else {
      const { error } = await supabase.from("transfers").insert({
        person_name,
        amount,
        status,
        image_url: image_url ?? null,
      });
      toggleSpinner(spinner, false);
      if (error) {
        showToast("error", error.message);
        return;
      }
      showToast("success", "تمت الإضافة");
    }

    resetForm(form);
    await renderList(supabase, tbody);
  });

  // expose status options if needed in future
  void STATUS_OPTIONS;
}
