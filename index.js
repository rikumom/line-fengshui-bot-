const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  const event = req.body.events[0];
  const userMessage = event.message.text;

  try {
    // ChatGPTへの問い合わせ
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "あなたは優しく丁寧な風水アドバイザーです。恋愛運、金運、仕事運などに関して簡潔にアドバイスしてください。"
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const replyMessage = aiResponse.data.choices[0].message.content.trim();

    // LINEに返信
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: event.replyToken,
        messages: [{ type: "text", text: replyMessage }]
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).send("OK");
  } catch (err) {
    console.error("エラー:", err.message);
    res.status(500).send("Error");
  }
});

app.get("/", (req, res) => {
  res.send("風水Botは稼働中です✨");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
