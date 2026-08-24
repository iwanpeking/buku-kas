import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import {
  Plus, Printer, Upload, CheckCircle2, ChevronLeft, ChevronRight,
  Trash2, X, Lock, Unlock, FolderPlus, Loader2, ArrowDownCircle,
  ArrowUpCircle, AlertCircle, Pencil, Camera, Download, DatabaseBackup, Eye, Settings2,
  ClipboardList, ArrowRightCircle, CheckCircle, Users
} from "lucide-react";

/* ---------------------------------------------------------
   TOKENS — "Buku Kas" ledger-book identity
   paper: warm ivory ledger page
   ink:   deep green-black, like old accounting ink
   masuk: ledger green (credit)
   keluar: brick ink-stamp red (debit)
   brass: seal/stamp accent for status + headers
--------------------------------------------------------- */
const T = {
  paper: "#F6F1E4",
  paperDark: "#EEE6D2",
  ink: "#23281F",
  inkSoft: "#5B5A4C",
  line: "#D8CDAE",
  masuk: "#2E6B4F",
  masukBg: "#E4EEE3",
  keluar: "#9C3B34",
  keluarBg: "#F3E4DF",
  brass: "#A9812F",
  brassDark: "#7C5E20",
  white: "#FFFDF8",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
.bk-display { font-family: 'Spectral', Georgia, serif; }
.bk-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
.bk-sans { font-family: 'Inter', system-ui, sans-serif; }
.bk-ruled { background-image: repeating-linear-gradient(${T.paper}, ${T.paper} 38px, ${T.line} 39px); }
@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  body, .bk-root { background: white !important; }
  .print-area { box-shadow: none !important; border: none !important; padding: 0 !important; }
}
.print-only { display: none; }
.stamp {
  transform: rotate(-6deg);
  border: 2.5px solid currentColor;
  border-radius: 6px;
  padding: 2px 10px;
  letter-spacing: 0.08em;
  display: inline-block;
}
`;

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */
const rupiah = (n) =>
  "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

const todayISO = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const monthLabel = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  return `${BULAN_ID[m - 1]} ${y}`;
};
const dateLabelID = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("Gagal membaca file"));
    r.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------
   MAIN APP
--------------------------------------------------------- */
export default function BukuKas() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("bulanan"); // 'bulanan' | 'project'
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(thisMonth());
  const [currentProjectId, setCurrentProjectId] = useState(null);

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState(null);
  const importRef = useRef(null);

  const [preparer, setPreparer] = useState("");
  const [checker, setChecker] = useState("");
  const [logoText, setLogoText] = useState("Rp");
  const [companyName, setCompanyName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [renamingProject, setRenamingProject] = useState(null);

  const [requests, setRequests] = useState([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [confirmDeleteRequestId, setConfirmDeleteRequestId] = useState(null);
  const [previewRequest, setPreviewRequest] = useState(null);
  const [requestProjectFilter, setRequestProjectFilter] = useState("");

  const [currentUser, setCurrentUser] = useState(null);
  const projectDataRef = useRef({}); // projectId -> {name,status,selesaiAt,entries,requests}
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [projectMembers, setProjectMembers] = useState([]);
  const [membersBusy, setMembersBusy] = useState(false);

  /* ---------- load persisted data ---------- */
  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        setCurrentUser(userData?.user || null);

        const [bulananRaw, sig, settings] = await Promise.all([
          safeGet("bk_entries_bulanan"),
          safeGet("bk_signatures"),
          safeGet("bk_settings"),
        ]);
        const bulananEntries = bulananRaw ? JSON.parse(bulananRaw.value) : [];

        const { data: projectRows, error: projErr } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false });
        if (projErr) throw projErr;

        const projectsList = [];
        const projectEntries = [];
        const projectRequests = [];
        (projectRows || []).forEach((row) => {
          const d = row.data || {};
          projectDataRef.current[row.id] = d;
          projectsList.push({
            id: row.id,
            name: d.name || "(tanpa nama)",
            status: d.status || "aktif",
            selesaiAt: d.selesaiAt || null,
            ownerId: row.owner_id,
            createdAt: Date.parse(row.created_at),
          });
          (d.entries || []).forEach((e) => projectEntries.push({ ...e, scope: "project", projectId: row.id }));
          (d.requests || []).forEach((r) => projectRequests.push({ ...r, projectId: row.id }));
        });

        setEntries([...bulananEntries, ...projectEntries]);
        setProjects(projectsList);
        setRequests(projectRequests);
        if (projectsList.length) setCurrentProjectId(projectsList[0].id);

        if (sig) {
          const s = JSON.parse(sig.value);
          setPreparer(s.preparer || "");
          setChecker(s.checker || "");
        }
        if (settings) {
          const st = JSON.parse(settings.value);
          setLogoText(st.logoText || "Rp");
          setCompanyName(st.companyName || "");
          setApiKey(st.apiKey || "");
        }
      } catch (err) {
        console.error("Gagal memuat data:", err);
        showToast("Gagal memuat data. Coba muat ulang halaman.", "error");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function safeGet(key) {
    try {
      return await window.storage.get(key, false);
    } catch {
      return null;
    }
  }

  // Simpan seluruh array entries (bulanan + project tercampur, sesuai bentuk lama).
  // Bagian bulanan disimpan privat; bagian project ditulis per-baris ke tabel `projects`
  // (hanya project yang datanya benar-benar berubah).
  const persistEntries = useCallback(async (next) => {
    setEntries(next);
    try {
      const bulanan = next.filter((e) => e.scope === "bulanan");
      await window.storage.set("bk_entries_bulanan", JSON.stringify(bulanan), false);

      const byProject = {};
      next.filter((e) => e.scope === "project").forEach((e) => {
        (byProject[e.projectId] ||= []).push(e);
      });
      for (const p of projects) {
        const newList = byProject[p.id] || [];
        const cached = projectDataRef.current[p.id] || {};
        const oldList = cached.entries || [];
        if (JSON.stringify(oldList) !== JSON.stringify(newList)) {
          const merged = { ...cached, entries: newList };
          projectDataRef.current[p.id] = merged;
          const { error } = await supabase
            .from("projects")
            .update({ data: merged, updated_at: new Date().toISOString() })
            .eq("id", p.id);
          if (error) throw error;
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan data ke penyimpanan.", "error");
    }
  }, [projects]);

  // Simpan seluruh array requests (permintaan dana), ditulis per-project ke tabel `projects`.
  const persistRequests = useCallback(async (next) => {
    setRequests(next);
    try {
      const byProject = {};
      next.forEach((r) => {
        (byProject[r.projectId] ||= []).push(r);
      });
      for (const p of projects) {
        const newList = byProject[p.id] || [];
        const cached = projectDataRef.current[p.id] || {};
        const oldList = cached.requests || [];
        if (JSON.stringify(oldList) !== JSON.stringify(newList)) {
          const merged = { ...cached, requests: newList };
          projectDataRef.current[p.id] = merged;
          const { error } = await supabase
            .from("projects")
            .update({ data: merged, updated_at: new Date().toISOString() })
            .eq("id", p.id);
          if (error) throw error;
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan data permintaan dana.", "error");
    }
  }, [projects]);

  const persistSignatures = useCallback(async (p, c) => {
    try {
      await window.storage.set("bk_signatures", JSON.stringify({ preparer: p, checker: c }), false);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const persistSettings = useCallback(async (logo, company, key) => {
    try {
      await window.storage.set("bk_settings", JSON.stringify({ logoText: logo, companyName: company, apiKey: key }), false);
    } catch (err) {
      console.error(err);
    }
  }, []);

  function showToast(msg, kind = "info") {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }

  /* ---------- backup / restore ---------- */
  function exportBackup() {
    const payload = { projects, entries, preparer, checker, exportedAt: new Date().toISOString(), version: 2 };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buku-kas-cadangan-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Cadangan data berhasil diunduh.");
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.projects)) {
          throw new Error("Format file tidak sesuai");
        }
        setPendingImport(parsed);
      } catch (err) {
        showToast("File cadangan tidak valid atau rusak.", "error");
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = "";
  }

  // Pemulihan cadangan: entri bulanan digabung ke data privat; setiap project dari
  // cadangan dibuat sebagai project BARU (milik akun yang sedang login) berikut
  // entri & permintaan dananya, supaya tidak bentrok dengan project yang sudah ada.
  async function confirmImport() {
    if (!pendingImport) return;
    try {
      const bulananFromBackup = (pendingImport.entries || []).filter((e) => e.scope === "bulanan");
      const existingBulanan = entries.filter((e) => e.scope === "bulanan");
      const mergedBulanan = [...existingBulanan, ...bulananFromBackup];
      await window.storage.set("bk_entries_bulanan", JSON.stringify(mergedBulanan), false);

      const newProjectsList = [];
      const newProjectEntries = [];
      for (const oldProj of pendingImport.projects || []) {
        const oldEntries = (pendingImport.entries || []).filter((e) => e.scope === "project" && e.projectId === oldProj.id);
        const data = {
          name: oldProj.name,
          status: oldProj.status || "aktif",
          selesaiAt: oldProj.selesaiAt || null,
          entries: [],
          requests: [],
        };
        const { data: row, error } = await supabase.from("projects").insert({ data }).select().single();
        if (error) throw error;
        projectDataRef.current[row.id] = { ...data, entries: oldEntries.map((e) => ({ ...e, projectId: row.id })) };
        const finalData = { ...data, entries: oldEntries.map((e) => ({ ...e, projectId: row.id })) };
        await supabase.from("projects").update({ data: finalData }).eq("id", row.id);
        newProjectsList.push({ id: row.id, name: data.name, status: data.status, selesaiAt: data.selesaiAt, ownerId: row.owner_id, createdAt: Date.parse(row.created_at) });
        newProjectEntries.push(...finalData.entries);
      }

      setEntries([...mergedBulanan, ...newProjectEntries]);
      setProjects((prev) => [...newProjectsList, ...prev]);

      const p = pendingImport.preparer || "";
      const c = pendingImport.checker || "";
      setPreparer(p);
      setChecker(c);
      await persistSignatures(p, c);
      setPendingImport(null);
      showToast("Data berhasil dipulihkan dari cadangan (project dari cadangan dibuat sebagai project baru).");
    } catch (err) {
      console.error(err);
      showToast("Gagal memulihkan cadangan.", "error");
    }
  }

  /* ---------- derived data ---------- */
  const currentProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) || null,
    [projects, currentProjectId]
  );
  const locked = mode === "project" && currentProject?.status === "selesai";

  const scopedEntries = useMemo(() => {
    let list;
    if (mode === "bulanan") {
      list = entries.filter((e) => e.scope === "bulanan" && e.bulan === currentMonth);
    } else {
      list = entries.filter((e) => e.scope === "project" && e.projectId === currentProjectId);
    }
    return [...list].sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.createdAt - b.createdAt));
  }, [entries, mode, currentMonth, currentProjectId]);

  const rows = useMemo(() => {
    let saldo = 0;
    return scopedEntries.map((e, i) => {
      saldo += (e.masuk || 0) - (e.keluar || 0);
      return { ...e, no: i + 1, saldo };
    });
  }, [scopedEntries]);

  const uniqueCenters = useMemo(() => {
    const set = new Set(entries.map((e) => (e.center || "").trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [entries]);

  const requestsFiltered = useMemo(() => {
    const list = requestProjectFilter ? requests.filter((r) => r.projectId === requestProjectFilter) : requests;
    return [...list].sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.createdAt - a.createdAt));
  }, [requests, requestProjectFilter]);

  const totals = useMemo(() => {
    const masuk = scopedEntries.reduce((s, e) => s + (e.masuk || 0), 0);
    const keluar = scopedEntries.reduce((s, e) => s + (e.keluar || 0), 0);
    return { masuk, keluar, sisa: masuk - keluar };
  }, [scopedEntries]);

  /* ---------- entry CRUD ---------- */
  function openNewEntry() {
    if (locked) return;
    setEditingEntry(null);
    setShowEntryModal(true);
  }
  function openEditEntry(entry) {
    if (locked) return;
    setEditingEntry(entry);
    setShowEntryModal(true);
  }
  async function saveEntry(data) {
    if (editingEntry) {
      const next = entries.map((e) => (e.id === editingEntry.id ? { ...e, ...data } : e));
      await persistEntries(next);
      showToast("Catatan diperbarui.");
    } else {
      const newEntry = {
        id: uid(),
        scope: mode,
        bulan: mode === "bulanan" ? currentMonth : null,
        projectId: mode === "project" ? currentProjectId : null,
        createdAt: Date.now(),
        ...data,
      };
      await persistEntries([...entries, newEntry]);
      showToast("Catatan ditambahkan.");
    }
    setShowEntryModal(false);
    setEditingEntry(null);
  }
  async function deleteEntry(id) {
    await persistEntries(entries.filter((e) => e.id !== id));
    showToast("Catatan dihapus.");
    setConfirmDeleteId(null);
  }

  /* ---------- project management ---------- */
  async function createProject(name) {
    try {
      const data = { name, status: "aktif", selesaiAt: null, entries: [], requests: [] };
      const { data: row, error } = await supabase.from("projects").insert({ data }).select().single();
      if (error) throw error;
      projectDataRef.current[row.id] = data;
      const newProj = { id: row.id, name, status: "aktif", selesaiAt: null, ownerId: row.owner_id, createdAt: Date.parse(row.created_at) };
      setProjects((prev) => [newProj, ...prev]);
      setCurrentProjectId(row.id);
      setShowProjectModal(false);
      showToast(`Project "${name}" dibuat.`);
    } catch (err) {
      console.error(err);
      showToast("Gagal membuat project.", "error");
    }
  }
  async function renameProject(id, newName) {
    try {
      const cached = projectDataRef.current[id] || {};
      const merged = { ...cached, name: newName };
      const { error } = await supabase.from("projects").update({ data: merged, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      projectDataRef.current[id] = merged;
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName } : p)));
      setRenamingProject(null);
      showToast("Nama project diperbarui.");
    } catch (err) {
      console.error(err);
      showToast("Gagal mengubah nama project.", "error");
    }
  }
  async function toggleProjectLock() {
    if (!currentProject) return;
    try {
      const willLock = currentProject.status !== "selesai";
      const selesaiAt = willLock ? todayISO() : null;
      const cached = projectDataRef.current[currentProject.id] || {};
      const merged = { ...cached, status: willLock ? "selesai" : "aktif", selesaiAt };
      const { error } = await supabase
        .from("projects")
        .update({ data: merged, updated_at: new Date().toISOString() })
        .eq("id", currentProject.id);
      if (error) throw error;
      projectDataRef.current[currentProject.id] = merged;
      setProjects((prev) => prev.map((p) => (p.id === currentProject.id ? { ...p, status: merged.status, selesaiAt } : p)));
      showToast(willLock ? "Project ditandai selesai & dikunci." : "Project dibuka kembali.");
    } catch (err) {
      console.error(err);
      showToast("Gagal mengubah status project.", "error");
    } finally {
      setConfirmLock(false);
    }
  }

  /* ---------- anggota project ---------- */
  async function openMembersModal() {
    if (!currentProject) return;
    setMembersBusy(true);
    setShowMembersModal(true);
    try {
      const { data, error } = await supabase.from("project_members").select("email").eq("project_id", currentProject.id);
      if (error) throw error;
      setProjectMembers((data || []).map((r) => r.email));
    } catch (err) {
      console.error(err);
      showToast("Gagal memuat daftar anggota.", "error");
    } finally {
      setMembersBusy(false);
    }
  }
  async function inviteMember(email) {
    if (!currentProject || !email.trim()) return;
    setMembersBusy(true);
    try {
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id: currentProject.id, email: email.trim().toLowerCase() });
      if (error) throw error;
      setProjectMembers((prev) => [...prev, email.trim().toLowerCase()]);
      showToast(`${email.trim()} ditambahkan ke project.`);
    } catch (err) {
      console.error(err);
      showToast(err.message?.includes("duplicate") ? "Orang ini sudah jadi anggota." : "Gagal menambahkan anggota.", "error");
    } finally {
      setMembersBusy(false);
    }
  }
  async function removeMember(email) {
    if (!currentProject) return;
    setMembersBusy(true);
    try {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", currentProject.id)
        .eq("email", email);
      if (error) throw error;
      setProjectMembers((prev) => prev.filter((e) => e !== email));
      showToast(`${email} dikeluarkan dari project.`);
    } catch (err) {
      console.error(err);
      showToast("Gagal mengeluarkan anggota.", "error");
    } finally {
      setMembersBusy(false);
    }
  }

  /* ---------- permintaan dana ---------- */
  function openNewRequest() {
    setEditingRequest(null);
    setShowRequestModal(true);
  }
  function openEditRequest(req) {
    setEditingRequest(req);
    setShowRequestModal(true);
  }
  async function saveRequest(data) {
    if (editingRequest) {
      const next = requests.map((r) => (r.id === editingRequest.id ? { ...r, ...data } : r));
      await persistRequests(next);
      showToast("Permintaan dana diperbarui.");
    } else {
      const newReq = { id: uid(), createdAt: Date.now(), entryId: null, ...data };
      await persistRequests([...requests, newReq]);
      showToast("Permintaan dana disimpan.");
    }
    setShowRequestModal(false);
    setEditingRequest(null);
  }
  async function deleteRequest(id) {
    await persistRequests(requests.filter((r) => r.id !== id));
    showToast("Permintaan dana dihapus.");
    setConfirmDeleteRequestId(null);
  }
  function requestTotal(req) {
    return (req.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0), 0);
  }
  async function convertRequestToExpense(req) {
    const project = projects.find((p) => p.id === req.projectId);
    const items = req.items || [];
    // Satu baris buku kas per item, supaya rincian belanja (nama, qty, harga)
    // langsung terlihat di laporan — bukan dirangkum jadi satu baris saja.
    const newEntries = items.map((it) => {
      const qty = Number(it.qty) || 0;
      const harga = Number(it.harga) || 0;
      return {
        id: uid(),
        scope: "project",
        bulan: null,
        projectId: req.projectId,
        createdAt: Date.now(),
        tanggal: req.tanggal,
        center: it.center || "",
        keterangan: `${it.nama} (${qty} x ${rupiah(harga)})${req.keterangan ? " — " + req.keterangan : ""}`,
        masuk: 0,
        keluar: qty * harga,
      };
    });
    await persistEntries([...entries, ...newEntries]);
    const nextReq = requests.map((r) => (r.id === req.id ? { ...r, entryId: newEntries.map((e) => e.id).join(",") } : r));
    await persistRequests(nextReq);
    showToast(`Dicatat sebagai ${newEntries.length} baris pengeluaran di project "${project?.name || ""}".`);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function buildReportHTML(opts = {}) {
    const { preview = false } = opts;
    const scopeTitle = mode === "bulanan" ? "Laporan Kas Bulanan" : "Laporan Kas Project";
    const scopeSub = mode === "bulanan" ? monthLabel(currentMonth) : (currentProject?.name || "");
    const isSelesai = mode === "project" && currentProject?.status === "selesai";
    const stampHtml = isSelesai
      ? `<div class="stamp">SELESAI<br><span style="font-size:9px;font-weight:400;letter-spacing:.03em">${dateLabelID(currentProject.selesaiAt)}</span></div>`
      : "";
    const bodyRows = rows.map((r, i) => `
      <tr style="background:${i % 2 ? "#FBF8F0" : "#FFFFFF"}">
        <td class="mono nowrap" style="text-align:center;color:#8a8672">${r.no}</td>
        <td class="mono nowrap">${dateLabelID(r.tanggal)}</td>
        <td>${escapeHtml(r.center || "—")}</td>
        <td>${escapeHtml(r.keterangan)}</td>
        <td class="mono nowrap amount" style="text-align:right;color:#2E6B4F;font-weight:500">${r.masuk ? rupiah(r.masuk) : "—"}</td>
        <td class="mono nowrap amount" style="text-align:right;color:#9C3B34;font-weight:500">${r.keluar ? rupiah(r.keluar) : "—"}</td>
        <td class="mono nowrap amount" style="text-align:right;font-weight:700">${rupiah(r.saldo)}</td>
      </tr>`).join("");
    const colCount = 7;
    return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<title>${escapeHtml(scopeTitle)} — ${escapeHtml(scopeSub)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body{font-family:'Inter',system-ui,sans-serif;color:#23281F;margin:0;background:#EDE7D6;}
  .sheet{max-width:800px;margin:28px auto;background:#FFFDF8;padding:44px 48px 40px;
    border:1px solid #D8CDAE;box-shadow:0 2px 18px rgba(35,40,31,.12);position:relative;}
  .mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;}
  .toolbar{max-width:800px;margin:16px auto 0;display:flex;justify-content:flex-end;}
  .printbtn{padding:9px 18px;background:#A9812F;color:#fff;border:none;border-radius:7px;
    font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;letter-spacing:.01em;
    box-shadow:0 2px 6px rgba(122,94,32,.35);}
  .printbtn:hover{background:#8f6d27;}
  header{text-align:center;border-bottom:3px double #A9812F;padding-bottom:18px;margin-bottom:20px;position:relative;}
  .mark{width:40px;height:40px;border-radius:8px;background:#A9812F;color:#fff;
    display:flex;align-items:center;justify-content:center;font-family:'Spectral',serif;
    font-weight:700;font-size:16px;margin:0 auto 10px;}
  .eyebrow{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#7C5E20;
    font-weight:600;margin:0 0 6px;}
  h1{font-family:'Spectral',serif;font-size:24px;font-weight:700;margin:0;color:#23281F;letter-spacing:.01em;}
  .scope{font-family:'Spectral',serif;font-size:14px;color:#5B5A4C;margin:5px 0 0;font-weight:400;font-style:italic;}
  .meta{font-size:10.5px;color:#8a8672;margin-top:10px;letter-spacing:.02em;}
  .stamp{border:2px solid #9C3B34;color:#9C3B34;border-radius:6px;padding:5px 12px;
    transform:rotate(-6deg);font-size:11px;font-weight:700;letter-spacing:.06em;
    text-align:center;line-height:1.3;position:absolute;top:0;right:0;}
  .summary{display:flex;gap:10px;margin-bottom:22px;}
  .sumcard{flex:1;border:1px solid #EAE2CB;border-radius:7px;padding:11px 14px;background:#FBF8F0;}
  .sumcard .lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:3px;}
  .sumcard .val{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:15px;}
  table{width:100%;table-layout:auto;border-collapse:collapse;font-size:12px;}
  th,td{overflow-wrap:break-word;word-break:break-word;}
  th.nowrap,td.nowrap{white-space:nowrap;}
  td.amount{font-size:11.5px;}
  thead{display:table-header-group;}
  tr{page-break-inside:avoid;}
  th{background:#F1E9D3;border-top:1px solid #C9BA92;border-bottom:2px solid #A9812F;
    text-align:left;padding:8px 8px;font-size:9.5px;text-transform:uppercase;
    letter-spacing:.06em;color:#7C5E20;font-weight:700;}
  td{padding:8px;border-bottom:1px solid #EAE2CB;font-size:12px;line-height:1.45;vertical-align:top;}
  th{vertical-align:middle;}
  tfoot td{border-top:2px solid #A9812F;border-bottom:none;font-weight:700;
    background:#F1E9D3;padding:10px;font-size:13px;}
  .empty{text-align:center;color:#8a8672;padding:28px;font-style:italic;}
  .sig{display:flex;justify-content:space-between;margin-top:62px;font-size:12.5px;
    page-break-inside:avoid;}
  .sig .col{width:42%;text-align:center;}
  .sig .name{border-top:1px solid #23281F;padding-top:6px;font-weight:600;min-height:18px;}
  .sig .lbl{color:#8a8672;font-size:10.5px;margin-top:3px;letter-spacing:.02em;}
  footer{margin-top:32px;padding-top:12px;border-top:1px solid #EAE2CB;
    font-size:9.5px;color:#a39d84;text-align:center;letter-spacing:.02em;}
  @media print{
    body{background:#fff;}
    .toolbar{display:none;}
    .sheet{box-shadow:none;border:none;margin:0;padding:0;max-width:100%;
      display:flex;flex-direction:column;min-height:263mm;}
    .sig{margin-top:auto !important;padding-top:40px;}
  }
</style></head>
<body>
  <div class="toolbar"${preview ? ' style="display:none"' : ""}><button class="printbtn" onclick="window.print()">🖨 Cetak / Simpan PDF</button></div>
  <div class="sheet">
    <header>
      ${stampHtml}
      <div class="mark">${escapeHtml(logoText)}</div>
      <p class="eyebrow">${escapeHtml(companyName || "Buku Kas")}</p>
      <h1>${escapeHtml(scopeSub)}</h1>
      <p class="scope">${escapeHtml(scopeTitle)}</p>
      <p class="meta">Dicetak: ${dateLabelID(todayISO())}</p>
    </header>
    <div class="summary">
      <div class="sumcard" style="border-color:#CFE0D5">
        <div class="lbl" style="color:#2E6B4F">Total Uang Masuk</div>
        <div class="val" style="color:#2E6B4F">${rupiah(totals.masuk)}</div>
      </div>
      <div class="sumcard" style="border-color:#E3CCC8">
        <div class="lbl" style="color:#9C3B34">Total Uang Keluar</div>
        <div class="val" style="color:#9C3B34">${rupiah(totals.keluar)}</div>
      </div>
      <div class="sumcard" style="border-color:#E0D3A9;background:#F6EFDC">
        <div class="lbl" style="color:#7C5E20">Sisa Uang</div>
        <div class="val" style="color:#7C5E20">${rupiah(totals.sisa)}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th class="nowrap">No</th><th class="nowrap">Tanggal</th>
        <th style="min-width:70px">Center</th>
        <th style="width:100%">Keterangan</th><th class="nowrap" style="text-align:right">Uang Masuk</th>
        <th class="nowrap" style="text-align:right">Uang Keluar</th><th class="nowrap" style="text-align:right">Saldo</th>
      </tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="${colCount}" class="empty">Belum ada catatan.</td></tr>`}</tbody>
      ${rows.length ? `<tfoot><tr>
        <td colspan="4">Total</td>
        <td class="nowrap" style="text-align:right;color:#2E6B4F">${rupiah(totals.masuk)}</td>
        <td class="nowrap" style="text-align:right;color:#9C3B34">${rupiah(totals.keluar)}</td>
        <td class="nowrap" style="text-align:right">${rupiah(totals.sisa)}</td>
      </tr></tfoot>` : ""}
    </table>
    <div class="sig">
      <div class="col">
        <div class="name">${escapeHtml(preparer) || "\u00A0"}</div>
        <div class="lbl">DIBUAT OLEH</div>
      </div>
      <div class="col">
        <div class="name">${escapeHtml(checker) || "\u00A0"}</div>
        <div class="lbl">DIPERIKSA OLEH</div>
      </div>
    </div>
    <footer>Buku Kas — dokumen ini dibuat secara digital</footer>
  </div>
