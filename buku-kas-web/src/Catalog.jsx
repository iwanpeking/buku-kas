import React, { useState, useMemo } from "react";
import { X, Plus, Trash2, Pencil } from "lucide-react";

const T = {
  paper: "#F6F1E4",
  paperDark: "#EEE6D2",
  ink: "#23281F",
  inkSoft: "#5B5A4C",
  line: "#D8CDAE",
  keluar: "#9C3B34",
  keluarBg: "#F3E4DF",
  brass: "#A9812F",
  brassDark: "#7C5E20",
  white: "#FFFDF8",
};

const rupiah = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function ModalShell({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(35,40,31,0.45)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg p-5 my-8"
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

export function CatalogView({ catalog, onAdd, onUpdate, onDelete }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const groups = useMemo(() => {
    const map = {};
    catalog.forEach((c) => { (map[c.paket] ||= []).push(c); });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (a.urutan || 0) - (b.urutan || 0)));
    return Object.keys(map).sort().map((paket) => ({
      paket,
      items: map[paket],
      total: map[paket].reduce((s, c) => s + (Number(c.qty_per_unit) || 0) * (Number(c.harga_satuan) || 0), 0),
    }));
  }, [catalog]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="bk-display text-lg font-semibold" style={{ color: T.ink }}>Katalog Harga</h2>
          <p className="text-xs" style={{ color: T.inkSoft }}>
            Daftar paket &amp; harga komponen — dipakai otomatis saat "Ajukan Penggantian" dari Inventaris.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-sm px-3 py-2 rounded-md font-medium"
          style={{ background: T.brass, color: T.white }}>
          <Plus size={14} /> Tambah Komponen
        </button>
      </div>

      {groups.length === 0 && (
        <div className="text-sm text-center py-10" style={{ color: T.inkSoft }}>
          Belum ada katalog. Tambah komponen pertama, atau jalankan SQL seed dari file schema_katalog_harga.sql.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.paket} className="mb-6">
          <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: `1px solid ${T.line}` }}>
            <h3 className="text-sm font-semibold" style={{ color: T.ink }}>{g.paket}</h3>
            <span className="text-xs bk-mono" style={{ color: T.inkSoft }}>Total: {rupiah(g.total)}</span>
          </div>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.ink, color: T.white }}>
                {["Komponen", "Merk", "Nama Barang", "Qty", "Harga Satuan", ""].map((h) => (
                  <th key={h} className="text-left px-2.5 py-1.5 text-xs font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.items.map((item) => (
                <tr key={item.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td className="px-2.5 py-2">{item.komponen || "-"}</td>
                  <td className="px-2.5 py-2">{item.merk || "-"}</td>
                  <td className="px-2.5 py-2">{item.nama_barang}</td>
                  <td className="px-2.5 py-2 bk-mono">{item.qty_per_unit}</td>
                  <td className="px-2.5 py-2 bk-mono">{rupiah(item.harga_satuan)}</td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(item)} className="p-1 rounded hover:bg-black/5" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => { if (confirm(`Hapus "${item.nama_barang}" dari katalog?`)) onDelete(item.id); }}
                      className="p-1 rounded hover:bg-black/5" style={{ color: T.keluar }} title="Hapus">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showAdd && (
        <CatalogFormModal
          existingPakets={groups.map((g) => g.paket)}
          onClose={() => setShowAdd(false)}
          onSave={(data) => { onAdd(data); setShowAdd(false); }}
        />
      )}
      {editing && (
        <CatalogFormModal
          initial={editing}
          existingPakets={groups.map((g) => g.paket)}
          onClose={() => setEditing(null)}
          onSave={(data) => { onUpdate(editing.id, data); setEditing(null); }}
        />
      )}
    </div>
  );
}

