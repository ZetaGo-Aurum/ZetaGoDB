export default function handler(req, res) {
  // 1. Amankan endpoint dengan header CORS khusus
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // 2. Tarik data rahasia langsung dari Environment Variables Vercel
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
  };

  // 3. Validasi darurat jika kamu lupa menginput salah satu env di Vercel
  if (!firebaseConfig.apiKey) {
    return res.status(500).json({ 
      error: "ENDPOINT ERROR: Environment Variables belum terkonfigurasi atau kosong di dashboard Vercel!" 
    });
  }

  // 4. Kirim config ke frontend index.html secara aman via HTTPS
  return res.status(200).json(firebaseConfig);
}
```

---

### 📡 Pastikan Pemanggil di `index.html` Sudah Sesuai
Di dalam file `index.html` kamu pada baris **648** (tempat error terjadi), pastikan fungsi penarik config-nya sudah mengarah ke endpoint `/api/config` dengan benar seperti ini:

```javascript
// Mengambil konfigurasi enkripsi secara aman dari serverless backend Vercel
async function fetchConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Gagal mengambil respon config');
    const config = await response.json();
    
    // Inisialisasi Firebase secara aman di memory runtime
    initializeFirebaseApp(config);
  } catch (error) {
    console.error(error);
    showToast('error', 'Gagal memuat modul enkripsi database backend!');
  }
}
fetchConfig();
