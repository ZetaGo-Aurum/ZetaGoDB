const appId = 'server-media-75fdc';
const SECURE_TOKEN = "ZetaShield_ZTGrYHRdR424248484_9f8b2c7a1e0d3f4b5a6c7d8e9f0a1b2c_SecureGatewaySystemToken_df849302948201948201948201948202_AlphaX99_VercelProd_2026_dB_Auth_Key_Encrypt_CEEOCS_Complex_u83jdxn829103948_ZTGrYHRdR424248484_SecureAccessGatewayAuthenticationSystemKey_v928fks9201mshd82019shdbf639shdbfn";

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
            accountsList.push({
              id: doc.name.split('/').pop(),
              name: fields.name?.stringValue || '',
              email: fields.email?.stringValue || '',
              role: fields.role?.stringValue || '',
              disabled: fields.disabled?.booleanValue || false,
              createdByUid: fields.createdByUid?.stringValue || ''
            });
          }
        });
      }

      return res.status(200).json({
        success: true,
        total_accounts: accountsList.length,
        accounts: accountsList
      });
    }

    if (req.method === 'POST') {
      const { action, name, role, email, password, targetUid } = req.body;

      if (action === 'add_user') {
        if (!name || !role) {
          return res.status(400).json({ error: "BAD REQUEST: name dan role wajib diisi!" });
        }

        if (role === 'dev') {
          return res.status(403).json({ error: "FORBIDDEN: Pangkat DEV adalah hak mutlak ZetaGo-Aurum dan tidak dapat dibuat melalui API!" });
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

        let pass = password;
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
              createdByUid: { stringValue: "bot-gateway" },
              createdByName: { stringValue: "Bot Gateway" },
              createdByRole: { stringValue: "dev" },
              timestamp: { integerValue: Date.now() }
            }
          })
        });

        if (!writeUserRes.ok) throw new Error("Gagal menulis data bawahan baru!");

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

        const delAccRes = await fetch(`${dbBaseUrl}/accounts/${targetUid}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${idToken}` }
        });

        if (!delAccRes.ok) throw new Error("Gagal menghapus dokumen akun!");

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
    }

  } catch (err) {
    return res.status(500).json({ error: "INTERNAL SERVER ERROR: " + err.message });
  }
};