function CatalogFormModal({ initial, existingPakets, onClose, onSave }) {
  const [f, setF] = useState({
    paket: initial?.paket || "",
    kode: initial?.kode || "",
    komponen: initial?.komponen || "",
    merk: initial?.merk || "",
    nama_barang: initial?.nama_barang || "",
    qty_per_unit: initial?.qty_per_unit ?? 1,
    harga_satuan: initial?.harga_satuan ?? 0,
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inputStyle = { border: `1px solid ${T.line}` };
  const inputClass = "w-full text-sm px-3 py-2 rounded-md";

  function submit() {
    if (!f.paket.trim() || !f.nama_barang.trim()) {
      alert("Isi nama paket dan nama barang dulu ya.");
      return;
    }
    onSave({
      ...f,
      qty_per_unit: Number(f.qty_per_unit) || 1,
      harga_satuan: Number(f.harga_satuan) || 0,
    });
  }

  return (
    <ModalShell onClose={onClose} title={initial ? "Edit Komponen" : "Tambah Komponen"}>
      <div className="mb-3">
        <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Nama Paket</label>
        <input value={f.paket} onChange={set("paket")} list="paket-options" placeholder="mis. Kasir"
          className={inputClass} style={inputStyle} />
        <datalist id="paket-options">{existingPakets.map((p) => <option key={p} value={p} />)}</datalist>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Kode (opsional)</label>
          <input value={f.kode} onChange={set("kode")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Komponen</label>
          <input value={f.komponen} onChange={set("komponen")} placeholder="mis. Processor" className={inputClass} style={inputStyle} />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Nama Barang</label>
        <input value={f.nama_barang} onChange={set("nama_barang")} className={inputClass} style={inputStyle} />
      </div>
      <div className="mb-3">
        <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Merk</label>
        <input value={f.merk} onChange={set("merk")} className={inputClass} style={inputStyle} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Qty per Unit</label>
          <input type="number" value={f.qty_per_unit} onChange={set("qty_per_unit")} className={`bk-mono ${inputClass}`} style={inputStyle} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: T.inkSoft }}>Harga Satuan (Rp)</label>
          <input type="number" value={f.harga_satuan} onChange={set("harga_satuan")} className={`bk-mono ${inputClass}`} style={inputStyle} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium" style={{ border: `1px solid ${T.line}` }}>Batal</button>
        <button onClick={submit} className="flex-1 py-2 rounded-md text-sm font-medium" style={{ background: T.brass, color: T.white }}>Simpan</button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   MODAL PILIH PAKET — dipakai dari Inventory.jsx saat "Ajukan
   Penggantian" diklik. Untuk tiap unit terpilih, user pilih paket
   pengganti; hasilnya dipecah jadi baris komponen siap pakai di
   form Permintaan Dana.
============================================================ */
export function AssignPackageModal({ selectedItems, catalog, onClose, onConfirm }) {
  const pakets = useMemo(() => Array.from(new Set(catalog.map((c) => c.paket))).sort(), [catalog]);
  const [assign, setAssign] = useState(() => {
    const init = {};
    selectedItems.forEach((it) => { init[it.id] = ""; });
    return init;
  });

  function buildAndConfirm() {
    const items = [];
    selectedItems.forEach((unit) => {
      const paket = assign[unit.id];
      const label = `${unit.merk || "unit"}${unit.model ? " " + unit.model : ""}${unit.nama_pc ? ` (${unit.nama_pc})` : ""}`;
      if (!paket) {
        items.push({ id: uid(), center: unit.cabang || "", nama: `Penggantian ${label}`, qty: 1, harga: "" });
        return;
      }
      const rows = catalog.filter((c) => c.paket === paket).sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
      rows.forEach((row) => {
        items.push({
          id: uid(),
          center: unit.cabang || "",
          nama: `${row.nama_barang} — ganti ${label}`,
          qty: row.qty_per_unit || 1,
          harga: row.harga_satuan || 0,
        });
      });
    });
    const keterangan = `Pengajuan penggantian ${selectedItems.length} unit komputer (umur melewati standar)`;
    onConfirm({ items, keterangan });
  }

  return (
    <ModalShell onClose={onClose} title="Pilih Paket Pengganti">
      <p className="text-xs mb-3" style={{ color: T.inkSoft }}>
        Pilih paket untuk tiap unit — otomatis dipecah jadi rincian komponen dengan harga dari Katalog.
        Boleh dikosongkan ("Isi manual") kalau mau isi harga sendiri nanti.
      </p>
      <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
        {selectedItems.map((unit) => (
          <div key={unit.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md" style={{ background: T.paper }}>
            <div className="text-sm">
              <div className="font-medium" style={{ color: T.ink }}>
                {unit.merk}{unit.model ? ` ${unit.model}` : ""}
              </div>
              <div className="text-xs" style={{ color: T.inkSoft }}>
                {unit.nama_pc ? `${unit.nama_pc} · ` : ""}{unit.cabang || "belum ada cabang"}
              </div>
            </div>
            <select value={assign[unit.id]} onChange={(e) => setAssign((s) => ({ ...s, [unit.id]: e.target.value }))}
              className="text-xs px-2 py-1.5 rounded-md" style={{ border: `1px solid ${T.line}` }}>
              <option value="">Isi manual</option>
              {pakets.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium" style={{ border: `1px solid ${T.line}` }}>Batal</button>
        <button onClick={buildAndConfirm} className="flex-1 py-2 rounded-md text-sm font-medium" style={{ background: T.brass, color: T.white }}>
          Lanjut ke Permintaan Dana →
        </button>
      </div>
    </ModalShell>
  );
}
