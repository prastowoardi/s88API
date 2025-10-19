# 💸 S88 Payment Integration

S88 Payment Integration adalah proyek berbasis **Node.js** yang digunakan untuk melakukan proses **Deposit** dan **Withdraw (Payout)** ke berbagai **Payment Service Provider (PSP)** secara terintegrasi.  
Proyek ini mendukung enkripsi data, pembuatan transaksi, logging otomatis, serta pengujian melalui manual callback.

---

## 🚀 Fitur Utama

- 🔐 Enkripsi & dekripsi payload
- 💰 Multi Platform
- 🔄 Callback otomatis & manual
- 🧠 Konfigurasi fleksibel per environment
- 🪵 Logging transaksi

---

### 1. Pastikan versi Node.js
Gunakan Node.js versi **18 atau lebih tinggi**:
```bash
node -v
```

### 2. Install Dependencies
```
npm install
```

### 3. Siapkan Environement
```
BASE_URL=API_URL
CALLBACK_URL=https://your-callback-url.com
MERCHANT_ID=your_merchant_id
SECRET_KEY=your_secret_key
CURRENCY=INR
```

### 4. Running
```
npm run start
```