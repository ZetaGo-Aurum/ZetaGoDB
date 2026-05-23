const appId = 'server-media-75fdc';
const _hT = "5a657461536869656c645f5a54477259485264523432343234383438345f39663862326337613165306433663462356136633764386539663061316232635f5365637572654761746577617953797374656d546f6b656e5f64663834393330323934383230313934383230313934383230325f416c7068615839395f56657263656c50726f645f323032365f64425f417574685f4b65795f456e63727970745f4345454f43535f436f6d706c65785f7538336a64786e3832393130333934385f5a54477259485264523432343234383438345f5365637572654163636573734761746577617941757468656e7469636174696f6e53797374656d4b65795f76393238666b73393230316d7368643832303139736864626636333973686462666e";
const _zT = _hT.match(/.{1,2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
const _hE = "64656c74616173747261323440676d61696c2e636f6d";
const _zEmail = _hE.match(/.{1,2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
const rolePower = { 'dev': 5, 'owner': 4, 'staff': 3, 'pt': 2, 'res': 1 };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-auth-email, x-auth-password');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "METHOD NOT ALLOWED: Hanya menerima metode POST!" });
  }

  const token = req.query.token || req.headers['x-api-key'] || req.body.token;
  if (token !== _zT) {
    return res.status(401).json({ error: "UNAUTHORIZED: Token tidak valid!" });
  }

  const email = req.headers['x-auth-email'] || req.body.email;
  const password = req.headers['x-auth-password'] || req.body.password;

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
      return res.status(401).json({ error: "UNAUTHORIZED: Kredensial akun tidak valid atau salah!" });
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

    const loggedPower = rolePower[userRole] || 1;
    const { action, name, role, email: targetEmail, password: targetPassword, targetUid } = req.body;

    if (action === 'get_accounts' || action === 'get_users') {
      const accRes = await fetch(`${dbBaseUrl}/accounts?pageSize=300`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!accRes.ok) throw new Error("Gagal mengambil database akun!");
      const accData = await accRes.json();

      const accountsList = [];
      if (accData.documents) {
        accData.documents.forEach(doc => {
          const fields = doc.fields;
          if (fields) {
            const accRole = fields.role?.stringValue || 'res';
            const targetPower = rolePower[accRole] || 1;
            if (userRole === 'dev' || targetPower < loggedPower) {
              accountsList.push({
                id: doc.name.split('/').pop(),
                name: fields.name?.stringValue || '',
                email: fields.email?.stringValue || '',
                role: accRole,
                disabled: fields.disabled?.booleanValue || false,
                createdByUid: fields.createdByUid?.stringValue || ''
              });
            }
          }
        });
      }

      return res.status(200).json({
        success: true,
        total_accounts: accountsList.length,
        accounts: accountsList
      });
    }

    if (action === 'add_user') {
      if (userRole === 'res') {
        return res.status(403).json({ error: "FORBIDDEN: Reseller tidak memiliki wewenang membuat akun baru!" });
      }

      if (!name || !role) {
        return res.status(400).json({ error: "BAD REQUEST: name dan role wajib diisi!" });
      }

      if (role === 'dev') {
        return res.status(403).json({ error: "FORBIDDEN: Pangkat DEV adalah hak mutlak ZetaGo-Aurum dan tidak dapat dibuat melalui API!" });
      }

      const targetPower = rolePower[role] || 1;
      if (userRole !== 'dev' && targetPower >= loggedPower) {
        return res.status(403).json({ error: "FORBIDDEN: Anda hanya bisa mendaftarkan akun di bawah level role Anda saat ini!" });
      }

      let cleanedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanedName) cleanedName = 'user';
      
      let suffix = '@res.db';
      if (role === 'owner') suffix = '@owner.db';
      if (role === 'staff') suffix = '@staff.db';
      if (role === 'pt') suffix = '@pt.db';

      let computedEmail = cleanedName + suffix;

      const checkExistRes = await fetch(`${dbBaseUrl}/accounts?pageSize=300`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (checkExistRes.ok) {
        const existData = await checkExistRes.json();
        let counter = 1;
        while (existData.documents && existData.documents.some(d => d.fields?.email?.stringValue?.toLowerCase() === computedEmail.toLowerCase())) {
          computedEmail = cleanedName + counter + suffix;
          counter++;
        }
      }

      let pass = targetPassword;
      if (!pass) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
        pass = '';
        for (let i = 0; i < 10; i++) {
          pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }

      const registerUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
      const regResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: computedEmail, password: pass, returnSecureToken: true })
      });

      if (!regResponse.ok) {
        const errorData = await regResponse.json();
        return res.status(400).json({ error: "Gagal membuat kredensial Firebase: " + (errorData.error?.message || "Email sudah digunakan!") });
      }

      const regData = await regResponse.json();
      const newUid = regData.localId;

      const writeUserRes = await fetch(`${dbBaseUrl}/accounts/${newUid}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            name: { stringValue: name },
            email: { stringValue: computedEmail },
            password: { stringValue: pass },
            role: { stringValue: role },
            disabled: { booleanValue: false },
            createdByUid: { stringValue: uid },
            createdByName: { stringValue: userName },
            createdByRole: { stringValue: userRole },
            timestamp: { integerValue: String(Date.now()) }
          }
        })
      });

      if (!writeUserRes.ok) throw new Error("Gagal menulis data bawahan baru!");

      await fetch(`${dbBaseUrl}/activity_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: String(Date.now()) },
            userUid: { stringValue: uid },
            userName: { stringValue: userName },
            userRole: { stringValue: userRole },
            action: { stringValue: `membuat kredensial bawahan baru level ${role.toUpperCase()} (${name}) via BOT API` }
          }
        })
      });

      return res.status(200).json({
        success: true,
        message: "Akun bawahan baru berhasil didaftarkan!",
        email: computedEmail,
        password: pass,
        uid: newUid
      });
    }

    if (action === 'delete_user') {
      if (!targetUid) {
        return res.status(400).json({ error: "BAD REQUEST: targetUid wajib disertakan!" });
      }

      const targetDocUrl = `${dbBaseUrl}/accounts/${targetUid}`;
      const targetRes = await fetch(targetDocUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!targetRes.ok) {
        return res.status(444).json({ error: "NOT FOUND: Akun target tidak ditemukan!" });
      }

      const targetData = await targetRes.json();
      const targetName = targetData.fields?.name?.stringValue || "Unknown";
      const targetRole = targetData.fields?.role?.stringValue || 'res';
      const targetPower = rolePower[targetRole] || 1;

      if (userRole !== 'dev' && targetPower >= loggedPower) {
        return res.status(403).json({ error: "FORBIDDEN: Anda tidak memiliki akses untuk menghapus akun ini!" });
      }

      const delAccRes = await fetch(targetDocUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!delAccRes.ok) throw new Error("Gagal menghapus dokumen akun!");

      await fetch(`${dbBaseUrl}/activity_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: String(Date.now()) },
            userUid: { stringValue: uid },
            userName: { stringValue: userName },
            userRole: { stringValue: userRole },
            action: { stringValue: `menghapus total akun bawahan secara bersih (${targetName}) via BOT API` }
          }
        })
      });

      const checkNumsRes = await fetch(`${dbBaseUrl}/whatsapp_numbers?pageSize=300`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (checkNumsRes.ok) {
        const numData = await checkNumsRes.json();
        if (numData.documents) {
          const matchedDocs = numData.documents.filter(d => d.fields?.addedByUid?.stringValue === targetUid);
          for (const d of matchedDocs) {
            const matchedId = d.name.split('/').pop();
            await fetch(`${dbBaseUrl}/whatsapp_numbers/${matchedId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${idToken}` }
            });
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: "Akun beserta seluruh nomor whitelisted miliknya berhasil dihapus total tanpa sisa!"
      });
    }

    return res.status(400).json({ error: "BAD REQUEST: Action tidak dikenali!" });

  } catch (err) {
    return res.status(500).json({ error: "INTERNAL SERVER ERROR: " + err.message });
  }
};
