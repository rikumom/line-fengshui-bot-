const express = require("express");
const line = require("@line/bot-sdk");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// OpenAIの設定
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Googleスプレッドシートの設定
const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
const auth = {
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

// ✅ webhookには middleware を直接適用（jsonはまだ使わない）
app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;

  await Promise.all(events.map(async (event) => {
    if (event.type === "message" && event.message.type === "text") {
      const userMessage = event.message.text;

      // GPTに質問
      let gptReply = "";
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "あなたは風水・スピリチュアルの専門家であり、ユーザーの悩みに親身にアドバイスし、必要に応じて関連商品の提案も行います。",
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
        });
        gptReply = completion.choices[0].message.content;
      } catch (err) {
        console.error("ChatGPTエラー:", err);
        gptReply = "ごめんなさい、ただいまアドバイスができませんでした…";
      }

      // スプレッドシートから商品提案
      let productReply = "";
      try {
        await doc.useServiceAccountAuth(auth);
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle["商品リスト"];
        const rows = await sheet.getRows();

        const matched = rows.find((row) => {
          const keywords = row.悩みキーワード?.split(",").map(k => k.trim());
          return keywords?.some((k) => userMessage.includes(k));
        });

        if (matched) {
          productReply = `\n\n【おすすめ商品】\n${matched.商品名}\n${matched.商品説明}\n${matched.URL}`;
        }
      } catch (err) {
        console.error("スプレッドシートエラー:", err);
      }

      // LINEへ返信
      const finalReply = gptReply + productReply;
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: finalReply,
      });
    }
  }));

  res.status(200).end();
});

// ✅ その他のAPIやルートには json() を使う（必要なら）
app.use(express.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`BOTが起動しました（PORT: ${port}）`);
});
