# Cara Menaruh "Buku Kas" Online (Gratis)

## ⚠️ Kalau ini update dari versi sebelumnya
Struktur database berubah total: sekarang **semua data privat per akun**,
kecuali sebuah project sengaja "dibagikan" lewat undangan email.

1. Klik **"Cadangkan Data"** dulu di aplikasi versi lama Anda (untuk jaga-jaga).
2. Buka Supabase project Anda → **SQL Editor** → **New Query**.
3. Copy-paste **seluruh isi file `schema.sql`** yang baru ini → klik **Run**.
   (Ini akan menghapus tabel lama dan membuat ulang dengan struktur baru —
   data lama di tabel lama akan hilang, makanya backup dulu di langkah 1.)
4. Update file `src/App.jsx`, `src/main.jsx` di GitHub dengan isi yang baru
   (lihat "Update aplikasi" di bagian bawah panduan ini).
5. Setelah live, gunakan tombol **"Pulihkan"** di aplikasi untuk memuat
   kembali cadangan dari langkah 1 (Uang Bulanan akan tergabung; project-project
   dari cadangan akan dibuat ulang sebagai project baru milik Anda).

## Setup dari nol (belum pernah deploy sama sekali)

### Langkah 1 — Buat database di Supabase (gratis)
1. Buka https://supabase.com → **"Start your project"** → daftar/login.
2. **"New Project"** → isi nama, buat password database, pilih region
   terdekat (Singapore) → **"Create new project"**. Tunggu ± 2 menit.
3. Menu kiri → **"SQL Editor"** → **"New query"**.
4. Copy-paste **seluruh isi file `schema.sql`** → klik **"Run"**.
5. Menu kiri → ikon gerigi **"Project Settings" → "API Keys"**.
   Catat:
   - **Project URL** (klik "Data API" di menu kiri untuk melihatnya, mis. `https://xxxxx.supabase.co`)
   - **anon public key** / **Publishable key** (deretan huruf-angka panjang)
6. **Matikan pendaftaran umum** (supaya orang tidak bisa daftar sembarangan):
   **Authentication → Sign In / Providers → Email → matikan "Allow new users to sign up"**.

### Langkah 2 — Buat akun GitHub (kalau belum punya)
Buka https://github.com/signup dan daftar.

### Langkah 3 — Upload folder ini ke GitHub
1. Login GitHub → **"+"** di kanan atas → **"New repository"**.
2. Isi nama, misal `buku-kas`. **Public**. **"Create repository"**.
3. Klik **"uploading an existing file"**.
4. Buka folder proyek ini, pilih **SEMUA isi di dalamnya** (`src`, `index.html`,
   `package.json`, `schema.sql`, dll — bukan folder pembungkusnya), drag ke
   halaman GitHub, lalu **"Commit changes"**.

### Langkah 4 — Deploy ke Vercel + pasang kunci Supabase
1. https://vercel.com/signup → **"Continue with GitHub"** → izinkan akses,
   pilih repository `buku-kas` saat diminta.
2. **"Add New..." → "Project"** → pilih `buku-kas` → **"Import"**.
3. **Framework Preset**: pastikan terpilih **"Vite"** (bukan "Other").
4. Buka **"Environment Variables"**, tambahkan (Key lalu Value, dua baris):
   - `VITE_SUPABASE_URL` → Project URL dari Langkah 1
   - `VITE_SUPABASE_ANON_KEY` → anon/publishable key dari Langkah 1
5. Klik **"Deploy"**. Tunggu 1–2 menit → dapat alamat website sendiri.

### Langkah 5 — Buat akun pertama Anda
Karena pendaftaran umum dimatikan, buat akun pertama secara manual:
**Supabase → Authentication → Users → Add user → Create new user**,
isi email + password, centang **"Auto Confirm User"** → **"Create user"**.

## Cara pakai setelah online

- **Uang Bulanan** — otomatis privat, cuma Anda yang lihat.
- **Uang Project** — saat bikin project baru, otomatis PRIVAT dulu (cuma
  Anda). Untuk mengajak orang lain kerja bareng di project itu, klik
  **"Kelola Anggota"** (cuma muncul untuk pemilik project) → masukkan
  email orang tersebut. Begitu diundang, dia langsung bisa lihat & edit
  project itu penuh (harus sudah punya akun — tambahkan dulu lewat
  Supabase seperti di Langkah 5 kalau orangnya belum punya akun).
- **Menambah user baru**: selalu lewat Supabase (Authentication → Users →
  Add user), bukan lewat halaman pendaftaran di web (memang sengaja dimatikan).
- **Fitur OCR nota**: tetap butuh Anthropic API Key milik masing-masing
  orang, diisi sendiri-sendiri di menu Pengaturan (privat, tidak dibagikan).

## Update aplikasi di kemudian hari
Kalau ada perbaikan/fitur baru, upload ulang file yang berubah ke
repository GitHub yang sama (folder `src` → klik file → ikon pensil →
timpa isinya → Commit changes). Vercel otomatis build ulang.
