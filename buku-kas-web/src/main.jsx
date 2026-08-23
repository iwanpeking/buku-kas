import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./AuthGate.jsx";
import { supabase } from "./supabaseClient.js";
import "./index.css";

/* ------------------------------------------------------------------
   Shim window.storage — meniru API persistent storage yang dipakai
   di lingkungan Claude Artifacts, tapi disambungkan ke tabel Supabase
   (kv_store) yang PRIVAT per akun yang login (RLS membatasi ke
   owner_id = auth.uid()). Dipakai App.jsx untuk data pribadi:
   Uang Bulanan, Pengaturan, dan nama tanda tangan. Data project yang
   dibagikan ke tim disimpan lewat tabel `projects` secara langsung
   (lihat App.jsx), bukan lewat shim ini.
------------------------------------------------------------------ */
window.storage = {
  async get(key) {
    const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
    if (error) {
      console.error("storage.get error:", error);
      return null;
    }
    if (!data) return null;
    return { key, value: data.value };
  },
  async set(key, value) {
    const { data: userData } = await supabase.auth.getUser();
    const owner_id = userData?.user?.id;
    const { error } = await supabase
      .from("kv_store")
      .upsert({ key, value, owner_id, updated_at: new Date().toISOString() });
    if (error) {
      console.error("storage.set error:", error);
      throw error;
    }
    return { key, value };
  },
  async delete(key) {
    const { error } = await supabase.from("kv_store").delete().eq("key", key);
    if (error) {
      console.error("storage.delete error:", error);
      throw error;
    }
    return { key, deleted: true };
  },
  async list(prefix) {
    let query = supabase.from("kv_store").select("key");
    if (prefix) query = query.like("key", `${prefix}%`);
    const { data, error } = await query;
    if (error) {
      console.error("storage.list error:", error);
      return { keys: [], prefix };
    }
    return { keys: (data || []).map((r) => r.key), prefix };
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
