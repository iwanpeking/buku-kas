import React, { useState, useMemo, useRef } from "react";
import { X, Plus, Printer, Upload } from "lucide-react";

/* ---------------------------------------------------------
   Token warna disamakan persis dengan T di App.jsx supaya
   tampilannya konsisten. Diduplikasi di sini (bukan di-import
   dari App.jsx) supaya file ini berdiri sendiri dan tidak perlu
   mengubah export apa pun di App.jsx yang sudah berjalan.
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
const STATUS_COLORS = {
  normal: { bg: "#DCEFDD", fg: "#256B36", label: "Normal" },
  rencana: { bg: "#FBEACB", fg: "#8A5A0C", label: "Rencana Penggantian" },
  evaluasi: { bg: "#FBDFC4", fg: "#9A4E14", label: "Prioritas Evaluasi" },
  ganti: { bg: "#F6D4CF", fg: "#9C2E22", label: "Melewati Standar" },
  data: { bg: "#EEE6D2", fg: "#5B5A4C", label: "Data Belum Cukup" },
};

const rupiah = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const dateLabelID = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

export function computeAge(item) {
  const baseStr = item.tanggal_beli || item.bios_date;
  if (!baseStr) return null;
  const base = new Date(baseStr + (baseStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(base)) return null;
  const days = (Date.now() - base.getTime()) / 86400000;
  return Math.round((days / 365) * 10) / 10;
}
export function statusFromAge(age) {
  if (age === null) return { key: "data", ...STATUS_COLORS.data };
  if (age < 5) return { key: "normal", ...STATUS_COLORS.normal };
  if (age < 6) return { key: "rencana", ...STATUS_COLORS.rencana };
  if (age <= 7) return { key: "evaluasi", ...STATUS_COLORS.evaluasi };
  return { key: "ganti", ...STATUS_COLORS.ganti };
}

function Badge({ status }) {
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: status.bg, color: status.fg }}
    >
      {status.label}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>{label}</label>
      {children}
    </div>
  );
}
const inputStyle = { border: `1px solid ${T.line}` };
const inputClass = "w-full text-sm px-3 py-2 rounded-md";

function ModalShell({ onClose, title, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(35,40,31,0.45)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-lg p-5 my-8`}
        style={{ background: T.white, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="bk-display text-lg font-semibold" style={{ color: T.ink }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   INVENTORY VIEW — daftar unit, filter per cabang & status,
   tambah/edit unit + riwayat maintenance.
============================================================ */
export function InventoryView({ items, onAdd, onUpdate, onDelete, onAddMaintenance }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("semua");
  const [cabangFilter, setCabangFilter] = useState("semua");
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem("bk_inventory_view") || "grid"; } catch (e) { return "grid"; }
  });
  const fileRef = useRef(null);

  function changeView(v) {
    setViewMode(v);
    try { localStorage.setItem("bk_inventory_view", v); } catch (e) {}
  }

  const cabangList = useMemo(() => {
    const set = new Set(items.map((i) => (i.cabang || "").trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter !== "semua") {
        const s = statusFromAge(computeAge(i));
        if (s.key !== statusFilter) return false;
      }
      const c = (i.cabang || "").trim();
      if (cabangFilter === "__tanpa") return !c;
      if (cabangFilter !== "semua" && c !== cabangFilter) return false;
      return true;
    });
  }, [items, statusFilter, cabangFilter]);

  const groups = useMemo(() => {
    const map = {};
    filtered.forEach((i) => {
      const key = (i.cabang || "").trim() || "Belum ada cabang";
      (map[key] ||= []).push(i);
    });
    return Object.keys(map).sort((a, b) => (a === "Belum ada cabang" ? 1 : b === "Belum ada cabang" ? -1 : a.localeCompare(b)))
      .map((k) => ({ cabang: k, items: map[k] }));
  }, [filtered]);

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCsv(String(ev.target.result));
        importCsvRows(rows, items, onAdd, onUpdate);
      } catch (err) {
        alert("Gagal membaca file CSV. Pastikan formatnya sesuai hasil scan V6.");
      }
      e.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div>
      <div className="no-print sticky top-0 z-10 -mx-4 px-4 sm:-mx-8 sm:px-8 pb-3 pt-1"
        style={{ background: T.paper, borderBottom: `1px solid ${T.line}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pt-2">
          <h2 className="bk-display text-lg font-semibold" style={{ color: T.ink }}>Unit Inventaris</h2>
          <div className="flex gap-2 flex-wrap">
            <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
              <button onClick={() => changeView("grid")}
                className="text-xs px-3 py-2 font-medium"
                style={{ background: viewMode === "grid" ? T.brass : T.white, color: viewMode === "grid" ? T.white : T.inkSoft }}>
                ▦ Kotak
              </button>
              <button onClick={() => changeView("list")}
                className="text-xs px-3 py-2 font-medium"
                style={{ background: viewMode === "list" ? T.brass : T.white, color: viewMode === "list" ? T.white : T.inkSoft, borderLeft: `1px solid ${T.line}` }}>
                ☰ List
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-xs px-3 py-2 rounded-md font-medium"
              style={{ border: `1px solid ${T.line}`, color: T.inkSoft, background: T.white }}>
              <Upload size={13} /> Import CSV
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded-md font-medium"
              style={{ background: T.brass, color: T.white }}>
              <Plus size={14} /> Tambah Unit
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          {[
            { k: "semua", l: "Semua status" },
            { k: "normal", l: "Normal" },
            { k: "rencana", l: "Rencana Penggantian" },
            { k: "evaluasi", l: "Prioritas Evaluasi" },
            { k: "ganti", l: "Melewati Standar" },
          ].map((o) => (
            <button key={o.k} onClick={() => setStatusFilter(o.k)}
              className="text-xs px-3 py-1.5 rounded-full font-medium"
              style={{
                background: statusFilter === o.k ? T.ink : T.white,
              color: statusFilter === o.k ? T.white : T.inkSoft,
              border: `1px solid ${statusFilter === o.k ? T.ink : T.line}`,
            }}>
            {o.l}
          </button>
        ))}
      </div>
      <div className="no-print flex flex-wrap gap-2 mb-5">
        <button onClick={() => setCabangFilter("semua")}
          className="text-xs px-3 py-1.5 rounded-full font-medium"
          style={{
            background: cabangFilter === "semua" ? T.brass : T.white,
            color: cabangFilter === "semua" ? T.white : T.inkSoft,
            border: `1px solid ${cabangFilter === "semua" ? T.brass : T.line}`,
          }}>
          Semua cabang
        </button>
        {cabangList.map((c) => (
          <button key={c} onClick={() => setCabangFilter(c)}
            className="text-xs px-3 py-1.5 rounded-full font-medium"
            style={{
              background: cabangFilter === c ? T.brass : T.white,
              color: cabangFilter === c ? T.white : T.inkSoft,
              border: `1px solid ${cabangFilter === c ? T.brass : T.line}`,
            }}>
            {c}
          </button>
        ))}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="text-sm text-center py-10" style={{ color: T.inkSoft }}>
          Belum ada unit inventaris yang cocok dengan filter ini.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.cabang} className="mb-6">
          <h3 className="text-sm font-semibold mb-2 pb-1.5" style={{ color: T.ink, borderBottom: `1px solid ${T.line}` }}>
            {g.cabang} <span className="font-normal bk-mono text-xs" style={{ color: T.inkSoft }}>({g.items.length} unit)</span>
          </h3>

          {viewMode === "list" ? (
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.ink, color: T.white }}>
                  {["Unit", "Kategori", "Lokasi", "Umur", "Status"].map((h) => (
                    <th key={h} className="text-left px-2.5 py-1.5 text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.items.map((item) => {
                  const age = computeAge(item);
                  const s = statusFromAge(age);
                  const badgeStatus = item.status_pakai !== "Aktif"
                    ? { bg: T.line, fg: T.inkSoft, label: item.status_pakai }
                    : s;
                  return (
                    <tr key={item.id} onClick={() => setEditing(item)} className="cursor-pointer"
                      style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td className="px-2.5 py-2">
                        <div className="font-semibold bk-display" style={{ color: T.ink }}>
                          {item.merk}{item.model ? ` ${item.model}` : ""}
                        </div>
                        {item.nama_pc && <div className="text-xs bk-mono" style={{ color: T.inkSoft }}>{item.nama_pc}</div>}
                      </td>
                      <td className="px-2.5 py-2">{item.kategori}</td>
                      <td className="px-2.5 py-2">{item.penempatan || "-"}</td>
                      <td className="px-2.5 py-2 bk-mono">{age === null ? "-" : `~${age} th`}</td>
                      <td className="px-2.5 py-2"><Badge status={badgeStatus} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
              {g.items.map((item) => {
                const age = computeAge(item);
                const s = statusFromAge(age);
                const badgeStatus = item.status_pakai !== "Aktif"
                  ? { bg: T.line, fg: T.inkSoft, label: item.status_pakai }
                  : s;
                return (
                  <button key={item.id} onClick={() => setEditing(item)} type="button" className="text-left p-4 rounded-lg"
                    style={{ background: T.white, border: `1px solid ${T.line}` }}>
                    <div className="text-xs mb-1" style={{ color: T.inkSoft }}>
                      {item.kategori}{item.nama_pc ? ` · ${item.nama_pc}` : ""}
                    </div>
                    <div className="bk-display font-semibold text-base mb-1" style={{ color: T.ink }}>
                      {item.merk}{item.model ? ` ${item.model}` : ""}
                    </div>
                    <div className="text-xs bk-mono mb-2" style={{ color: T.inkSoft }}>
                      {item.penempatan || "belum ada detail lokasi"}
                    </div>
                    <Badge status={badgeStatus} />
                    <div className="text-xs mt-2" style={{ color: T.inkSoft }}>
                      {age === null ? "Umur belum diketahui" : `~${age} tahun`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <InventoryFormModal
          onClose={() => setShowAdd(false)}
          onSave={(data) => { onAdd(data); setShowAdd(false); }}
          cabangOptions={cabangList}
        />
      )}
      {editing && (
        <InventoryDetailModal
          item={editing}
          cabangOptions={cabangList}
          onClose={() => setEditing(null)}
          onSave={(data) => { onUpdate(editing.id, data); setEditing(null); }}
          onDelete={() => { if (confirm("Hapus unit ini dari inventaris?")) { onDelete(editing.id); setEditing(null); } }}
          onAddMaintenance={(entry) => onAddMaintenance(editing.id, entry)}
        />
      )}
    </div>
  );
}

function InventoryFormModal({ onClose, onSave, cabangOptions }) {
  const [f, setF] = useState({
    kategori: "Komputer", merk: "", model: "", serial: "", cabang: "", penempatan: "",
    tanggal_beli: "", bios_date: "", harga: "", toko: "",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function submit() {
    if (!f.merk.trim()) { alert("Isi merk barang dulu ya."); return; }
    if (!f.tanggal_beli && !f.bios_date) { alert("Isi minimal salah satu: tanggal beli atau tanggal BIOS."); return; }
    onSave({ ...f, harga: Number(f.harga) || 0, status_pakai: "Aktif" });
  }

  return (
    <ModalShell onClose={onClose} title="Tambah Unit Inventaris" wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="Kategori">
          <select value={f.kategori} onChange={set("kategori")} className={inputClass} style={inputStyle}>
            {["Komputer", "Laptop", "Printer", "Jaringan/WiFi", "Lainnya"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Merk"><input value={f.merk} onChange={set("merk")} placeholder="mis. Lenovo" className={inputClass} style={inputStyle} /></Field>
        <Field label="Model"><input value={f.model} onChange={set("model")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Serial number"><input value={f.serial} onChange={set("serial")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Cabang">
          <input value={f.cabang} onChange={set("cabang")} list="inv-cabang-options" placeholder="mis. Timika" className={inputClass} style={inputStyle} />
          <datalist id="inv-cabang-options">{cabangOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Detail lokasi"><input value={f.penempatan} onChange={set("penempatan")} placeholder="mis. Kasir 1" className={inputClass} style={inputStyle} /></Field>
        <Field label="Dibeli dari toko"><input value={f.toko} onChange={set("toko")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Harga beli (Rp)"><input type="number" value={f.harga} onChange={set("harga")} className={`bk-mono ${inputClass}`} style={inputStyle} /></Field>
        <Field label="Tanggal beli"><input type="date" value={f.tanggal_beli} onChange={set("tanggal_beli")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Tanggal BIOS (kalau sudah discan)"><input type="date" value={f.bios_date} onChange={set("bios_date")} className={inputClass} style={inputStyle} /></Field>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium" style={{ border: `1px solid ${T.line}` }}>Batal</button>
        <button onClick={submit} className="flex-1 py-2 rounded-md text-sm font-medium" style={{ background: T.brass, color: T.white }}>Simpan</button>
      </div>
    </ModalShell>
  );
}

function InventoryDetailModal({ item, cabangOptions, onClose, onSave, onDelete, onAddMaintenance }) {
  const [f, setF] = useState({
    kategori: item.kategori || "Komputer", merk: item.merk || "", model: item.model || "",
    serial: item.serial || "", cabang: item.cabang || "", penempatan: item.penempatan || "",
    toko: item.toko || "", tanggal_beli: item.tanggal_beli || "", bios_date: item.bios_date || "",
    harga: item.harga || 0, status_pakai: item.status_pakai || "Aktif",
  });
  const [mTanggal, setMTanggal] = useState(todayISO());
  const [mKet, setMKet] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const age = computeAge(item);
  const s = statusFromAge(age);

  function addMaint() {
    if (!mTanggal || !mKet.trim()) { alert("Isi tanggal dan keterangan maintenance dulu."); return; }
    onAddMaintenance({ tanggal: mTanggal, keterangan: mKet.trim() });
    setMKet("");
  }

  return (
    <ModalShell onClose={onClose} title={`${item.merk}${item.model ? " " + item.model : ""}`} wide>
      <div className="text-xs mb-4" style={{ color: T.inkSoft }}>
        {age === null ? "Umur belum diketahui" : `~${age} tahun`} — <Badge status={s} />
      </div>

      {(item.nama_pc || item.cpu || item.ram_gb || item.storage_info || item.os) && (
        <div className="text-xs mb-4 rounded-md p-3 grid grid-cols-1 sm:grid-cols-2 gap-1" style={{ background: T.paper, color: T.ink }}>
          {item.nama_pc && <div><b>Nama PC:</b> {item.nama_pc}</div>}
          {item.cpu && <div><b>Processor:</b> {item.cpu}</div>}
          {item.ram_gb && <div><b>RAM:</b> {item.ram_gb} GB</div>}
          {item.storage_info && <div><b>Storage:</b> {item.storage_info}</div>}
          {item.os && <div><b>Windows:</b> {item.os}</div>}
          {item.win_install_date && <div><b>Windows diinstal:</b> {item.win_install_date}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="Kategori">
          <select value={f.kategori} onChange={set("kategori")} className={inputClass} style={inputStyle}>
            {["Komputer", "Laptop", "Printer", "Jaringan/WiFi", "Lainnya"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Merk"><input value={f.merk} onChange={set("merk")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Model"><input value={f.model} onChange={set("model")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Serial number"><input value={f.serial} onChange={set("serial")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Cabang">
          <input value={f.cabang} onChange={set("cabang")} list="inv-cabang-options-edit" className={inputClass} style={inputStyle} />
          <datalist id="inv-cabang-options-edit">{cabangOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Detail lokasi"><input value={f.penempatan} onChange={set("penempatan")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Dibeli dari toko"><input value={f.toko} onChange={set("toko")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Harga beli (Rp)"><input type="number" value={f.harga} onChange={set("harga")} className={`bk-mono ${inputClass}`} style={inputStyle} /></Field>
        <Field label="Tanggal beli"><input type="date" value={f.tanggal_beli} onChange={set("tanggal_beli")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Tanggal BIOS"><input type="date" value={f.bios_date} onChange={set("bios_date")} className={inputClass} style={inputStyle} /></Field>
        <Field label="Status pakai">
          <select value={f.status_pakai} onChange={set("status_pakai")} className={inputClass} style={inputStyle}>
            {["Aktif", "Rusak", "Dijual", "Dibuang"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${T.line}` }} />
      <h4 className="text-sm font-semibold mb-2" style={{ color: T.ink }}>Riwayat Maintenance</h4>
      <div className="mb-3 max-h-32 overflow-y-auto text-sm">
        {(item.inventory_maintenance || []).length === 0 && (
          <div style={{ color: T.inkSoft }}>Belum ada riwayat maintenance.</div>
        )}
        {(item.inventory_maintenance || []).slice().reverse().map((m) => (
          <div key={m.id} className="mb-1 pl-3" style={{ borderLeft: `2px solid ${T.line}` }}>
            <span className="bk-mono text-xs" style={{ color: T.inkSoft }}>{dateLabelID(m.tanggal)}</span> — {m.keterangan}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        <input type="date" value={mTanggal} onChange={(e) => setMTanggal(e.target.value)} className="text-sm px-2 py-1.5 rounded-md" style={inputStyle} />
        <input value={mKet} onChange={(e) => setMKet(e.target.value)} placeholder="mis. ganti HDD"
          className="flex-1 text-sm px-2 py-1.5 rounded-md" style={inputStyle} />
        <button onClick={addMaint} className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ border: `1px solid ${T.line}` }}>Tambah</button>
      </div>

      <div className="flex gap-2">
        <button onClick={onDelete} className="px-4 py-2 rounded-md text-sm font-medium" style={{ color: T.keluar, border: `1px solid ${T.keluar}` }}>Hapus</button>
        <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium" style={{ border: `1px solid ${T.line}` }}>Batal</button>
        <button onClick={() => onSave(f)} className="flex-1 py-2 rounded-md text-sm font-medium" style={{ background: T.brass, color: T.white }}>Simpan Perubahan</button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   LAPORAN — ringkasan eksekutif, siap cetak/PDF lewat print browser
============================================================ */
export function LaporanInventaris({ items }) {
  const aktif = items.filter((i) => i.status_pakai === "Aktif");
  const withAge = aktif.map((i) => ({ item: i, age: computeAge(i), status: statusFromAge(computeAge(i)) }));
  const total = aktif.length;
  const cabangSet = Array.from(new Set(aktif.map((i) => (i.cabang || "").trim() || "Belum ada cabang"))).sort();
  const melewati = withAge.filter((x) => x.status.key === "ganti").length;
  const known = withAge.filter((x) => x.age !== null);
  const avgAge = known.length ? known.reduce((s, x) => s + x.age, 0) / known.length : null;
  const oldest = known.length ? known.reduce((a, b) => (b.age > a.age ? b : a)) : null;

  if (total === 0) {
    return <div className="text-sm text-center py-10" style={{ color: T.inkSoft }}>Belum ada unit aktif untuk dilaporkan.</div>;
  }

  const cards = [
    ["Total unit aktif", total],
    ["Cabang ter-data", cabangSet.length],
    ["Melewati standar (>7th)", melewati],
    ["Rata-rata umur", avgAge === null ? "-" : avgAge.toFixed(1) + " th"],
  ];

  return (
    <div>
      <div className="no-print flex justify-end mb-4">
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md font-medium"
          style={{ background: T.brass, color: T.white }}>
          <Printer size={14} /> Cetak / Simpan sebagai PDF
        </button>
      </div>

      <h1 className="bk-display text-xl font-bold mb-1" style={{ color: T.ink }}>Laporan Inventaris Komputer</h1>
      <div className="text-xs mb-5" style={{ color: T.inkSoft }}>
        {cabangSet.join(" · ")} — dibuat {dateLabelID(todayISO())}
      </div>

      <div className="grid gap-px mb-5 rounded-lg overflow-hidden" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", background: T.line, border: `1px solid ${T.line}` }}>
        {cards.map(([l, v]) => (
          <div key={l} className="p-3" style={{ background: T.white }}>
            <div className="text-xs mb-1" style={{ color: T.inkSoft }}>{l}</div>
            <div className="bk-mono text-lg font-semibold" style={{ color: T.ink }}>{v}</div>
          </div>
        ))}
      </div>

      {melewati > 0 ? (
        <div className="text-sm rounded-md p-3 mb-6" style={{ background: STATUS_COLORS.ganti.bg, color: STATUS_COLORS.ganti.fg }}>
          ⚠ <b>{melewati} dari {total} unit ({Math.round((melewati / total) * 100)}%)</b> sudah melewati standar penggantian 7 tahun
          {oldest ? <> , unit tertua <b>{oldest.item.nama_pc || oldest.item.merk}</b> ({oldest.item.cabang || "-"}, ~{oldest.age} tahun)</> : null}.
          Rekomendasi: prioritaskan anggaran penggantian pada periode berikutnya.
        </div>
      ) : (
        <div className="text-sm rounded-md p-3 mb-6" style={{ background: STATUS_COLORS.normal.bg, color: STATUS_COLORS.normal.fg }}>
          ✓ Semua unit masih dalam standar umur normal.
        </div>
      )}

      <h2 className="bk-display text-base font-semibold mb-2" style={{ color: T.ink }}>Ringkasan per Cabang</h2>
      <table className="w-full text-sm mb-6" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: T.ink, color: T.white }}>
            {["Cabang", "Jumlah Unit", "Melewati Standar", "Rata-rata Umur"].map((h) => (
              <th key={h} className="text-left px-2.5 py-1.5 text-xs font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cabangSet.map((cabang) => {
            const g = withAge.filter((x) => ((x.item.cabang || "").trim() || "Belum ada cabang") === cabang);
            const n = g.length;
            const nMel = g.filter((x) => x.status.key === "ganti").length;
            const k = g.filter((x) => x.age !== null);
            const avg = k.length ? k.reduce((s, x) => s + x.age, 0) / k.length : null;
            return (
              <tr key={cabang} style={{ borderBottom: `1px solid ${T.line}` }}>
                <td className="px-2.5 py-1.5">{cabang}</td>
                <td className="px-2.5 py-1.5">{n}</td>
                <td className="px-2.5 py-1.5">{nMel}</td>
                <td className="px-2.5 py-1.5">{avg === null ? "-" : avg.toFixed(1) + " th"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="bk-display text-base font-semibold mb-2" style={{ color: T.ink }}>Detail Unit per Cabang</h2>
      {cabangSet.map((cabang) => {
        const g = withAge.filter((x) => ((x.item.cabang || "").trim() || "Belum ada cabang") === cabang);
        return (
          <div key={cabang} className="mb-5">
            <h4 className="text-sm font-semibold mb-1.5" style={{ color: T.ink }}>{cabang} ({g.length} unit)</h4>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.ink, color: T.white }}>
                  {["Nama PC", "Processor", "RAM", "Storage", "Windows", "Tgl BIOS", "Windows Diinstal", "Umur", "Status"].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.map((x) => (
                  <tr key={x.item.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td className="px-2 py-1.5">{x.item.nama_pc || x.item.merk}{x.item.model ? " " + x.item.model : ""}</td>
                    <td className="px-2 py-1.5">{x.item.cpu || "-"}</td>
                    <td className="px-2 py-1.5">{x.item.ram_gb ? x.item.ram_gb + " GB" : "-"}</td>
                    <td className="px-2 py-1.5">{x.item.storage_info || "-"}</td>
                    <td className="px-2 py-1.5">{x.item.os || "-"}</td>
                    <td className="px-2 py-1.5">{x.item.bios_date || "-"}</td>
                    <td className="px-2 py-1.5">{x.item.win_install_date || "-"}</td>
                    <td className="px-2 py-1.5">{x.age === null ? "-" : x.age + " th"}</td>
                    <td className="px-2 py-1.5"><Badge status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="text-xs mt-4" style={{ color: T.inkSoft }}>
        Umur dihitung dari tanggal beli (bila diisi) sebagai indikator utama, dengan tanggal BIOS sebagai cadangan kalau
        tanggal beli belum diisi. Kolom "Windows Diinstal" ditampilkan sebagai
        info tambahan saja — tidak dipakai untuk menghitung status umur, karena tanggalnya bisa berubah bila sistem pernah
        di-install ulang. Standar kantor: &lt;5 th normal · 5 th rencana penggantian · 6–7 th prioritas evaluasi ·
        &gt;7 th melewati standar.
      </div>
    </div>
  );
}

/* ============================================================
   IMPORT CSV — dari hasil scan V6 / Master_Inventory_Semua_Cabang
============================================================ */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] !== undefined ? cols[idx] : ""; });
    return row;
  });
}
function parseCsvLine(line) {
  const result = []; let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { result.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}
function importCsvRows(rows, existingItems, onAdd, onUpdate) {
  let added = 0, updated = 0;
  rows.forEach((row) => {
    const namaPc = (row["Nama PC"] || "").trim();
    if (!namaPc) return;
    const merkRaw = (row["Merk"] || "").trim();
    const merk = (!merkRaw || merkRaw === "System manufacturer") ? namaPc : merkRaw;
    const modelRaw = (row["Model"] || "").trim();
    const model = modelRaw === "System Product Name" ? "" : modelRaw;
    const serialRaw = (row["Serial"] || "").trim();
    const serial = serialRaw === "System Serial Number" ? "" : serialRaw;

    const hw = {
      nama_pc: namaPc, merk, model, serial,
      cpu: (row["CPU"] || "").trim(),
      ram_gb: (row["RAM Terpasang GB"] || "").trim(),
      bios_date: (row["BIOS Date"] || "").trim() || null,
      storage_info: (row["Storage"] || "").trim(),
      os: (row["Windows"] || "").trim(),
      win_install_date: (row["Windows Install Date"] || "").trim(),
    };

    const existing = existingItems.find((i) => (i.nama_pc || "").toLowerCase() === namaPc.toLowerCase());
    if (existing) {
      onUpdate(existing.id, hw);
      updated++;
    } else {
      onAdd({
        ...hw,
        kategori: "Komputer", cabang: "", toko: "",
        penempatan: (row["User"] || "").trim(),
        tanggal_beli: "", harga: 0, status_pakai: "Aktif",
      });
      added++;
    }
  });
  alert(`Import selesai.\nUnit baru: ${added}\nUnit diperbarui: ${updated}`);
}
