import React, { useState, useMemo } from "react";
import { X, Plus } from "lucide-react";

/* Token warna disamakan dengan T di App.jsx. Diduplikasi supaya file
   ini berdiri sendiri (sama seperti Inventory.jsx & Catalog.jsx). */
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
  white: "#FFFDF8",
};

const STATUS = {
  Open: { bg: "#F6D4CF", fg: "#9C2E22", label: "Open" },
  Dikerjakan: { bg: "#FBEACB", fg: "#8A5A0C", label: "Dikerjakan" },
  Selesai: { bg: "#DCEFDD", fg: "#256B36", label: "Selesai" },
};

const rupiah = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const todayISO = () => new Date().toISOString().slice(0, 10);
const dateLabelID = (iso) => {
  if (!iso) return "-";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};
const daysBetween = (a, b) => {
  const d1 = new Date(String(a).slice(0, 10) + "T00:00:00");
  const d2 = new Date(String(b).slice(0, 10) + "T00:00:00");
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
};

function Badge({ status }) {
  const s = STATUS[status] || STATUS.Open;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function ModalShell({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(35,40,31,0.45)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-lg p-5 my-8"
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

const inputStyle = { border: `1px solid ${T.line}` };
const inputClass = "w-full text-sm px-3 py-2 rounded-md";
function Field({ label, children, className = "" }) {
  return (
    <div className={`mb-3 ${className}`}>
      <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>{label}</label>
      {children}
    </div>
  );
}

/* ============================================================
   SERVIS VIEW — daftar keluhan/kerusakan & perbaikan per toko
============================================================ */
export function ServisView({ logs, inventoryItems = [], onAdd, onUpdate, onDelete, onAddMaintenance }) {
  const [statusFilter, setStatusFilter] = useState("semua");
  const [cabangFilter, setCabangFilter] = useState("semua");
  const [modal, setModal] = useState(null); // { log?, preset? }

  const cabangList = useMemo(() => {
    const set = new Set();
    logs.forEach((l) => { if ((l.cabang || "").trim()) set.add(l.cabang.trim()); });
    inventoryItems.forEach((i) => { if ((i.cabang || "").trim()) set.add(i.cabang.trim()); });
    return Array.from(set).sort();
  }, [logs, inventoryItems]);

  const thisMonth = todayISO().slice(0, 7);
  const stats = useMemo(() => ({
    open: logs.filter((l) => l.status === "Open").length,
    dikerjakan: logs.filter((l) => l.status === "Dikerjakan").length,
    selesaiBulanIni: logs.filter((l) => l.status === "Selesai" && (l.tanggal_selesai || "").slice(0, 7) === thisMonth).length,
  }), [logs, thisMonth]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (statusFilter !== "semua" && l.status !== statusFilter) return false;
      const c = (l.cabang || "").trim();
      if (cabangFilter === "__tanpa") return !c;
      if (cabangFilter !== "semua" && c !== cabangFilter) return false;
      return true;
    });
  }, [logs, statusFilter, cabangFilter]);

  const groups = useMemo(() => {
    const map = {};
    filtered.forEach((l) => {
      const key = (l.cabang || "").trim() || "Belum ada cabang";
      (map[key] ||= []).push(l);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => String(b.tanggal_masalah).localeCompare(String(a.tanggal_masalah))));
    return Object.keys(map)
      .sort((a, b) => (a === "Belum ada cabang" ? 1 : b === "Belum ada cabang" ? -1 : a.localeCompare(b)))
      .map((k) => ({ cabang: k, items: map[k] }));
  }, [filtered]);

  const chip = (active, color) => ({
    background: active ? color : T.white,
    color: active ? T.white : T.inkSoft,
    border: `1px solid ${active ? color : T.line}`,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="bk-display text-lg font-semibold" style={{ color: T.ink }}>Catatan Servis</h2>
          <p className="text-xs" style={{ color: T.inkSoft }}>
            Keluhan &amp; kerusakan di toko — kapan terjadi, kapan diperbaiki, dan apa yang dikerjakan.
          </p>
        </div>
        <button onClick={() => setModal({})}
          className="flex items-center gap-1 text-sm px-3 py-2 rounded-md font-medium"
          style={{ background: T.brass, color: T.white }}>
          <Plus size={14} /> Catat Keluhan
        </button>
      </div>

      <div className="grid gap-px mb-4 rounded-lg overflow-hidden"
        style={{ gridTemplateColumns: "repeat(3, 1fr)", background: T.line, border: `1px solid ${T.line}` }}>
        {[
          ["Open", stats.open, STATUS.Open.fg],
          ["Dikerjakan", stats.dikerjakan, STATUS.Dikerjakan.fg],
          ["Selesai bulan ini", stats.selesaiBulanIni, STATUS.Selesai.fg],
        ].map(([l, v, c]) => (
          <div key={l} className="p-3" style={{ background: T.white }}>
            <div className="text-xs mb-1" style={{ color: T.inkSoft }}>{l}</div>
            <div className="bk-mono text-xl font-semibold" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {[
          { k: "semua", l: "Semua status" },
          { k: "Open", l: "Open" },
          { k: "Dikerjakan", l: "Dikerjakan" },
          { k: "Selesai", l: "Selesai" },
        ].map((o) => (
          <button key={o.k} onClick={() => setStatusFilter(o.k)}
            className="text-xs px-3 py-1.5 rounded-full font-medium" style={chip(statusFilter === o.k, T.ink)}>
            {o.l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setCabangFilter("semua")}
          className="text-xs px-3 py-1.5 rounded-full font-medium" style={chip(cabangFilter === "semua", T.brass)}>
          Semua cabang
        </button>
        {cabangList.map((c) => (
          <button key={c} onClick={() => setCabangFilter(c)}
            className="text-xs px-3 py-1.5 rounded-full font-medium" style={chip(cabangFilter === c, T.brass)}>
            {c}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="text-sm text-center py-10" style={{ color: T.inkSoft }}>
          {logs.length === 0
            ? "Belum ada catatan. Klik \"Catat Keluhan\" untuk mulai mencatat."
            : "Tidak ada catatan yang cocok dengan filter ini."}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.cabang} className="mb-6">
          <h3 className="text-sm font-semibold mb-2 pb-1.5" style={{ color: T.ink, borderBottom: `1px solid ${T.line}` }}>
            {g.cabang} <span className="font-normal bk-mono text-xs" style={{ color: T.inkSoft }}>({g.items.length} catatan)</span>
          </h3>
          <div className="space-y-2">
            {g.items.map((l) => {
              const durasi = l.status === "Selesai" && l.tanggal_selesai ? daysBetween(l.tanggal_masalah, l.tanggal_selesai) : null;
              return (
                <div key={l.id} className="rounded-lg p-3.5" style={{ background: T.white, border: `1px solid ${T.line}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge status={l.status} />
                      {l.unit_label && (
                        <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: T.paper, color: T.inkSoft }}>
                          {l.unit_label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs bk-mono" style={{ color: T.inkSoft }}>
                      {dateLabelID(l.tanggal_masalah)}
                      {l.status === "Selesai" && l.tanggal_selesai ? ` → ${dateLabelID(l.tanggal_selesai)}` : ""}
                      {durasi !== null ? ` (${durasi === 0 ? "hari yang sama" : durasi + " hari"})` : ""}
                    </div>
                  </div>
                  <div className="text-sm mb-1" style={{ color: T.ink }}>
                    <b>Keluhan:</b> {l.keluhan}
                  </div>
                  {l.tindakan && (
                    <div className="text-sm mb-1" style={{ color: T.ink }}>
                      <b>Dikerjakan:</b> {l.tindakan}
                    </div>
                  )}
                  {(Number(l.biaya) > 0 || l.dikerjakan_oleh) && (
                    <div className="text-xs mb-1" style={{ color: T.inkSoft }}>
                      {l.dikerjakan_oleh ? `Oleh ${l.dikerjakan_oleh}` : ""}
                      {l.dikerjakan_oleh && Number(l.biaya) > 0 ? " · " : ""}
                      {Number(l.biaya) > 0 ? `Biaya ${rupiah(l.biaya)}` : ""}
                    </div>
                  )}
                  <div className="flex gap-3 mt-2">
                    {l.status !== "Selesai" && (
                      <button onClick={() => setModal({ log: l, preset: "selesai" })}
                        className="text-xs font-semibold" style={{ color: STATUS.Selesai.fg }}>
                        ✓ Tandai selesai
                      </button>
                    )}
                    <button onClick={() => setModal({ log: l })} className="text-xs underline" style={{ color: T.inkSoft }}>
                      Edit
                    </button>
                    <button onClick={() => { if (confirm("Hapus catatan servis ini?")) onDelete(l.id); }}
                      className="text-xs underline" style={{ color: T.keluar }}>
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {modal && (
        <ServisFormModal
          initial={modal.log}
          preset={modal.preset}
          cabangOptions={cabangList}
          inventoryItems={inventoryItems}
          onClose={() => setModal(null)}
          onSave={async ({ data, syncMaintenance }) => {
            if (modal.log) await onUpdate(modal.log.id, data);
            else await onAdd(data);
            if (syncMaintenance && data.unit_id && data.tanggal_selesai && data.tindakan) {
              await onAddMaintenance(data.unit_id, { tanggal: data.tanggal_selesai, keterangan: data.tindakan });
            }
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function ServisFormModal({ initial, preset, cabangOptions, inventoryItems, onClose, onSave }) {
  const presetSelesai = preset === "selesai";
  const [f, setF] = useState({
    cabang: initial?.cabang || "",
    unit_id: initial?.unit_id || "",
    unit_label: initial?.unit_label || "",
    tanggal_masalah: initial?.tanggal_masalah || todayISO(),
    keluhan: initial?.keluhan || "",
    status: presetSelesai ? "Selesai" : initial?.status || "Open",
    tanggal_selesai: initial?.tanggal_selesai || (presetSelesai ? todayISO() : ""),
    tindakan: initial?.tindakan || "",
    biaya: initial?.biaya ?? "",
    dikerjakan_oleh: initial?.dikerjakan_oleh || "",
  });
  const [syncMaintenance, setSyncMaintenance] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const unitOptions = useMemo(() => {
    const c = f.cabang.trim().toLowerCase();
    const list = c ? inventoryItems.filter((i) => (i.cabang || "").trim().toLowerCase() === c) : inventoryItems;
    return list.slice().sort((a, b) => (a.nama_pc || a.merk || "").localeCompare(b.nama_pc || b.merk || ""));
  }, [inventoryItems, f.cabang]);

  const unitName = (i) => i.nama_pc || `${i.merk || "unit"}${i.model ? " " + i.model : ""}`;

  function pickUnit(e) {
    const id = e.target.value;
    const unit = inventoryItems.find((i) => i.id === id);
    setF((s) => ({
      ...s,
      unit_id: id,
      unit_label: unit ? unitName(unit) : s.unit_label,
      cabang: unit && !s.cabang.trim() ? unit.cabang || "" : s.cabang,
    }));
  }

  function changeStatus(e) {
    const v = e.target.value;
    setF((s) => ({
      ...s,
      status: v,
      tanggal_selesai: v === "Selesai" && !s.tanggal_selesai ? todayISO() : s.tanggal_selesai,
    }));
  }

  function submit() {
    if (!f.keluhan.trim()) { alert("Isi keluhan/kerusakannya dulu ya."); return; }
    if (!f.tanggal_masalah) { alert("Isi tanggal masalahnya."); return; }
    if (f.status === "Selesai" && !f.tanggal_selesai) { alert("Isi tanggal diperbaiki untuk status Selesai."); return; }
    onSave({
      syncMaintenance,
      data: {
        cabang: f.cabang.trim(),
        unit_id: f.unit_id || null,
        unit_label: f.unit_label.trim(),
        tanggal_masalah: f.tanggal_masalah,
        keluhan: f.keluhan.trim(),
        status: f.status,
        tanggal_selesai: f.status === "Selesai" ? f.tanggal_selesai : f.tanggal_selesai || null,
        tindakan: f.tindakan.trim(),
        biaya: Number(f.biaya) || 0,
        dikerjakan_oleh: f.dikerjakan_oleh.trim(),
      },
    });
  }

  return (
    <ModalShell onClose={onClose} title={initial ? "Edit Catatan Servis" : "Catat Keluhan / Kerusakan"}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="Cabang / toko">
          <input value={f.cabang} onChange={set("cabang")} list="servis-cabang-options" placeholder="mis. Timika"
            className={inputClass} style={inputStyle} />
          <datalist id="servis-cabang-options">{cabangOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Tanggal masalah">
          <input type="date" value={f.tanggal_masalah} onChange={set("tanggal_masalah")} className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Unit inventaris terkait (opsional)">
          <select value={f.unit_id} onChange={pickUnit} className={inputClass} style={inputStyle}>
            <option value="">— tidak terkait unit tertentu —</option>
            {unitOptions.map((i) => (
              <option key={i.id} value={i.id}>{unitName(i)}{i.cabang ? ` · ${i.cabang}` : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Perangkat / bagian yang bermasalah">
          <input value={f.unit_label} onChange={set("unit_label")} placeholder="mis. Printer kasir 2, WiFi, UPS"
            className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Keluhan / kerusakan" className="sm:col-span-2">
          <textarea value={f.keluhan} onChange={set("keluhan")} rows={2}
            placeholder="mis. Kasir 1 sering hang saat transaksi" className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Status">
          <select value={f.status} onChange={changeStatus} className={inputClass} style={inputStyle}>
            <option>Open</option>
            <option>Dikerjakan</option>
            <option>Selesai</option>
          </select>
        </Field>
        <Field label="Tanggal diperbaiki">
          <input type="date" value={f.tanggal_selesai} onChange={set("tanggal_selesai")} className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Yang diperbaiki / tindakan" className="sm:col-span-2">
          <textarea value={f.tindakan} onChange={set("tindakan")} rows={2}
            placeholder="mis. Ganti SSD, install ulang Windows, bersihkan kipas" className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Dikerjakan oleh (opsional)">
          <input value={f.dikerjakan_oleh} onChange={set("dikerjakan_oleh")} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Biaya (Rp, opsional)">
          <input type="number" value={f.biaya} onChange={set("biaya")} placeholder="0" className={`bk-mono ${inputClass}`} style={inputStyle} />
        </Field>
      </div>

      {f.unit_id && f.status === "Selesai" && (
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={syncMaintenance} onChange={(e) => setSyncMaintenance(e.target.checked)} />
          Catat juga di Riwayat Maintenance unit ini (tab Inventaris)
        </label>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium" style={{ border: `1px solid ${T.line}` }}>Batal</button>
        <button onClick={submit} className="flex-1 py-2 rounded-md text-sm font-medium" style={{ background: T.brass, color: T.white }}>
          Simpan
        </button>
      </div>
    </ModalShell>
  );
}
