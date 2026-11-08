# Portal Kelas VIIC

Starter portal kelas berbasis HTML/CSS/JavaScript + Supabase.

## Fitur
- Login email/password (akun dibuat admin, tanpa pendaftaran umum).
- Role admin dan siswa.
- Pengumuman (admin kelola, semua akun membaca).
- Presensi Senin–Jumat (admin mencatat hadir/tidak hadir; siswa melihat miliknya).
- Jadwal piket (admin mengatur; siswa melihat dan mendapat pengingat di dalam web).
- Uang kas Rp10.000 per siswa per bulan (admin mencatat pembayaran; siswa melihat status dan menerima notifikasi).
- Notifikasi dalam website, tidak menggunakan WhatsApp.

## 1. Siapkan Supabase
1. Buat project di https://supabase.com.
2. Buka SQL Editor, jalankan seluruh isi `schema.sql`.
3. Buka Project Settings > API, salin Project URL dan publishable/anon key.
4. Salin `config.example.js` menjadi `config.js`, lalu isi URL dan key.
5. Jangan pernah menaruh `service_role` key di frontend.

## 2. Buat 30 akun
1. Di Supabase > Authentication > Users, buat 30 akun: 2 admin dan 28 siswa.
2. Isi metadata `full_name` saat membuat user bila tersedia. Jika tidak, nama bisa diedit melalui tabel `profiles`.
3. Setelah akun dibuat, buka SQL Editor dan ubah dua akun admin dengan UUID dari Authentication > Users:

```sql
update public.profiles
set role = 'admin'
where id in (
  'UUID_ADMIN_1',
  'UUID_ADMIN_2'
);
```

4. Pastikan 28 akun lain memiliki role `student`. Jangan memberikan role admin kepada siswa.

## 3. Jalankan lokal
Buka folder ini menggunakan VS Code. Jalankan dengan Live Server atau server lokal (jangan hanya membuka `index.html` sebagai file langsung).

## 4. Deploy ke GitHub Pages
1. Buat repository GitHub dan upload `index.html`, `styles.css`, `app.js`, `config.js`.
2. Di repository: Settings > Pages > Deploy from a branch > pilih `main` dan folder `/root`.
3. Pastikan URL website menggunakan HTTPS.

## 5. Cara admin menggunakan portal
- Pengumuman: buka menu Pengumuman, isi judul dan isi, lalu publikasikan.
- Presensi: buka Presensi, pilih tanggal, lalu simpan status tiap siswa. Hari Sabtu/Minggu tidak dapat dipilih.
- Jadwal piket: pilih siswa dan hari Senin–Jumat.
- Uang kas: pilih bulan dan siswa, lalu catat pembayaran. Sistem membuat notifikasi konfirmasi untuk siswa.
- Siswa hanya dapat melihat data dan menandai notifikasinya sendiri sebagai sudah dibaca.

## Catatan penting
- Target kas adalah Rp10.000 per siswa per bulan. Dengan 28 siswa, target total Rp280.000 per bulan.
- Pembayaran dicatat langsung oleh admin. Tidak ada formulir pembayaran dari siswa.
- Pengingat piket dibuat saat siswa membuka portal pada hari sebelum jadwalnya dan disimpan sebagai notifikasi web.
- Untuk pengingat yang terkirim otomatis walaupun siswa tidak membuka website, perlu penambahan Supabase Edge Function + scheduler.
- Akun admin harus dibuat dan diberi role oleh pemilik project. Jangan pernah menyediakan pendaftaran admin publik.
