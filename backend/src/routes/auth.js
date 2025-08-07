// routes/auth.js
import express from 'express';
import { getAuthURL, handleOAuthCallback } from '../auth/google.js';

const router = express.Router();

// Bắt đầu xác thực Google OAuth
router.get('/google', (req, res) => {
  try {
    const url = getAuthURL();
    return res.redirect(url);
  } catch (error) {
    console.error('[Auth] Error generating Google auth URL:', error);
    return res.status(500).json({ error: 'Failed to generate Google auth URL' });
  }
});

router.get('/google/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const result = await handleOAuthCallback(code);
    // Sau khi có token, gửi về window opener
    return res.send(`
      <script>
        window.opener.postMessage(${JSON.stringify(result)}, '*');
        window.close();
      </script>
    `);
  } catch (error) {
    console.error('[Auth] Google callback error:', error); // Log rõ
    return res.status(500).json({
      error: 'Failed to handle Google callback',
      message: error.message,
    });
  }
});


export default router;
