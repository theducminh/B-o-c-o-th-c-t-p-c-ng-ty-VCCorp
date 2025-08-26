import axios from "axios";

const ZALO_OA_TOKEN = process.env.ZALO_OA_TOKEN;

export async function sendZaloMessage(userId, message) {
  try {
    const res = await axios.post(
      "https://openapi.zalo.me/v2.0/oa/message",
      {
        recipient: { user_id: userId },
        message: { text: message },
      },
      {
        headers: {
          access_token: ZALO_OA_TOKEN,
        },
      }
    );
    console.log("[Zalo] Sent:", res.data);
  } catch (err) {
    console.error("[Zalo Error]", err.response?.data || err.message);
  }
}
