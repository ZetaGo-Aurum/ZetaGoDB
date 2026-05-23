const appId = 'server-media-75fdc';
const SECURE_TOKEN = "ZetaShield_ZTGrYHRdR424248484_9f8b2c7a1e0d3f4b5a6c7d8e9f0a1b2c_SecureGatewaySystemToken_df849302948201948201948201948202_AlphaX99_VercelProd_2026_dB_Auth_Key_Encrypt_CEEOCS_Complex_u83jdxn829103948_ZTGrYHRdR424248484_SecureAccessGatewayAuthenticationSystemKey_v928fks9201mshd82019shdbf639shdbfn";
const _zEmail = atob("ZGVsdGFhc3RyYTI0QGdtYWlsLmNvbQ==");
const rolePower = { 'dev': 5, 'owner': 4, 'staff': 3, 'pt': 2, 'res': 1 };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-auth-email, x-auth-password');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.query.token || req.headers['x-api-key'] || (req.body && req.body.token);
  if (token !== SECURE_TOKEN) {
    return res.status(401).json({ error: "UNAUTHORIZED: Token tidak valid!" });
  }

  const email = req.headers['x-auth-email'] || req.query.email || (req.body && req.body.email);
  const password = req.headers['x-auth-password'] || req.query.password || (req.body && req.body.password);

  if (!email || !password) {
    return res.status(400).json({ error: "BAD REQUEST: Kredensial email dan password wajib disertakan!" });
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
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    if (!authResponse.ok) {
      return res.status(401).json({ error: "UNAUTHORIZED: Email atau password salah!" });
    }

    const authData = await authResponse.json();
    const idToken = authData.idToken;
    const uid = authData.localId;

    const dbBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data`;

    let userRole = 'res';
    let userName = email;

    if (email.toLowerCase() === _zEmail.toLowerCase()) {
      userRole = 'dev';
      userName = "ZetaGo-Aurum";
    } else {
      const userRes = await fetch(`${dbBaseUrl}/accounts/${uid}`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (!userRes.ok) {
        return res.status(403).json({ error: "FORBIDDEN: Akun Anda tidak terdaftar di database!" });
      }
      const userData = await userRes.json();
      if (userData.fields?.disabled?.booleanValue === true) {
        return res.status(403).json({ error: "BANNED: Akun Anda dinonaktifkan!" });
      }
      userRole = userData.fields?.role?.stringValue || 'res';
      userName = userData.fields?.name?.stringValue || email;
    }

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
            const addedByUid = fields.addedByUid?.stringValue || '';
            if (userRole === 'dev' || userRole === 'owner' || addedByUid === uid) {
              numbersList.push({
                id: doc.name.split('/').pop(),
                phoneNumber: '62' + fields.phoneNumber.stringValue,
                name: fields.name?.stringValue || '',
                addedBy: fields.addedByName?.stringValue || '',
                role: fields.addedByRole?.stringValue || ''
              });
            }
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
      const { phoneNumber, name, action: postAction } = req.body;

      if (postAction === 'delete') {
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
        let targetAddedByUid = null;
        if (checkData.documents) {
          const matchedDoc = checkData.documents.find(d => d.fields?.phoneNumber?.stringValue === phone);
          if (matchedDoc) {
            targetDocId = matchedDoc.name.split('/').pop();
            targetAddedByUid = matchedDoc.fields?.addedByUid?.stringValue || '';
          }
        }

        if (!targetDocId) {
          return res.status(444).json({ error: "NOT FOUND: Nomor tidak ditemukan!" });
        }

        if (userRole !== 'dev' && userRole !== 'owner' && targetAddedByUid !== uid) {
          return res.status(403).json({ error: "FORBIDDEN: Anda tidak memiliki akses untuk menghapus nomor ini!" });
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
              userUid: { stringValue: uid },
              userName: { stringValue: userName },
              userRole: { stringValue: userRole },
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
          return res.status(409).json({ error: "DUPLICATE: Nomor sudah terdaftar!" });
        }
      }

      const bodyPayload = {
        fields: {
          phoneNumber: { stringValue: phone },
          name: { stringValue: name },
          timestamp: { integerValue: Date.now() },
          addedByUid: { stringValue: uid },
          addedByName: { stringValue: userName },
          addedByRole: { stringValue: userRole }
        }
      };

      const writeRes = await fetch(collection(db, 'whatsapp_numbers'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!writeRes.ok) throw new Error("Gagal menyimpan nomor!");

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
        message: `SUCCESS Whitelist: +62${phone} berhasil ditambahkan oleh ${userName}!`
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
      let targetAddedByUid = null;
      if (checkData.documents) {
        const matchedDoc = checkData.documents.find(d => d.fields?.phoneNumber?.stringValue === phone);
        if (matchedDoc) {
          targetDocId = matchedDoc.name.split('/').pop();
          targetAddedByUid = matchedDoc.fields?.addedByUid?.stringValue || '';
        }
      }

      if (!targetDocId) {
        return res.status(444).json({ error: "NOT FOUND: Nomor tidak ditemukan!" });
      }

      if (userRole !== 'dev' && userRole !== 'owner' && targetAddedByUid !== uid) {
        return res.status(403).json({ error: "FORBIDDEN: Anda tidak memiliki akses!" });
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
            userUid: { stringValue: uid },
            userName: { stringValue: userName },
            userRole: { stringValue: userRole },
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
