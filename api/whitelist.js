const appId = 'server-media-75fdc';
const SECURE_TOKEN = "ZetaShield_ZTGrYHRdR424248484_9f8b2c7a1e0d3f4b5a6c7d8e9f0a1b2c_SecureGatewaySystemToken_df849302948201948201948201948202_AlphaX99_VercelProd_2026_dB_Auth_Key_Encrypt_CEEOCS_Complex_u83jdxn829103948_ZTGrYHRdR424248484_SecureAccessGatewayAuthenticationSystemKey_v928fks9201mshd82019shdbf639shdbfn";

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.query.token || req.headers['x-api-key'];
  if (token !== SECURE_TOKEN) {
    return res.status(401).json({ error: "UNAUTHORIZED: Token tidak valid!" });
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    return res.status(500).json({ error: "SERVER ERROR: Environment Variables belum terkonfigurasi!" });
  }

  try {
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: "bot-gateway@zetago.com",
        password: "ZetaShieldBotGateway2026!",
        returnSecureToken: true
      })
    });

    let idToken = "";
    if (authResponse.ok) {
      const authData = await authResponse.json();
      idToken = authData.idToken;
    } else {
      const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
      const signUpResponse = await fetch(signUpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      });
      if (signUpResponse.ok) {
        const signUpData = await signUpResponse.json();
        idToken = signUpData.idToken;
      } else {
        throw new Error("Gagal melakukan otentikasi ke Firebase.");
      }
    }

    const dbBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data`;

    if (req.method === 'GET') {
      const numRes = await fetch(`${dbBaseUrl}/whatsapp_numbers?pageSize=300`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!numRes.ok) throw new Error("Gagal mengambil database nomor!");
      const numData = await numRes.json();

      const numbersList = [];
      if (numData.documents) {
        numData.documents.forEach(doc => {
          const fields = doc.fields;
          if (fields && fields.phoneNumber && fields.phoneNumber.stringValue) {
            numbersList.push({
              id: doc.name.split('/').pop(),
              phoneNumber: '62' + fields.phoneNumber.stringValue,
              name: fields.name?.stringValue || ''
            });
          }
        });
      }

      return res.status(200).json({
        success: true,
        total_active: numbersList.length,
        numbers: numbersList
      });
    }

    if (req.method === 'POST') {
      const { phoneNumber, name, action } = req.body;

      if (action === 'delete') {
        if (!phoneNumber) {
          return res.status(400).json({ error: "BAD REQUEST: phoneNumber wajib diisi untuk menghapus!" });
        }
        let phone = phoneNumber.replace(/[^0-9]/g, '');
        if (phone.startsWith('62')) phone = phone.substring(2);
        if (phone.startsWith('0')) phone = phone.substring(1);

        const checkRes = await fetch(`${dbBaseUrl}/whatsapp_numbers?pageSize=300`, {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });

        if (!checkRes.ok) throw new Error("Gagal mengambil database nomor!");
        const checkData = await checkRes.json();

        let targetDocId = null;
        if (checkData.documents) {
          const matchedDoc = checkData.documents.find(d => d.fields?.phoneNumber?.stringValue === phone);
          if (matchedDoc) {
            targetDocId = matchedDoc.name.split('/').pop();
          }
        }

        if (!targetDocId) {
          return res.status(444).json({ error: "NOT FOUND: Nomor tidak ditemukan di whitelist!" });
        }

        const delRes = await fetch(`${dbBaseUrl}/whatsapp_numbers/${targetDocId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${idToken}` }
        });

        if (!delRes.ok) throw new Error("Gagal menghapus nomor!");

        await fetch(`${dbBaseUrl}/activity_logs`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              timestamp: { integerValue: Date.now() },
              userUid: { stringValue: "bot-gateway" },
              userName: { stringValue: "Bot Gateway" },
              userRole: { stringValue: "res" },
              action: { stringValue: `mencabut whitelist nomor WhatsApp (+62 ${phone}) via BOT API` }
            }
          })
        });

        return res.status(200).json({
          success: true,
          message: `SUCCESS: +62${phone} berhasil didelete dari whitelist!`
        });
      }

      if (!phoneNumber || !name) {
        return res.status(400).json({ error: "BAD REQUEST: phoneNumber dan name wajib diisi!" });
      }

      let phone = phoneNumber.replace(/[^0-9]/g, '');
      if (phone.startsWith('62')) phone = phone.substring(2);
      if (phone.startsWith('0')) phone = phone.substring(1);

      const checkRes = await fetch(`${dbBaseUrl}/whatsapp_numbers?pageSize=300`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const isDuplicate = checkData.documents && checkData.documents.some(d => d.fields?.phoneNumber?.stringValue === phone);
        if (isDuplicate) {
          return res.status(409).json({ error: "DUPLICATE: Nomor sudah terdaftar di whitelist!" });
        }
      }

      const bodyPayload = {
        fields: {
          phoneNumber: { stringValue: phone },
          name: { stringValue: name },
          timestamp: { integerValue: Date.now() },
          addedByUid: { stringValue: "bot-gateway" },
          addedByName: { stringValue: "Bot Gateway" },
          addedByRole: { stringValue: "res" }
        }
      };

      const writeRes = await fetch(`${dbBaseUrl}/whatsapp_numbers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!writeRes.ok) throw new Error("Gagal menyimpan nomor baru!");

      await fetch(`${dbBaseUrl}/activity_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: Date.now() },
            userUid: { stringValue: "bot-gateway" },
            userName: { stringValue: "Bot Gateway" },
            userRole: { stringValue: "res" },
            action: { stringValue: `menambahkan whitelist nomor WhatsApp baru (+62 ${phone}) via BOT API` }
          }
        })
      });

      return res.status(200).json({
        success: true,
        message: `SUCCESS Whitelist: +62${phone} berhasil ditambahkan oleh Bot Gateway!`
      });
    }

    if (req.method === 'DELETE') {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "BAD REQUEST: phoneNumber wajib diisi!" });
      }

      let phone = phoneNumber.replace(/[^0-9]/g, '');
      if (phone.startsWith('62')) phone = phone.substring(2);
      if (phone.startsWith('0')) phone = phone.substring(1);

      const checkRes = await fetch(`${dbBaseUrl}/whatsapp_numbers?pageSize=300`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!checkRes.ok) throw new Error("Gagal mengambil database nomor!");
      const checkData = await checkRes.json();

      let targetDocId = null;
      if (checkData.documents) {
        const matchedDoc = checkData.documents.find(d => d.fields?.phoneNumber?.stringValue === phone);
        if (matchedDoc) {
          targetDocId = matchedDoc.name.split('/').pop();
        }
      }

      if (!targetDocId) {
        return res.status(444).json({ error: "NOT FOUND: Nomor tidak ditemukan di whitelist!" });
      }

      const delRes = await fetch(`${dbBaseUrl}/whatsapp_numbers/${targetDocId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!delRes.ok) throw new Error("Gagal menghapus nomor!");

      await fetch(`${dbBaseUrl}/activity_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: Date.now() },
            userUid: { stringValue: "bot-gateway" },
            userName: { stringValue: "Bot Gateway" },
            userRole: { stringValue: "res" },
            action: { stringValue: `mencabut whitelist nomor WhatsApp (+62 ${phone}) via BOT API` }
          }
        })
      });

      return res.status(200).json({
        success: true,
        message: `SUCCESS: +62${phone} berhasil didelete dari whitelist!`
      });
    }

  } catch (err) {
    return res.status(500).json({ error: "INTERNAL SERVER ERROR: " + err.message });
  }
};
