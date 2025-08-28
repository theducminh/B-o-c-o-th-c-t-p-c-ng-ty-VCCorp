// testGroq.js
import OpenAI from "openai";
import dotenv from 'dotenv';

dotenv.config(); // Load .env file

// Dùng Groq API thông qua OpenAI SDK
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,         // lấy từ .env
  baseURL: "https://api.groq.com/openai/v1" // quan trọng
});

async function testGroq() {
  try {
    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant", // model free của Groq
      messages: [{ role: "user", content: "Nói 'xin chào' bằng tiếng Việt." }],
      temperature: 0,
    });

    console.log("API response:", response.choices[0].message.content);
  } catch (err) {
    console.error(" API error:", err.message || err);
  }
}

testGroq();
