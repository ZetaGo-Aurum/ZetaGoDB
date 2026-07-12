const PROJECT_ID = 'server-media-75fdc';
const SITE_KEY = '6LdozU8tAAAAAANPGLIzY2s0YIfN8agJXMfP0o2c';
const ASSESSMENT_URL = `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments`;

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

  const apiKey = process.env.RECAPTCHA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "SERVER ERROR: RECAPTCHA_API_KEY environment variable belum dikonfigurasi di Vercel!" });
  }

  const token = (req.body && req.body.token) || req.query.token;
  const expectedAction = (req.body && req.body.action) || req.query.action || 'LOGIN';
  if (!token) {
    return res.status(400).json({ success: false, error: "BAD REQUEST: Token reCAPTCHA wajib disertakan!" });
  }

  try {
    const assessmentResponse = await fetch(`${ASSESSMENT_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          token: token,
          siteKey: SITE_KEY,
          expectedAction: expectedAction
        }
      })
    });

    const data = await assessmentResponse.json();

    if (!assessmentResponse.ok) {
      return res.status(400).json({ success: false, error: "reCAPTCHA assessment gagal!", details: data.error || data });
    }

    const props = data.tokenProperties || {};
    if (props.valid !== true) {
      return res.status(400).json({ success: false, error: "Token reCAPTCHA tidak valid!", details: props.invalidReason || null });
    }
    if (props.action && props.action !== expectedAction) {
      return res.status(400).json({ success: false, error: "reCAPTCHA action tidak cocok!" });
    }

    const score = (data.riskAnalysis && data.riskAnalysis.score) || 0;
    if (typeof score === 'number' && score < 0.3) {
      return res.status(400).json({ success: false, error: "Skor reCAPTCHA terlalu rendah, akses ditolak!" });
    }

    return res.status(200).json({ success: true, score: score });
  } catch (err) {
    return res.status(500).json({ success: false, error: "INTERNAL SERVER ERROR: " + err.message });
  }
};