</body></html>`;
  }

  function handlePrint() {
    persistSignatures(preparer, checker);
    const html = buildReportHTML();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const scopeName = mode === "bulanan" ? currentMonth : (currentProject?.name || "project").replace(/[^a-z0-9]+/gi, "-");
    a.download = `Laporan-Kas-${scopeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Laporan diunduh. Buka file lalu klik \"Cetak / Simpan PDF\".");
  }

  function buildRequestHTML(req, opts = {}) {
    const { preview = false } = opts;
    const project = projects.find((p) => p.id === req.projectId);
    const items = req.items || [];
    const grand = requestTotal(req);
    const bodyRows = items.map((it, i) => `
      <tr style="background:${i % 2 ? "#FBF8F0" : "#FFFFFF"}">
        <td class="mono nowrap" style="text-align:center;color:#8a8672">${i + 1}</td>
        <td>${escapeHtml(it.nama || "-")}</td>
        <td class="nowrap" style="color:#5B5A4C">${escapeHtml(it.center || "—")}</td>
        <td class="mono nowrap" style="text-align:center">${it.qty || 0}</td>
        <td class="mono nowrap" style="text-align:right">${rupiah(it.harga)}</td>
        <td class="mono nowrap amount" style="text-align:right;font-weight:600">${rupiah((Number(it.qty) || 0) * (Number(it.harga) || 0))}</td>
      </tr>`).join("");
    return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<title>Permintaan Dana — ${escapeHtml(project?.name || "")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body{font-family:'Inter',system-ui,sans-serif;color:#23281F;margin:0;background:#EDE7D6;}
  .sheet{max-width:800px;margin:28px auto;background:#FFFDF8;padding:44px 48px 40px;
    border:1px solid #D8CDAE;box-shadow:0 2px 18px rgba(35,40,31,.12);position:relative;}
  .mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;}
  .toolbar{max-width:800px;margin:16px auto 0;display:flex;justify-content:flex-end;}
  .printbtn{padding:9px 18px;background:#A9812F;color:#fff;border:none;border-radius:7px;
    font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;letter-spacing:.01em;
    box-shadow:0 2px 6px rgba(122,94,32,.35);}
  header{text-align:center;border-bottom:3px double #A9812F;padding-bottom:18px;margin-bottom:20px;position:relative;}
  .mark{width:40px;height:40px;border-radius:8px;background:#A9812F;color:#fff;
    display:flex;align-items:center;justify-content:center;font-family:'Spectral',serif;
    font-weight:700;font-size:16px;margin:0 auto 10px;}
  .eyebrow{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#7C5E20;font-weight:600;margin:0 0 6px;}
  h1{font-family:'Spectral',serif;font-size:24px;font-weight:700;margin:0;color:#23281F;letter-spacing:.01em;}
  .scope{font-family:'Spectral',serif;font-size:14px;color:#5B5A4C;margin:5px 0 0;font-weight:400;font-style:italic;}
  .meta{font-size:10.5px;color:#8a8672;margin-top:10px;letter-spacing:.02em;}
  .infobar{display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px;color:#5B5A4C;}
  table{width:100%;table-layout:auto;border-collapse:collapse;font-size:12px;}
  th,td{overflow-wrap:break-word;word-break:break-word;}
  th.nowrap,td.nowrap{white-space:nowrap;}
  thead{display:table-header-group;}
  tr{page-break-inside:avoid;}
  th{background:#F1E9D3;border-top:1px solid #C9BA92;border-bottom:2px solid #A9812F;
    text-align:left;padding:8px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#7C5E20;font-weight:700;}
  td{padding:8px;border-bottom:1px solid #EAE2CB;font-size:12px;line-height:1.45;vertical-align:top;}
  th{vertical-align:middle;}
  tfoot td{border-top:2px solid #A9812F;border-bottom:none;font-weight:700;background:#F1E9D3;padding:10px;font-size:13.5px;}
  .sig{display:flex;justify-content:space-between;margin-top:62px;font-size:12.5px;page-break-inside:avoid;}
  .sig .col{width:42%;text-align:center;}
  .sig .name{border-top:1px solid #23281F;padding-top:6px;font-weight:600;min-height:18px;}
  .sig .lbl{color:#8a8672;font-size:10.5px;margin-top:3px;letter-spacing:.02em;}
  footer{margin-top:32px;padding-top:12px;border-top:1px solid #EAE2CB;font-size:9.5px;color:#a39d84;text-align:center;letter-spacing:.02em;}
  @media print{
    body{background:#fff;}
    .toolbar{display:none;}
    .sheet{box-shadow:none;border:none;margin:0;padding:0;max-width:100%;display:flex;flex-direction:column;min-height:263mm;}
    .sig{margin-top:auto !important;padding-top:40px;}
  }
</style></head>
<body>
  <div class="toolbar"${preview ? ' style="display:none"' : ""}><button class="printbtn" onclick="window.print()">🖨 Cetak / Simpan PDF</button></div>
  <div class="sheet">
    <header>
      <div class="mark">${escapeHtml(logoText)}</div>
      <p class="eyebrow">${escapeHtml(companyName || "Buku Kas")}</p>
      <h1>${escapeHtml(project?.name || "-")}</h1>
      <p class="scope">Form Permintaan Dana</p>
      <p class="meta">Tanggal: ${dateLabelID(req.tanggal)}</p>
    </header>
    <div class="infobar">
      <span>Diminta oleh: <b style="color:#23281F">${escapeHtml(req.peminta || "-")}</b></span>
      <span>Keperluan: <b style="color:#23281F">${escapeHtml(req.keterangan || "-")}</b></span>
    </div>
    <table>
      <thead><tr>
        <th class="nowrap" style="width:34px">No</th>
        <th style="width:100%">Nama Part / Keterangan</th>
        <th class="nowrap">Center</th>
        <th class="nowrap" style="text-align:center">Qty</th>
        <th class="nowrap" style="text-align:right">Harga</th>
        <th class="nowrap" style="text-align:right">Total Harga</th>
      </tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="6" style="text-align:center;color:#8a8672;padding:24px;font-style:italic">Belum ada item.</td></tr>`}</tbody>
      ${items.length ? `<tfoot><tr>
        <td colspan="5">Grand Total</td>
        <td class="nowrap" style="text-align:right">${rupiah(grand)}</td>
      </tr></tfoot>` : ""}
    </table>
    <div class="sig">
      <div class="col">
        <div class="name">${escapeHtml(preparer) || "\u00A0"}</div>
        <div class="lbl">DIAJUKAN OLEH</div>
      </div>
      <div class="col">
        <div class="name">${escapeHtml(checker) || "\u00A0"}</div>
        <div class="lbl">DISETUJUI OLEH</div>
      </div>
    </div>
    <footer>Buku Kas — dokumen ini dibuat secara digital</footer>
  </div>
</body></html>`;
  }

  function downloadRequest(req) {
    persistSignatures(preparer, checker);
    const project = projects.find((p) => p.id === req.projectId);
    const html = buildRequestHTML(req);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const scopeName = (project?.name || "project").replace(/[^a-z0-9]+/gi, "-");
    a.download = `Permintaan-Dana-${scopeName}-${req.tanggal}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Form permintaan dana diunduh. Buka file lalu klik \"Cetak / Simpan PDF\".");
  }

  if (!ready) {
    return (
      <div style={{ background: T.paper, minHeight: 400 }} className="flex items-center justify-center p-10">
        <Loader2 className="animate-spin" style={{ color: T.brass }} size={28} />
      </div>
    );
  }

  return (
    <div className="bk-root bk-sans" style={{ background: T.paper, minHeight: 500, color: T.ink }}>
      <style>{FONTS}</style>

      {/* HEADER */}
      <div className="no-print" style={{ borderBottom: `3px double ${T.brassDark}`, background: T.paperDark }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettingsModal(true)} title="Klik untuk ganti logo"
              style={{ width: 40, height: 40, borderRadius: 8, background: T.brass, color: T.white }}
              className="flex items-center justify-center bk-display font-bold text-lg flex-shrink-0 hover:opacity-80 overflow-hidden"
            >
              {logoText}
            </button>
            <div>
              <h1 className="bk-display text-2xl sm:text-3xl font-semibold" style={{ color: T.ink }}>
                {companyName || "Buku Kas"}
              </h1>
              <p className="text-xs sm:text-sm" style={{ color: T.inkSoft }}>
                Catatan uang masuk &amp; keluar — bulanan dan per-project
              </p>
            </div>
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => setShowSettingsModal(true)}
                title="Pengaturan logo & nama usaha"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-medium"
                style={{ border: `1px solid ${T.line}`, color: T.inkSoft, background: T.white }}>
                <Settings2 size={13} /> <span className="hidden sm:inline">Pengaturan</span>
              </button>
              <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
              <button onClick={() => importRef.current?.click()}
                title="Pulihkan data dari file cadangan"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-medium"
                style={{ border: `1px solid ${T.line}`, color: T.inkSoft, background: T.white }}>
                <DatabaseBackup size={13} /> <span className="hidden sm:inline">Pulihkan</span>
              </button>
              <button onClick={exportBackup}
                title="Unduh cadangan data (disarankan sebelum ada pembaruan aplikasi)"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-medium"
                style={{ border: `1px solid ${T.brass}`, color: T.brassDark, background: T.white }}>
                <Download size={13} /> <span className="hidden sm:inline">Cadangkan Data</span>
              </button>
            </div>
          </div>

          {/* mode tabs */}
          <div className="flex gap-1 mt-5">
            {[
              { key: "bulanan", label: "Uang Bulanan" },
              { key: "project", label: "Uang Project" },
              { key: "permintaan", label: "Permintaan Dana" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className="bk-sans font-medium text-sm px-4 py-2 rounded-t-md transition-colors"
                style={{
                  background: mode === t.key ? T.paper : "transparent",
                  color: mode === t.key ? T.ink : T.inkSoft,
                  border: mode === t.key ? `1px solid ${T.line}` : "1px solid transparent",
                  borderBottom: mode === t.key ? `1px solid ${T.paper}` : "none",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6">
        {/* SCOPE SELECTOR */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
          {mode === "bulanan" ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}
                className="p-2 rounded-md hover:bg-black/5" style={{ border: `1px solid ${T.line}` }}>
                <ChevronLeft size={16} />
              </button>
              <div className="bk-display text-lg font-semibold min-w-[160px] text-center" style={{ color: T.ink }}>
                {monthLabel(currentMonth)}
              </div>
              <button onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))}
                className="p-2 rounded-md hover:bg-black/5" style={{ border: `1px solid ${T.line}` }}>
                <ChevronRight size={16} />
              </button>
            </div>
          ) : mode === "project" ? (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={currentProjectId || ""}
                onChange={(e) => setCurrentProjectId(e.target.value)}
                className="bk-sans text-sm px-3 py-2 rounded-md"
                style={{ border: `1px solid ${T.line}`, background: T.white, color: T.ink, minWidth: 200 }}
              >
                {projects.length === 0 && <option value="">Belum ada project</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.status === "selesai" ? "— Selesai" : ""}
                  </option>
                ))}
              </select>
              {currentProject && (
                <button
                  onClick={() => setRenamingProject(currentProject)}
                  title="Ubah nama project"
                  className="p-2 rounded-md" style={{ border: `1px solid ${T.line}`, color: T.inkSoft, background: T.white }}
                >
                  <Pencil size={15} />
                </button>
              )}
              <button
                onClick={() => setShowProjectModal(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md font-medium"
                style={{ border: `1px solid ${T.line}`, color: T.ink, background: T.white }}
              >
                <FolderPlus size={15} /> Project Baru
              </button>
              {currentProject && (
                <button
                  onClick={() => setConfirmLock(true)}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md font-medium"
                  style={{
                    border: `1px solid ${currentProject.status === "selesai" ? T.brass : T.masuk}`,
                    color: currentProject.status === "selesai" ? T.brassDark : T.masuk,
                    background: T.white,
                  }}
                >
                  {currentProject.status === "selesai" ? <Unlock size={15} /> : <Lock size={15} />}
                  {currentProject.status === "selesai" ? "Buka Kunci" : "Tandai Selesai"}
                </button>
              )}
              {currentProject && currentUser && currentProject.ownerId === currentUser.id && (
                <button
                  onClick={openMembersModal}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md font-medium"
                  style={{ border: `1px solid ${T.line}`, color: T.ink, background: T.white }}
                >
                  <Users size={15} /> Kelola Anggota
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={requestProjectFilter}
                onChange={(e) => setRequestProjectFilter(e.target.value)}
                className="bk-sans text-sm px-3 py-2 rounded-md"
                style={{ border: `1px solid ${T.line}`, background: T.white, color: T.ink, minWidth: 200 }}
              >
                <option value="">Semua Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            {mode === "permintaan" ? (
              <button
                onClick={openNewRequest}
                disabled={projects.length === 0}
                title={projects.length === 0 ? "Buat project terlebih dahulu di tab Uang Project" : ""}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md font-medium disabled:opacity-40"
                style={{ background: T.brass, color: T.white }}
              >
                <Plus size={16} /> Buat Permintaan Dana
              </button>
            ) : (
              <>
                <button
                  onClick={openNewEntry}
                  disabled={locked || (mode === "project" && !currentProjectId)}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md font-medium disabled:opacity-40"
                  style={{ background: T.brass, color: T.white }}
                >
                  <Plus size={16} /> Tambah Catatan
                </button>
                <button
                  onClick={() => { persistSignatures(preparer, checker); setShowPreview(true); }}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md font-medium"
                  style={{ border: `1px solid ${T.line}`, color: T.ink, background: T.white }}
                >
                  <Eye size={16} /> Pratinjau
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md font-medium"
                  style={{ border: `1px solid ${T.ink}`, color: T.ink, background: "transparent" }}
                >
                  <Printer size={16} /> Cetak Laporan
                </button>
              </>
            )}
          </div>
        </div>

        {mode !== "permintaan" && locked && (
          <div className="no-print flex items-start gap-2 text-sm px-4 py-3 rounded-md mb-5"
            style={{ background: T.brass + "22", border: `1px solid ${T.brass}`, color: T.brassDark }}>
            <Lock size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Project <b>{currentProject?.name}</b> sudah ditandai <b>selesai</b> pada {dateLabelID(currentProject?.selesaiAt)}.
              Data dikunci agar tidak dilaporkan dua kali. Klik "Buka Kunci" jika perlu mengoreksi.
            </span>
          </div>
        )}

        {mode === "permintaan" ? (
          <div>
            <div className="rounded-md overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.white }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: T.paperDark, borderBottom: `2px solid ${T.brassDark}` }}>
                      <Th style={{ width: 44 }}>No</Th>
                      <Th style={{ width: 100 }}>Tanggal</Th>
                      <Th>Project</Th>
                      <Th>Keperluan</Th>
                      <Th style={{ width: 90 }}>Item</Th>
                      <Th align="right">Grand Total</Th>
                      <Th style={{ width: 110 }}>Status</Th>
                      <Th style={{ width: 130 }}></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsFiltered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-sm" style={{ color: T.inkSoft }}>
                          {projects.length === 0
                            ? "Buat project dulu di tab \"Uang Project\" sebelum membuat permintaan dana."
                            : "Belum ada permintaan dana."}
                        </td>
                      </tr>
                    )}
                    {requestsFiltered.map((r, i) => {
                      const project = projects.find((p) => p.id === r.projectId);
                      const grand = requestTotal(r);
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}
                          className="hover:bg-black/[0.02] cursor-pointer"
                          onClick={() => openEditRequest(r)}>
                          <Td className="bk-mono">{i + 1}</Td>
                          <Td className="bk-mono">{dateLabelID(r.tanggal)}</Td>
                          <Td>{project?.name || "-"}</Td>
                          <Td>{r.keterangan || "-"}</Td>
                          <Td>{(r.items || []).length} item</Td>
                          <Td align="right" className="bk-mono font-semibold">{rupiah(grand)}</Td>
                          <Td>
                            {r.entryId ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{ background: T.masukBg, color: T.masuk }}>
                                <CheckCircle size={11} /> Dicatat
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: T.inkSoft }}>Belum dicatat</span>
                            )}
                          </Td>
                          <Td align="right">
                            <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                              {!r.entryId && (
                                <button onClick={() => convertRequestToExpense(r)} title="Catat sebagai pengeluaran di Uang Project"
                                  className="p-1.5 rounded hover:bg-black/5">
                                  <ArrowRightCircle size={14} style={{ color: T.brassDark }} />
                                </button>
                              )}
                              <button onClick={() => downloadRequest(r)} title="Cetak"
                                className="p-1.5 rounded hover:bg-black/5">
                                <Printer size={14} style={{ color: T.inkSoft }} />
                              </button>
                              <button onClick={() => setConfirmDeleteRequestId(r.id)} title="Hapus"
                                className="p-1.5 rounded hover:bg-black/5">
                                <Trash2 size={14} style={{ color: T.keluar }} />
                              </button>
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
        <>
        {/* PRINT-ONLY REPORT HEADER */}
        <div className="print-only print-area">
          <div className="text-center mb-4">
            <h1 className="bk-display text-2xl font-bold">Laporan Kas {mode === "bulanan" ? "Bulanan" : "Project"}</h1>
            <p className="text-sm">
              {mode === "bulanan" ? monthLabel(currentMonth) : currentProject?.name}
              {mode === "project" && currentProject?.status === "selesai" && ` — Selesai (${dateLabelID(currentProject.selesaiAt)})`}
            </p>
            <p className="text-xs" style={{ color: T.inkSoft }}>Dicetak: {dateLabelID(todayISO())}</p>
          </div>
        </div>

        {/* TABLE */}
        <div className="print-area rounded-md overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.white }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.paperDark, borderBottom: `2px solid ${T.brassDark}` }}>
                  <Th style={{ width: 44 }}>No</Th>
                  <Th style={{ width: 100 }}>Tanggal</Th>
                  <Th style={{ width: 120 }}>Center</Th>
                  {mode === "project" && <Th>Project</Th>}
                  <Th>Keterangan</Th>
                  <Th align="right">Uang Masuk</Th>
                  <Th align="right">Uang Keluar</Th>
                  <Th align="right">Saldo</Th>
                  <Th className="no-print" style={{ width: 76 }}></Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-sm" style={{ color: T.inkSoft }}>
                      Belum ada catatan{mode === "bulanan" ? " di bulan ini." : " di project ini."}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}
                    className="hover:bg-black/[0.02] cursor-pointer"
                    onClick={() => openEditEntry(r)}>
                    <Td className="bk-mono">{r.no}</Td>
                    <Td className="bk-mono">{dateLabelID(r.tanggal)}</Td>
                    <Td style={{ color: T.inkSoft }}>{r.center || "—"}</Td>
                    {mode === "project" && <Td>{projects.find((p) => p.id === r.projectId)?.name || "-"}</Td>}
                    <Td>{r.keterangan}</Td>
                    <Td align="right" className="bk-mono" style={{ color: T.masuk }}>
                      {r.masuk ? rupiah(r.masuk) : "—"}
                    </Td>
                    <Td align="right" className="bk-mono" style={{ color: T.keluar }}>
                      {r.keluar ? rupiah(r.keluar) : "—"}
                    </Td>
                    <Td align="right" className="bk-mono font-semibold">{rupiah(r.saldo)}</Td>
                    <Td className="no-print" align="right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                        disabled={locked}
                        className="p-1.5 rounded hover:bg-black/5 disabled:opacity-30"
                      >
                        <Trash2 size={14} style={{ color: T.keluar }} />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${T.brassDark}`, background: T.paperDark }}>
                    <Td colSpan={mode === "project" ? 5 : 4} className="font-semibold">Total</Td>
                    <Td align="right" className="bk-mono font-bold" style={{ color: T.masuk }}>{rupiah(totals.masuk)}</Td>
                    <Td align="right" className="bk-mono font-bold" style={{ color: T.keluar }}>{rupiah(totals.keluar)}</Td>
                    <Td align="right" className="bk-mono font-bold">{rupiah(totals.sisa)}</Td>
                    <Td className="no-print"></Td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        {rows.length > 0 && (
          <div className="no-print grid grid-cols-3 gap-3 mt-4">
            <SummaryCard icon={<ArrowDownCircle size={16} />} label="Uang Masuk" value={rupiah(totals.masuk)} color={T.masuk} bg={T.masukBg} />
            <SummaryCard icon={<ArrowUpCircle size={16} />} label="Uang Keluar" value={rupiah(totals.keluar)} color={T.keluar} bg={T.keluarBg} />
            <SummaryCard icon={<CheckCircle2 size={16} />} label="Sisa Uang" value={rupiah(totals.sisa)} color={T.brassDark} bg={T.brass + "22"} />
          </div>
        )}

        {/* SIGNATURES */}
        <div className="print-area mt-10 pt-4">
          <div className="no-print grid grid-cols-2 gap-4 max-w-md mb-2">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Dibuat oleh</label>
              <input value={preparer} onChange={(e) => setPreparer(e.target.value)}
                onBlur={() => persistSignatures(preparer, checker)}
                placeholder="Nama" className="w-full text-sm px-2 py-1.5 rounded-md"
                style={{ border: `1px solid ${T.line}` }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Diperiksa oleh</label>
              <input value={checker} onChange={(e) => setChecker(e.target.value)}
                onBlur={() => persistSignatures(preparer, checker)}
                placeholder="Nama" className="w-full text-sm px-2 py-1.5 rounded-md"
                style={{ border: `1px solid ${T.line}` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mt-10 text-sm">
            <div className="text-center">
              <div style={{ height: 60 }}></div>
              <div style={{ borderTop: `1px solid ${T.ink}`, paddingTop: 4 }}>
                {preparer || "................................."}
              </div>
              <div style={{ color: T.inkSoft }} className="text-xs mt-1">Dibuat oleh</div>
            </div>
            <div className="text-center">
              <div style={{ height: 60 }}></div>
              <div style={{ borderTop: `1px solid ${T.ink}`, paddingTop: 4 }}>
                {checker || "................................."}
              </div>
              <div style={{ color: T.inkSoft }} className="text-xs mt-1">Diperiksa oleh</div>
            </div>
          </div>
        </div>
        </>
        )}
      </div>


      {toast && (
        <div className="no-print fixed bottom-4 right-4 px-4 py-2.5 rounded-md text-sm shadow-lg flex items-center gap-2"
          style={{
            background: toast.kind === "error" ? T.keluar : T.ink,
            color: T.white,
          }}>
          {toast.kind === "error" && <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {showEntryModal && (
        <EntryModal
          initial={editingEntry}
          existingCenters={uniqueCenters}
          apiKey={apiKey}
          onClose={() => { setShowEntryModal(false); setEditingEntry(null); }}
          onSave={saveEntry}
        />
      )}
      {showProjectModal && (
        <ProjectModal onClose={() => setShowProjectModal(false)} onCreate={createProject} />
      )}
      {renamingProject && (
        <RenameProjectModal
          project={renamingProject}
          onClose={() => setRenamingProject(null)}
          onSave={renameProject}
        />
      )}
      {showSettingsModal && (
        <SettingsModal
          logoText={logoText}
          companyName={companyName}
          apiKey={apiKey}
          onClose={() => setShowSettingsModal(false)}
          onSave={(logo, company, key) => {
            setLogoText(logo);
            setCompanyName(company);
            setApiKey(key);
            persistSettings(logo, company, key);
            setShowSettingsModal(false);
            showToast("Pengaturan disimpan.");
          }}
        />
      )}
      {confirmDeleteId && (
        <ConfirmModal
          title="Hapus Catatan"
          message="Catatan ini akan dihapus permanen. Lanjutkan?"
          confirmLabel="Hapus"
          danger
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteEntry(confirmDeleteId)}
        />
      )}
      {confirmLock && currentProject && (
        <ConfirmModal
          title={currentProject.status === "selesai" ? "Buka Kunci Project" : "Tandai Project Selesai"}
          message={
            currentProject.status === "selesai"
              ? "Project ini akan dibuka kembali dan bisa diedit. Lanjutkan?"
              : "Data project akan dikunci agar tidak dilaporkan dua kali. Lanjutkan?"
          }
          confirmLabel={currentProject.status === "selesai" ? "Buka Kunci" : "Tandai Selesai"}
          onCancel={() => setConfirmLock(false)}
          onConfirm={toggleProjectLock}
        />
      )}
      {showMembersModal && currentProject && (
        <MembersModal
          projectName={currentProject.name}
          members={projectMembers}
          busy={membersBusy}
          onInvite={inviteMember}
          onRemove={removeMember}
          onClose={() => setShowMembersModal(false)}
        />
      )}
      {pendingImport && (
        <ConfirmModal
          title="Pulihkan Data"
          message={`File cadangan berisi ${pendingImport.entries?.length || 0} catatan dan ${pendingImport.projects?.length || 0} project. Ini akan MENGGANTI seluruh data yang ada saat ini. Lanjutkan?`}
          confirmLabel="Pulihkan"
          danger
          onCancel={() => setPendingImport(null)}
          onConfirm={confirmImport}
        />
      )}
      {confirmDeleteRequestId && (
        <ConfirmModal
          title="Hapus Permintaan Dana"
          message="Permintaan dana ini akan dihapus permanen. Lanjutkan?"
          confirmLabel="Hapus"
          danger
          onCancel={() => setConfirmDeleteRequestId(null)}
          onConfirm={() => deleteRequest(confirmDeleteRequestId)}
        />
      )}
      {showRequestModal && (
        <RequestModal
          initial={editingRequest}
          projects={projects}
          existingCenters={uniqueCenters}
          defaultProjectId={requestProjectFilter || projects[0]?.id || ""}
          onClose={() => { setShowRequestModal(false); setEditingRequest(null); }}
          onSave={saveRequest}
        />
      )}
      {showPreview && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6"
          style={{ background: "rgba(35,40,31,0.6)" }} onClick={() => setShowPreview(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="bk-sans w-full h-full sm:max-w-3xl sm:h-[92vh] rounded-lg overflow-hidden flex flex-col"
            style={{ background: "#EDE7D6" }}>
            <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
              style={{ background: T.ink, color: T.white }}>
              <span className="text-sm font-medium">Pratinjau Laporan</span>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold"
                  style={{ background: T.brass, color: T.white }}>
                  <Download size={13} /> Unduh &amp; Cetak
                </button>
                <button onClick={() => setShowPreview(false)} className="p-1.5 rounded hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe title="Pratinjau Laporan" srcDoc={buildReportHTML({ preview: true })} className="flex-1 w-full border-0" />
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(35,40,31,0.5)" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        className="bk-sans w-full max-w-xs rounded-xl p-5"
        style={{ background: T.paper, border: `1px solid ${T.line}` }}>
        <h3 className="bk-display text-base font-semibold mb-2" style={{ color: T.ink }}>{title}</h3>
        <p className="text-sm mb-4" style={{ color: T.inkSoft }}>{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-md text-sm font-medium"
            style={{ border: `1px solid ${T.line}`, color: T.ink }}>
            Batal
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2 rounded-md text-sm font-medium"
            style={{ background: danger ? T.keluar : T.brass, color: T.white }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   SUBCOMPONENTS
--------------------------------------------------------- */
function Th({ children, align = "left", style, className = "" }) {
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide ${className}`}
      style={{ textAlign: align, color: T.brassDark, ...style }}>
      {children}
    </th>
  );
}
function Td({ children, align = "left", style, className = "", colSpan }) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2.5 ${className}`} style={{ textAlign: align, ...style }}>
      {children}
    </td>
  );
}

function SummaryCard({ icon, label, value, color, bg }) {
  return (
    <div className="rounded-md p-3" style={{ background: bg }}>
      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
        {icon} {label}
      </div>
      <div className="bk-mono text-lg font-bold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function ProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <ModalShell onClose={onClose} title="Project Baru">
      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Nama Project</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        placeholder="mis. Renovasi Rumah Pak Budi"
        className="w-full text-sm px-3 py-2 rounded-md mb-4" style={{ border: `1px solid ${T.line}` }} />
      <button
        onClick={() => name.trim() && onCreate(name.trim())}
        disabled={!name.trim()}
        className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-40"
        style={{ background: T.brass, color: T.white }}
      >
        Buat Project
      </button>
    </ModalShell>
  );
}

function RenameProjectModal({ project, onClose, onSave }) {
  const [name, setName] = useState(project.name);
  return (
    <ModalShell onClose={onClose} title="Ubah Nama Project">
      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Nama Project</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-md mb-4" style={{ border: `1px solid ${T.line}` }} />
      <button
        onClick={() => name.trim() && onSave(project.id, name.trim())}
        disabled={!name.trim()}
        className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-40"
        style={{ background: T.brass, color: T.white }}
      >
        Simpan
      </button>
    </ModalShell>
  );
}

function SettingsModal({ logoText, companyName, apiKey, onClose, onSave }) {
  const [logo, setLogo] = useState(logoText);
  const [company, setCompany] = useState(companyName);
  const [key, setKey] = useState(apiKey || "");
  return (
    <ModalShell onClose={onClose} title="Pengaturan Laporan">
      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>
        Teks Logo (maks. 3 karakter, mis. "Rp", "CV", inisial)
      </label>
      <input value={logo} maxLength={3} onChange={(e) => setLogo(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-md mb-4" style={{ border: `1px solid ${T.line}` }} />
      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>
        Nama Usaha / Judul Laporan (kosongkan untuk pakai "Buku Kas")
      </label>
      <input value={company} onChange={(e) => setCompany(e.target.value)}
        placeholder="mis. CV Maju Bersama"
        className="w-full text-sm px-3 py-2 rounded-md mb-4" style={{ border: `1px solid ${T.line}` }} />
      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>
        Anthropic API Key (opsional — untuk fitur baca nota otomatis/OCR)
      </label>
      <input type="password" value={key} onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-..."
        className="w-full text-sm px-3 py-2 rounded-md mb-1 bk-mono" style={{ border: `1px solid ${T.line}` }} />
      <p className="text-xs mb-4" style={{ color: T.inkSoft }}>
        Tersimpan hanya di browser Anda sendiri. Tanpa ini, OCR nota tidak aktif — Anda tetap bisa isi manual.
      </p>
      <button
        onClick={() => onSave(logo.trim() || "Rp", company.trim(), key.trim())}
        className="w-full py-2 rounded-md text-sm font-medium"
        style={{ background: T.brass, color: T.white }}
      >
        Simpan Pengaturan
      </button>
    </ModalShell>
  );
}

function ModalShell({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(35,40,31,0.45)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bk-sans w-full sm:max-w-sm rounded-t-xl sm:rounded-xl p-5"
        style={{ background: T.paper, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="bk-display text-lg font-semibold" style={{ color: T.ink }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EntryModal({ initial, existingCenters = [], apiKey, onClose, onSave }) {
  const [jenis, setJenis] = useState(initial ? (initial.masuk ? "masuk" : "keluar") : "keluar");
  const [tanggal, setTanggal] = useState(initial?.tanggal || todayISO());
  const [center, setCenter] = useState(initial?.center || "");
  const [keterangan, setKeterangan] = useState(initial?.keterangan || "");
  const [jumlah, setJumlah] = useState(initial ? String(initial.masuk || initial.keluar || "") : "");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!apiKey) {
      setOcrError('Fitur ini butuh Anthropic API Key. Isi dulu di menu "Pengaturan" (ikon gerigi di kanan atas), atau isi data di bawah secara manual.');
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setOcrBusy(true);
    setOcrError("");
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system:
            "Kamu membaca foto nota/struk belanja. Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown, format persis: " +
            '{"tanggal":"YYYY-MM-DD","keterangan":"nama toko atau item utama, singkat","nominal":123456}. ' +
            "Nominal adalah angka total belanja tanpa titik/koma/simbol. Jika tanggal tidak terlihat, perkirakan tanggal hari ini.",
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
                { type: "text", text: "Baca nota/struk ini dan ekstrak datanya sesuai format JSON." },
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "API error");
      const text = (data.content || []).map((c) => c.text || "").join("").trim();
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.tanggal) setTanggal(parsed.tanggal);
      if (parsed.keterangan) setKeterangan(parsed.keterangan);
      if (parsed.nominal) setJumlah(String(parsed.nominal));
      setJenis("keluar");
    } catch (err) {
      console.error(err);
      setOcrError("Gagal membaca nota otomatis. Silakan isi manual di bawah.");
    } finally {
      setOcrBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleSubmit() {
    const amount = Number(jumlah) || 0;
    if (!keterangan.trim() || amount <= 0) return;
    onSave({
      tanggal,
      center: center.trim(),
      keterangan: keterangan.trim(),
      masuk: jenis === "masuk" ? amount : 0,
      keluar: jenis === "keluar" ? amount : 0,
    });
  }

  return (
    <ModalShell onClose={onClose} title={initial ? "Edit Catatan" : "Tambah Catatan"}>
      {!initial && (
        <div className="mb-4">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={ocrBusy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium mb-1"
            style={{ border: `1.5px dashed ${T.brass}`, color: T.brassDark, background: T.white }}
          >
            {ocrBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {ocrBusy ? "Membaca nota..." : "Foto / Unggah Nota Otomatis"}
          </button>
          {ocrError && (
            <p className="text-xs flex items-center gap-1 mt-1" style={{ color: T.keluar }}>
              <AlertCircle size={12} /> {ocrError}
            </p>
          )}
          <p className="text-xs text-center mt-1" style={{ color: T.inkSoft }}>atau isi manual di bawah</p>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {[{ k: "keluar", l: "Uang Keluar" }, { k: "masuk", l: "Uang Masuk" }].map((o) => (
          <button key={o.k} onClick={() => setJenis(o.k)}
            className="flex-1 text-sm font-medium py-2 rounded-md"
            style={{
              background: jenis === o.k ? (o.k === "masuk" ? T.masukBg : T.keluarBg) : T.white,
              color: jenis === o.k ? (o.k === "masuk" ? T.masuk : T.keluar) : T.inkSoft,
              border: `1px solid ${jenis === o.k ? (o.k === "masuk" ? T.masuk : T.keluar) : T.line}`,
            }}>
            {o.l}
          </button>
        ))}
      </div>

      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Tanggal</label>
      <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-md mb-3" style={{ border: `1px solid ${T.line}` }} />

      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Center (opsional)</label>
      <input value={center} onChange={(e) => setCenter(e.target.value)} list="bk-center-options"
        placeholder="mis. Marketing, Operasional, Gudang" className="w-full text-sm px-3 py-2 rounded-md mb-3"
        style={{ border: `1px solid ${T.line}` }} />
      <datalist id="bk-center-options">
        {existingCenters.map((c) => <option key={c} value={c} />)}
      </datalist>

      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Keterangan (untuk apa)</label>
      <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)}
        placeholder="mis. Beli semen 10 sak" className="w-full text-sm px-3 py-2 rounded-md mb-3"
        style={{ border: `1px solid ${T.line}` }} />

      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Jumlah (Rp)</label>
      <input type="number" value={jumlah} onChange={(e) => setJumlah(e.target.value)}
        placeholder="0" className="bk-mono w-full text-sm px-3 py-2 rounded-md mb-4"
        style={{ border: `1px solid ${T.line}` }} />

      <div className="flex gap-2">
        {initial && (
          <button onClick={() => { onClose(); }}
            className="px-4 py-2 rounded-md text-sm font-medium" style={{ border: `1px solid ${T.line}` }}>
            Batal
          </button>
        )}
        <button onClick={handleSubmit}
          disabled={!keterangan.trim() || !(Number(jumlah) > 0)}
          className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40"
          style={{ background: T.brass, color: T.white }}>
          Simpan
        </button>
      </div>
    </ModalShell>
  );
}

function RequestModal({ initial, projects, existingCenters = [], defaultProjectId, onClose, onSave }) {
  const [projectId, setProjectId] = useState(initial?.projectId || defaultProjectId || "");
  const [tanggal, setTanggal] = useState(initial?.tanggal || todayISO());
  const [peminta, setPeminta] = useState(initial?.peminta || "");
  const [keterangan, setKeterangan] = useState(initial?.keterangan || "");
  const [items, setItems] = useState(
    initial?.items?.length ? initial.items.map((it) => ({ center: "", ...it })) : [{ id: uid(), center: "", nama: "", qty: "", harga: "" }]
  );

  function updateItem(id, field, value) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { id: uid(), center: "", nama: "", qty: "", harga: "" }]);
  }
  function removeItem(id) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }

  const grandTotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0), 0);
  const validItems = items.filter((it) => it.nama.trim() && Number(it.qty) > 0 && Number(it.harga) >= 0);
  const canSave = projectId && validItems.length > 0;

  function handleSubmit() {
    if (!canSave) return;
    onSave({
      projectId,
      tanggal,
      peminta: peminta.trim(),
      keterangan: keterangan.trim(),
      items: items
        .filter((it) => it.nama.trim())
        .map((it) => ({ id: it.id, center: (it.center || "").trim(), nama: it.nama.trim(), qty: Number(it.qty) || 0, harga: Number(it.harga) || 0 })),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(35,40,31,0.45)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bk-sans w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-xl sm:rounded-xl p-5"
        style={{ background: T.paper, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="bk-display text-lg font-semibold" style={{ color: T.ink }}>
            {initial ? "Edit Permintaan Dana" : "Buat Permintaan Dana"}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md" style={{ border: `1px solid ${T.line}` }}>
              <option value="">Pilih project...</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Tanggal</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md" style={{ border: `1px solid ${T.line}` }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Diminta oleh (opsional)</label>
            <input value={peminta} onChange={(e) => setPeminta(e.target.value)}
              placeholder="Nama" className="w-full text-sm px-3 py-2 rounded-md" style={{ border: `1px solid ${T.line}` }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Keperluan (opsional)</label>
            <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)}
              placeholder="mis. Belanja material minggu ke-3" className="w-full text-sm px-3 py-2 rounded-md"
              style={{ border: `1px solid ${T.line}` }} />
          </div>
        </div>

        <div className="rounded-md overflow-hidden mb-2" style={{ border: `1px solid ${T.line}` }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.paperDark }}>
                  <th className="px-2 py-2 text-xs font-semibold text-left" style={{ color: T.brassDark, width: 32 }}>No</th>
                  <th className="px-2 py-2 text-xs font-semibold text-left" style={{ color: T.brassDark }}>Nama Part / Keterangan</th>
                  <th className="px-2 py-2 text-xs font-semibold text-left" style={{ color: T.brassDark, width: 110 }}>Center</th>
                  <th className="px-2 py-2 text-xs font-semibold text-center" style={{ color: T.brassDark, width: 70 }}>Qty</th>
                  <th className="px-2 py-2 text-xs font-semibold text-right" style={{ color: T.brassDark, width: 110 }}>Harga</th>
                  <th className="px-2 py-2 text-xs font-semibold text-right" style={{ color: T.brassDark, width: 110 }}>Total</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td className="px-2 py-1.5 bk-mono text-center" style={{ color: T.inkSoft }}>{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input value={it.nama} onChange={(e) => updateItem(it.id, "nama", e.target.value)}
                        placeholder="mis. Baut M8" className="w-full text-sm px-2 py-1.5 rounded"
                        style={{ border: `1px solid ${T.line}` }} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={it.center || ""} onChange={(e) => updateItem(it.id, "center", e.target.value)}
                        list="bk-request-center-options" placeholder="mis. Toko Jaya"
                        className="w-full text-sm px-2 py-1.5 rounded"
                        style={{ border: `1px solid ${T.line}` }} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" value={it.qty} onChange={(e) => updateItem(it.id, "qty", e.target.value)}
                        placeholder="0" className="bk-mono w-full text-sm px-2 py-1.5 rounded text-center"
                        style={{ border: `1px solid ${T.line}` }} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" value={it.harga} onChange={(e) => updateItem(it.id, "harga", e.target.value)}
                        placeholder="0" className="bk-mono w-full text-sm px-2 py-1.5 rounded text-right"
                        style={{ border: `1px solid ${T.line}` }} />
                    </td>
                    <td className="px-2 py-1.5 bk-mono text-right font-medium">
                      {rupiah((Number(it.qty) || 0) * (Number(it.harga) || 0))}
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <button onClick={() => removeItem(it.id)} disabled={items.length === 1}
                        className="p-1 rounded hover:bg-black/5 disabled:opacity-30">
                        <Trash2 size={13} style={{ color: T.keluar }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${T.brassDark}`, background: T.paperDark }}>
                  <td colSpan={5} className="px-2 py-2 text-sm font-semibold text-right">Grand Total</td>
                  <td className="px-2 py-2 bk-mono text-right font-bold">{rupiah(grandTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <datalist id="bk-request-center-options">
          {existingCenters.map((c) => <option key={c} value={c} />)}
        </datalist>

        <button onClick={addItem}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium mb-4"
          style={{ border: `1px dashed ${T.brass}`, color: T.brassDark }}>
          <Plus size={14} /> Tambah Baris
        </button>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium" style={{ border: `1px solid ${T.line}` }}>
            Batal
          </button>
          <button onClick={handleSubmit}
            disabled={!canSave}
            className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40"
            style={{ background: T.brass, color: T.white }}>
            Simpan Permintaan Dana
          </button>
        </div>
      </div>
    </div>
  );
}

function MembersModal({ projectName, members, busy, onInvite, onRemove, onClose }) {
  const [email, setEmail] = useState("");
  return (
    <ModalShell onClose={onClose} title={`Anggota Project — ${projectName}`}>
      <p className="text-xs mb-3" style={{ color: T.inkSoft }}>
        Orang yang diundang harus sudah punya akun (didaftarkan lewat Supabase). Setelah diundang,
        mereka bisa melihat dan mengedit seluruh data project ini.
      </p>

      <div className="flex gap-2 mb-4">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@contoh.com" className="flex-1 text-sm px-3 py-2 rounded-md"
          style={{ border: `1px solid ${T.line}` }} />
        <button
          onClick={() => { if (email.trim()) { onInvite(email); setEmail(""); } }}
          disabled={busy || !email.trim()}
          className="px-3 py-2 rounded-md text-sm font-medium disabled:opacity-40"
          style={{ background: T.brass, color: T.white }}
        >
          Undang
        </button>
      </div>

      <p className="text-xs font-medium mb-2" style={{ color: T.inkSoft }}>Anggota saat ini</p>
      {members.length === 0 && (
        <p className="text-sm mb-2" style={{ color: T.inkSoft }}>Belum ada anggota lain diundang — project ini masih pribadi.</p>
      )}
      <div className="space-y-1.5 mb-2">
        {members.map((m) => (
          <div key={m} className="flex items-center justify-between text-sm px-3 py-2 rounded-md"
            style={{ background: T.paperDark }}>
            <span>{m}</span>
            <button onClick={() => onRemove(m)} disabled={busy}
              className="text-xs font-medium disabled:opacity-40" style={{ color: T.keluar }}>
              Keluarkan
            </button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
