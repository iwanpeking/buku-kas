# Cara Menaruh "Buku Kas" Online dengan Login Bersama (Gratis)

Tidak perlu install apa pun di laptop. Semua dilakukan lewat browser.
Sekarang aplikasi ini butuh **login**, dan semua orang yang login akan
melihat **data yang sama** (tersimpan di database pusat, bukan lagi di
browser masing-masing).

## Langkah 1 — Buat database di Supabase (gratis)
1. Buka https://supabase.com → **"Start your project"** → daftar/login.
2. Klik **"New Project"**. Isi nama project (bebas), buat password database
   (simpan baik-baik, jarang dipakai lagi), pilih region terdekat (Singapore).
   Klik **"Create new project"**. Tunggu ± 2 menit sampai siap.
3. Di menu sebelah kiri klik **"SQL Editor"** → **"New query"**.
4. Buka file **`schema.sql`** yang ada di folder ini, salin semua isinya,
   tempel ke SQL Editor tadi, lalu klik **"Run"**. Ini membuat tabel
   penyimpanan datanya.
5. Di menu sebelah kiri klik ikon gerigi **"Project Settings" → "API"**.
   Catat dua hal ini:
   - **Project URL** (mis. `https://xxxxx.supabase.co`)
   - **anon public key** (deretan huruf/angka panjang)

## Langkah 2 — Buat akun GitHub (kalau belum punya)
1. Buka https://github.com/signup dan daftar.

## Langkah 3 — Upload folder ini ke GitHub
1. Login GitHub → klik **"+"** di kanan atas → **"New repository"**.
2. Isi nama, misal `buku-kas`. Biarkan **Public**. Klik **"Create repository"**.
3. Klik **"uploading an existing file"**.
4. Buka folder proyek ini, pilih **SEMUA isi di dalamnya** (`src`, `index.html`,
   `package.json`, `schema.sql`, dll — bukan folder pembungkusnya), drag ke
   halaman GitHub tersebut, lalu klik **"Commit changes"**.

## Langkah 4 — Deploy ke Vercel + pasang kunci Supabase
1. Buka https://vercel.com/signup → **"Continue with GitHub"**.
2. **"Add New..." → "Project"** → pilih repository `buku-kas` → **"Import"**.
3. **Sebelum klik Deploy**, buka bagian **"Environment Variables"**, tambahkan dua baris:
   - Name: `VITE_SUPABASE_URL` — Value: *(Project URL dari Langkah 1)*
   - Name: `VITE_SUPABASE_ANON_KEY` — Value: *(anon public key dari Langkah 1)*
4. Klik **"Deploy"**. Tunggu 1–2 menit.
5. Selesai! Anda dapat alamat website seperti `https://buku-kas-xxxx.vercel.app`.

## Menambah pengguna baru
Buka websitenya, klik tab **"Daftar"**, isi email + password. Selesai —
begitu login, orang itu langsung melihat data yang sama dengan Anda.

> **Verifikasi email:** secara default Supabase mewajibkan konfirmasi email
> saat mendaftar. Untuk tim kecil yang ingin langsung pakai tanpa ribet,
> Anda bisa matikan ini di Supabase: **Authentication → Providers → Email
> → matikan "Confirm email"**.

## Setelah online
- **Tombol Cetak Laporan** langsung berfungsi normal (tanpa unduh-buka lagi).
- **Data kini tersinkron** — siapa pun yang login (dari device manapun) melihat
  data yang sama dan saling memperbarui.
- **Fitur baca nota otomatis (OCR)** tetap butuh Anthropic API Key milik Anda
  sendiri, diisi di menu Pengaturan aplikasi (bukan di Supabase/Vercel).
- Tombol **"Cadangkan Data"** tetap berguna sebagai backup tambahan.

## Update aplikasi di kemudian hari
Kalau nanti ada perbaikan/fitur baru, tinggal upload ulang file yang berubah
ke repository GitHub yang sama — Vercel otomatis build ulang dan website
ter-update sendiri.
