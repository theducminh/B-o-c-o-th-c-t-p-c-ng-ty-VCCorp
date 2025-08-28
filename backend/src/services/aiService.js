// services/aiService.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- Utils ---
function computeUrgency(deadline) {
  if (!deadline) return "not_urgent";
  const dl = new Date(deadline);
  const now = new Date();
  const diffHours = (dl - now) / 36e5; // ms -> hours
  if (isNaN(diffHours)) return "not_urgent";
  return diffHours <= 24 || diffHours < 0 ? "urgent" : "not_urgent";
}

// --- Main function ---
export async function classifyTaskAI({ title, description = "", deadline, priority = "" }) {
  const urgency = computeUrgency(deadline);

  const prompt = `
Bạn là trợ lý quản lý công việc. Chỉ phân loại "importance".

Quy tắc:
- "important" nếu gắn với mục tiêu/kết quả then chốt: khách hàng, doanh thu, pháp lý/tuân thủ, bảo mật/sự cố sản xuất, hạn nộp chính thức, KPI/OKR, ảnh hưởng lớn đến nhiều người.
- "not_important" nếu chỉ là việc hành chính, tiện ích, hoặc không tác động đáng kể.
- Khi thiếu thông tin, chọn "not_important".

Chỉ trả về JSON hợp lệ, không markdown, không giải thích:
{ "importance": "important|not_important" }

Context:
- Title: "${title}"
- Description: "${description}"
- Deadline: "${deadline || "không có"}"
- Priority_hint: "${priority}"
`;

  try {
    const resp = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    let text = (resp.choices?.[0]?.message?.content || "").trim();
    text = text.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(text);
    const importance =
      parsed.importance === "important" ? "important" : "not_important";

    return { urgency, importance };
  } catch (e) {
    console.error("JSON parse error or API error:", e);
    return { urgency, importance: "not_important" };
  }
}
