import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { LogOut, Loader2 } from "lucide-react";

const T = {
  paper: "#F6F1E4",
  paperDark: "#EEE6D2",
  ink: "#23281F",
  inkSoft: "#5B5A4C",
  line: "#D8CDAE",
  brass: "#A9812F",
  brassDark: "#7C5E20",
  white: "#FFFDF8",
  keluar: "#9C3B34",
};

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = belum dicek, null = belum login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
    } catch (err) {
      setError(err.message || "Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) {
    return (
      <div style={{ background: T.paper, minHeight: "100vh" }} className="flex items-center justify-center">
        <Loader2 className="animate-spin" style={{ color: T.brass }} size={28} />
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ background: T.paper, minHeight: "100vh" }} className="flex items-center justify-center p-4 bk-sans">
        <div className="w-full max-w-sm rounded-xl p-6" style={{ background: T.white, border: `1px solid ${T.line}` }}>
          <div className="text-center mb-5">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: T.brass, color: T.white }}
              className="flex items-center justify-center font-bold text-lg mx-auto mb-2">Rp</div>
            <h1 className="text-xl font-semibold" style={{ color: T.ink }}>Buku Kas</h1>
            <p className="text-xs mt-1" style={{ color: T.inkSoft }}>Masuk untuk mengakses data bersama</p>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md mb-3" style={{ border: `1px solid ${T.line}` }} />

            <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md mb-3" style={{ border: `1px solid ${T.line}` }} />

            {error && <p className="text-xs mb-3" style={{ color: T.keluar }}>{error}</p>}

            <button type="submit" disabled={busy}
              className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: T.brass, color: T.white }}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Masuk
            </button>
          </form>

          <p className="text-xs text-center mt-4" style={{ color: T.inkSoft }}>
            Belum punya akun? Hubungi admin untuk didaftarkan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="no-print flex items-center justify-end gap-3 px-4 py-1.5 text-xs"
        style={{ background: T.ink, color: T.paper }}>
        <span>{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-1 font-medium hover:opacity-80">
          <LogOut size={12} /> Keluar
        </button>
      </div>
      {children}
    </div>
  );
}
