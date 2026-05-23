const appId = 'server-media-75fdc';
const _hT = "5a657461536869656c645f5a54477259485264523432343234383438345f39663862326337613165306433663462356136633764386539663061316232635f5365637572654761746577617953797374656d546f6b656e5f64663834393330323934383230313934383230313934383230313934383230325f416c7068615839395f56657263656c50726f645f323032365f64425f417574685f4b65795f456e63727970745f4345454f43535f436f6d706c65785f7538336a64786e3832393130333934385f5a54477259485264523432343234383438345f5365637572654163636573734761746577617941757468656e7469636174696f6e53797374656d4b65795f76393238666b73393230316d736864383230313937336864626636333937336864626636366n";
const _zT = _hT.match(/.{1,2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
const _hE = "64656c74616173747261323440676d61696c2e636f6d";
const _zEmail = _hE.match(/.{1,2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
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
  if (token !== _zT) {
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
    let isPremium = false;
    let premiumUntil = 0;

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
      isPremium = userData.fields?.isPremium?.booleanValue || false;
      premiumUntil = userData.fields?.premiumUntil?.integerValue ? parseInt(userData.fields.premiumUntil.integerValue) : 0;
    }

    if (userRole !== 'dev') {
      if (userRole !== 'owner') {
        return res.status(403).json({ error: "FORBIDDEN: Akses API hanya diizinkan untuk Owner dan Developer!" });
      }
      if (!isPremium || premiumUntil < Date.now()) {
        return res.status(403).json({ error: "FORBIDDEN: Masa aktif premium sewa API Anda telah kedaluwarsa atau belum diaktifkan! Harap sewa via Trakteer." });
      }
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
                phoneNumber: fields.phoneNumber.stringValue,
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
        if (phone.startsWith('0')) phone = '62' + phone.substring(1);

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
              timestamp: { integerValue: String(Date.now()) },
              userUid: { stringValue: uid },
              userName: { stringValue: userName },
              userRole: { stringValue: userRole },
              action: { stringValue: `mencabut whitelist nomor WhatsApp (${phone}) via BOT API` }
            }
          })
        });

        return res.status(200).json({
          success: true,
          message: `SUCCESS: ${phone} berhasil didelete dari whitelist!`
        });
      }

      if (!phoneNumber || !name) {
        return res.status(400).json({ error: "BAD REQUEST: phoneNumber dan name wajib diisi!" });
      }

      let phone = phoneNumber.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) phone = '62' + phone.substring(1);

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
          timestamp: { integerValue: String(Date.now()) },
          addedByUid: { stringValue: uid },
          addedByName: { stringValue: userName },
          addedByRole: { stringValue: userRole }
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

      if (!writeRes.ok) throw new Error("Gagal menyimpan nomor!");

      await fetch(`${dbBaseUrl}/activity_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: String(Date.now()) },
            userUid: { stringValue: uid },
            userName: { stringValue: userName },
            userRole: { stringValue: userRole },
            action: { stringValue: `menambahkan whitelist nomor WhatsApp baru (${phone}) via BOT API` }
          }
        })
      });

      return res.status(200).json({
        success: true,
        message: `SUCCESS Whitelist: ${phone} berhasil ditambahkan oleh ${userName}!`
      });
    }

    if (req.method === 'DELETE') {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "BAD REQUEST: phoneNumber wajib diisi!" });
      }

      let phone = phoneNumber.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) phone = '62' + phone.substring(1);

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
            timestamp: { integerValue: String(Date.now()) },
            userUid: { stringValue: uid },
            userName: { stringValue: userName },
            userRole: { stringValue: userRole },
            action: { stringValue: `mencabut whitelist nomor WhatsApp (${phone}) via BOT API` }
          }
        })
      });

      return res.status(200).json({
        success: true,
        message: `SUCCESS: ${phone} berhasil didelete dari whitelist!`
      });
    }

  } catch (err) {
    return res.status(500).json({ error: "INTERNAL SERVER ERROR: " + err.message });
  }
};
