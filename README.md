markdown

Personal OS Bot
Bot Telegram pribadi untuk mengelola tugas, jadwal, berita Indonesia, pasar saham,
ringkasan email, serta catatan pemasukan/pengeluaran dalam satu tempat.

Fitur
/start — dashboard (saldo, tugas, pengingat)
/menu — main menu (tombol)
/akun — kelola akun (ganti nama, saldo awal, akun utama, arsipkan/hapus)
/addaccount — tambah akun (Bank / E-wallet / Tunai / Aset)
/transfer, /tarik, /isikosong — pindah dana antar akun
/rekap / /laporan — ringkasan pemasukan, pengeluaran, net & laporan bulanan
/cekbudget — cek penggunaan budget + proyeksi 50/30/20
/todo, /addtask, /done, /deltask, /tunda — tugas harian
/broadcast — broadcast pesan ke semua (owner + admins)
/backup / /reset — cadangan & reset data (dengan kode konfirmasi)
Teknologi
TypeScript (strict)
grammY v1.46+ (Telegram Bot Framework)
Cloudflare Workers (runtime)
D1 (database relasional)
grammY webhook → /telegram/webhook
Cara pakai (cara cepat)

1. Clone & install
   git clone https://github.com/<OWNER>/personal-os-bot.git
   cd personal-os-bot
   npm install

### 2. Isi env (Cloudflare)

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put OWNER_ID
npx wrangler secret put ADMINS_IDS
Catatan: BOT_TOKEN dari @BotFather. OWNER_ID & ADMINS_IDS dari bot kamu.

3. Deploy
npx wrangler deploy
4. Aktifkan webhook (setelah deploy)
npx wrangler d1 migrations apply personal-os-db --remote
Lalu kirim /start ke bot.

Contributor
@rizkyxibrahim
Lisensi
MIT
```
