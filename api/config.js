module.exports = (req, res) => {
  // 1. Set Secure CORS & Content-Type Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  try {
    // 2. Tarik kredensial rahasia dari Vercel Environment Variables
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };

    // 3. Validasi darurat jika kamu belum mengisi env di dashboard Vercel
    if (!firebaseConfig.apiKey) {
      return res.status(500).json({ 
        error: "ENDPOINT ERROR: Environment Variables belum terkonfigurasi di Vercel!" 
      });
    }

    // 4. Kembalikan konfigurasi aman ke frontend index.html
    return res.status(200).json(firebaseConfig);
  } catch (err) {
    return res.status(500).json({ 
      error: "INTERNAL SERVER ERROR: " + err.message 
    });
  }
};
