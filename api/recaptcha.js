const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: "METHOD NOT ALLOWED: Hanya menerima metode POST!" });
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ success: false, error: "SERVER ERROR: RECAPTCHA_SECRET_KEY environment variable belum dikonfigurasi di Vercel!" });
  }

  const token = (req.body && req.body.token) || req.query.token;
  if (!token) {
    return res.status(400).json({ success: false, error: "BAD REQUEST: Token reCAPTCHA wajib disertakan!" });
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);

    const verifyResponse = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const verifyData = await verifyResponse.json();

    if (verifyData.success) {
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({
      success: false,
      error: "reCAPTCHA tidak valid!",
      details: verifyData['error-codes'] || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "INTERNAL SERVER ERROR: " + err.message });
  }
};
