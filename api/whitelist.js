// API Endpoint ini dipasang di proyek Vercel ZetaGo-DB milikmu
// URL aksesnya nanti: https://zetago-db.vercel.app/api/whitelist

module.exports = async (req, res) => {
  // 1. Amankan endpoint dengan header CORS khusus
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  // Proteksi keamanan opsional: Cek API Key khusus Bot di header (Anti-Spam!)
  const botSecretToken = process.env.BOT_SECRET_TOKEN || "ZETAGO_SECURE_TOKEN_2026";
  const incomingToken = req.headers['x-api-key'] || req.query.token;

  if (incomingToken !== botSecretToken) {
    return res.status(401).json({ 
      error: "UNAUTHORIZED: Token bot tidak valid atau tidak disertakan!" 
    });
  }

  try {
    const apiKey = process.env.FIREBASE_API_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const appId = 'server-media-75fdc';

    if (!apiKey || !projectId) {
      return res.status(500).json({ error: "Server belum terkonfigurasi dengan Environment Variables!" });
    }

    // 2. Taktik Bypass Rules: Lakukan login anonim terlebih dahulu via REST API untuk mendapatkan JWT Token
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
    const authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });

    if (!authResponse.ok) {
      throw new Error("Gagal melakukan otentikasi aman ke Firebase Auth.");
    }

    const authData = await authResponse.json();
    const idToken = authData.idToken; // Token JWT resmi untuk melewati Firestore Security Rules!

    // 3. Tarik data whitelisted numbers menggunakan JWT Token tadi (Sesuai Rule 1: Strict Path)
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data/whatsapp_numbers`;
    
    const dbResponse = await fetch(firestoreUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!dbResponse.ok) {
      throw new Error("Gagal mengambil data dari database Firestore.");
    }

    const dbData = await dbResponse.json();
    
    // 4. Parsing response Firestore REST yang nested menjadi array nomor HP bersih
    const whitelist = [];
    if (dbData.documents) {
      dbData.documents.forEach(doc => {
        const fields = doc.fields;
        if (fields && fields.phoneNumber && fields.phoneNumber.stringValue) {
          // Kita kembalikan format internasional lengkap (misal: 628123456789)
          whitelist.push('62' + fields.phoneNumber.stringValue);
        }
      });
    }

    // 5. Kembalikan data array murni ke bot kamu!
    return res.status(200).json({
      success: true,
      total_numbers: whitelist.length,
      numbers: whitelist
    });

  } catch (err) {
    return res.status(500).json({ 
      success: false,
      error: "INTERNAL SERVER ERROR: " + err.message 
    });
  }
};
