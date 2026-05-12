import { getSupabase, getConfigError } from "./supabase.js";
import { showToast } from "./ui.js";

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
    window.location.href = "dashboard.html";
    return;
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) window.location.href = "dashboard.html";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    hint.textContent = "";
    hint.className = "min-h-[1.25rem] text-sm text-red-600";

    const emailRedirectTo = new URL("login.html", window.location.href).href;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.value.trim(),
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
