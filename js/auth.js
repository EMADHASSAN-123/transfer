import { getSupabase, getConfigError } from "./supabase.js";
import { showToast } from "./ui.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isEmailAllowedForAdmin(supabase, email) {
  const trimmed = String(email ?? "").trim();
  if (!trimmed || !supabase) return false;
  const { data, error } = await supabase.rpc("is_allowed_admin_email", { p_email: trimmed });
  if (error) return false;
  return Boolean(data);
}

export async function initAuthPage() {
  const supabase = await getSupabase();
  const err = getConfigError();
  if (!supabase) {
    showToast("error", err?.message ?? "تعذر الاتصال بقاعدة البيانات.");
    return;
  }

  const form = document.getElementById("login-form");
  const email = document.getElementById("email");
  const submit = document.getElementById("submit-login");
  const hint = document.getElementById("login-hint");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const allowed = await isEmailAllowedForAdmin(supabase, session.user?.email ?? "");
    if (allowed) {
      window.location.href = "dashboard.html";
      return;
    }
    await supabase.auth.signOut();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) return;
    if (await isEmailAllowedForAdmin(supabase, session.user?.email ?? "")) {
      window.location.href = "dashboard.html";
    } else {
      await supabase.auth.signOut();
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    hint.textContent = "";
    hint.className = "min-h-[1.25rem] text-sm text-red-600";

    const addr = email.value.trim();
    const allowed = await isEmailAllowedForAdmin(supabase, addr);
    if (!allowed) {
      hint.textContent = "هذا البريد غير مسجّل كمسؤول. لا يمكن إرسال رابط الدخول.";
      showToast("error", "البريد غير مصرح");
      submit.disabled = false;
      return;
    }

    const emailRedirectTo = new URL("login.html", window.location.href).href;

    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    });

    if (error) {
      hint.textContent = error.message;
      showToast("error", "تعذر إرسال الرابط");
    } else {
      hint.className = "min-h-[1.25rem] text-sm text-emerald-800";
      hint.textContent =
        "تم إرسال الرابط إلى بريدك. افتح الرسالة واضغط الرابط لإكمال التسجيل أو الدخول، ثم ستُوجَّه تلقائيًا إلى لوحة الإدارة.";
      showToast("success", "تحقق من بريدك الإلكتروني");
    }
    submit.disabled = false;
  });
}

export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

/**
 * @returns {Promise<null | { configMissing: true } | { supabase: import("@supabase/supabase-js").SupabaseClient, session: import("@supabase/supabase-js").Session }>}
 */
export async function requireSession() {
  const supabase = await getSupabase();
  if (!supabase) return { configMissing: true };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return { supabase, session };
}

/**
 * Like requireSession, but only for emails listed in public.admin_emails.
 * @returns {Promise<null | { configMissing: true } | { supabase: import("@supabase/supabase-js").SupabaseClient, session: import("@supabase/supabase-js").Session }>}
 */
export async function requireAdminSession() {
  const supabase = await getSupabase();
  if (!supabase) return { configMissing: true };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  const addr = session.user?.email ?? "";
  if (!(await isEmailAllowedForAdmin(supabase, addr))) {
    await supabase.auth.signOut();
    window.location.href = "index.html";
    return null;
  }
  return { supabase, session };
}
