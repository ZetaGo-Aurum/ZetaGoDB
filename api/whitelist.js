/**
 * 🤖 ZETAGO-DB // MASTER BOT INTEGRATION API GATEWAY
 * Endpoint Vercel Serverless: POST /api/bot
 * Menghubungkan Bot WhatsApp langsung menggunakan Email & Password Pengguna tanpa SDK Firebase.
 */

const appId = 'server-media-75fdc';
const rolePower = { 'dev': 5, 'owner': 4, 'staff': 3, 'pt': 2, 'res': 1 };
const roleLabels = { 'dev': 'DEVELOPER (DEV)', 'owner': 'OWNER', 'staff': 'STAFF', 'pt': 'PARTNER (PT)', 'res': 'RESELLER' };

module.exports = async (req, res) => {
  // 1. Set Secure Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "METHOD NOT ALLOWED: Gunakan metode POST untuk integrasi aman!" });
  }

  const { email, password, action, payload } = req.body;

  if (!email || !password || !action) {
    return res.status(400).json({ error: "BAD REQUEST: Kredensial email, password, dan jenis action wajib diisi!" });
  }

  try {
    const apiKey = process.env.FIREBASE_API_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!apiKey || !projectId) {
      return res.status(500).json({ error: "SERVER ERROR: Environment Variables di Vercel belum dikonfigurasi!" });
    }

    // =================================------------------
    // STEP 1: REST AUTHENTICATION (Verifikasi Akun Pengelola via Google Identity Toolkit)
    // =================================------------------
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    if (!authResponse.ok) {
      return res.status(401).json({ error: "UNAUTHORIZED: Kredensial akun bot Anda salah atau tidak valid!" });
    }

    const authData = await authResponse.json();
    const idToken = authData.idToken;
    const uid = authData.localId;

    // =================================------------------
    // STEP 2: OTORITAS ROLE CHECK (Tarik Profil Role dari Firestore REST API)
    // =================================------------------
    let userRole = 'res';
    let userName = email;

    // Bypass khusus Dev DeltaAstra
    if (email.toLowerCase() === "deltaastra24@gmail.com") {
      userRole = 'dev';
      userName = "Rayhan (DeltaAstra)";
    } else {
      const firestoreUserUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data/accounts/${uid}`;
      const userRes = await fetch(firestoreUserUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (userRes.ok) {
        const userData = await userRes.json();
        userRole = userData.fields?.role?.stringValue || 'res';
        userName = userData.fields?.name?.stringValue || email;
      } else {
        return res.status(403).json({ error: "FORBIDDEN: Akun Anda terotentikasi, namun tidak terdaftar di database ZetaGo-DB!" });
      }
    }

    const loggedPower = rolePower[userRole] || 1;

    // =================================------------------
    // STEP 3: ACTION ROUTER EXECUTION
    // =================================------------------
    const dbBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data`;

    // --------------------------------------------------
    // ACTION A: GET_NUMBERS (Mendapatkan List Whitelist Nomor)
    // --------------------------------------------------
    if (action === 'get_numbers') {
      const numbersUrl = `${dbBaseUrl}/whatsapp_numbers?pageSize=300`;
      const numRes = await fetch(numbersUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!numRes.ok) throw new Error("Gagal mengambil database nomor!");
      const numData = await numRes.json();

      let numbersList = [];
      if (numData.documents) {
        numData.documents.forEach(doc => {
          const fields = doc.fields;
          if (fields && fields.phoneNumber && fields.phoneNumber.stringValue) {
            const addedByUid = fields.addedByUid?.stringValue || '';
            const addedByName = fields.addedByName?.stringValue || '';
            const addedByRole = fields.addedByRole?.stringValue || '';
            
            // STRICT ISOLATION: Non-Dev hanya boleh membaca data yang mereka daftarkan sendiri!
            if (userRole === 'dev' || addedByUid === uid) {
              numbersList.push({
                phoneNumber: '62' + fields.phoneNumber.stringValue,
                name: fields.name?.stringValue || 'No Name',
                addedBy: addedByName,
                role: addedByRole
              });
            }
          }
        });
      }

      return res.status(200).json({
        success: true,
        role: userRole,
        total_active: numbersList.length,
        numbers: numbersList
      });
    }

    // --------------------------------------------------
    // ACTION B: ADD_NUMBER (Menambah Whitelist Nomor WhatsApp Baru)
    // --------------------------------------------------
    if (action === 'add_number') {
      if (!payload || !payload.phoneNumber || !payload.name) {
        return res.status(400).json({ error: "BAD REQUEST: Nomor HP dan Deskripsi Nama wajib disertakan di payload!" });
      }

      let phone = payload.phoneNumber.replace(/[^0-9]/g, '');
      if (phone.startsWith('62')) phone = phone.substring(2);
      if (phone.startsWith('0')) phone = phone.substring(1);

      // Cek duplikasi nomor terlebih dahulu secara REST
      const numbersUrl = `${dbBaseUrl}/whatsapp_numbers?pageSize=300`;
      const checkRes = await fetch(numbersUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const isDuplicate = checkData.documents && checkData.documents.some(d => d.fields?.phoneNumber?.stringValue === phone);
        if (isDuplicate) {
          return res.status(409).json({ error: "DUPLICATE: Nomor WhatsApp tersebut sudah di whitelist sebelumnya!" });
        }
      }

      const insertUrl = `${dbBaseUrl}/whatsapp_numbers`;
      const bodyPayload = {
        fields: {
          phoneNumber: { stringValue: phone },
          name: { stringValue: payload.name },
          timestamp: { integerValue: Date.now() },
          addedByUid: { stringValue: uid },
          addedByName: { stringValue: userName },
          addedByRole: { stringValue: userRole }
        }
      };

      const writeRes = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!writeRes.ok) throw new Error("Gagal menyimpan nomor baru ke database!");

      // Catat log aktivitas
      await fetch(`${dbBaseUrl}/activity_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: Date.now() },
            userUid: { stringValue: uid },
            userName: { stringValue: userName },
            userRole: { stringValue: userRole },
            action: { stringValue: `menambahkan whitelist nomor WhatsApp baru (+62 ${phone}) via BOT API` }
          }
        })
      });

      return res.status(200).json({
        success: true,
        message: `SUCCESS Whitelist: +62${phone} berhasil ditambahkan oleh ${userName} (${userRole.toUpperCase()})!`
      });
    }

    // --------------------------------------------------
    // ACTION C: ADD_USER (Pendaftaran Bawahan Baru via REST)
    // --------------------------------------------------
    if (action === 'add_user') {
      if (userRole === 'res') {
        return res.status(403).json({ error: "FORBIDDEN: Reseller tidak memiliki wewenang membuat akun baru!" });
      }

      if (!payload || !payload.name || !payload.email || !payload.password || !payload.role) {
        return res.status(400).json({ error: "BAD REQUEST: Format pembuatan akun bawahan tidak lengkap!" });
      }

      const targetPower = rolePower[payload.role] || 1;
      if (targetPower >= loggedPower) {
        return res.status(403).json({ error: "FORBIDDEN: Anda hanya bisa mendaftarkan akun di bawah level role Anda saat ini!" });
      }

      // Buat akun baru di Firebase Auth menggunakan REST API
      const registerUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
      const regResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: payload.email, password: payload.password, returnSecureToken: true })
      });

      if (!regResponse.ok) {
        const errorData = await regResponse.json();
        return res.status(400).json({ error: "Gagal membuat kredensial: " + (errorData.error?.message || "Email sudah digunakan!") });
      }

      const regData = await regResponse.json();
      const newUid = regData.localId;

      // Catat profil user baru di Firestore
      const userDocUrl = `${dbBaseUrl}/accounts/${newUid}`;
      const writeUserRes = await fetch(userDocUrl, {
        method: 'PATCH', // Menggunakan PATCH agar setDoc berjalan
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            name: { stringValue: payload.name },
            email: { stringValue: payload.email },
            password: { stringValue: payload.password },
            role: { stringValue: payload.role },
            createdByUid: { stringValue: uid },
            createdByName: { stringValue: userName },
            timestamp: { integerValue: Date.now() }
          }
        })
      });

      if (!writeUserRes.ok) throw new Error("Gagal mencatat profil akun bawahan baru di database!");

      // Catat log aktivitas
      await fetch(`${dbBaseUrl}/activity_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: Date.now() },
            userUid: { stringValue: uid },
            userName: { stringValue: userName },
            userRole: { stringValue: userRole },
            action: { stringValue: `membuat kredensial bawahan baru level ${payload.role.toUpperCase()} (${payload.name}) via BOT API` }
          }
        })
      });

      return res.status(200).json({
        success: true,
        message: `SUCCESS CREATED: Akun bawahan ${payload.name} (${payload.role.toUpperCase()}) berhasil didaftarkan!`
      });
    }

    return res.status(400).json({ error: "BAD REQUEST: Action yang Anda minta tidak terdaftar!" });

  } catch (err) {
    return res.status(500).json({ error: "INTERNAL SERVER ERROR: " + err.message });
  }
};
