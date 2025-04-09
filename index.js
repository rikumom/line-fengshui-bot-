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

// webhook
app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;

  await Promise.all(events.map(async (event) => {
    if (event.type === "message" && event.message.type === "text") {
      const userMessage = event.message.text;

      await doc.useServiceAccountAuth(auth);
      await doc.loadInfo();

      // ✅ キャッシュシートを読み込む
      const cacheSheet = doc.sheetsByTitle["キャッシュ"];
      const cacheRows = await cacheSheet.getRows();

      // ✅ キャッシュ確認
      const cached = cacheRows.find(row => row.メッセージ === userMessage);
      let gptReply = "";

      if (cached) {
        console.log("キャッシュから応答を取得しました");
        gptReply = cached.GPT回答;
      } else {
        console.log("GPTに新規リクエストを送信");
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

          // ✅ GPTの返答をキャッシュに保存
          await cacheSheet.addRow({
            日時: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            メッセージ: userMessage,
            GPT回答: gptReply,
          });
        } catch (err) {
          console.error("ChatGPTエラー:", err);
          gptReply = "ごめんなさい、ただいまアドバイスができませんでした…";
        }
      }

      // ✅ 商品提案（商品リストからキーワード一致）
      let productReply = "";
      try {
        const productSheet = doc.sheetsByTitle["商品リスト"];
        const rows = await productSheet.getRows();

        const matched = rows.find((row) => {
          const keywords = row.悩みキーワード?.split(",").map(k => k.trim());
          return keywords?.some((k) =>
            userMessage.includes(k) || k.includes(userMessage)
          );
        });

        if (matched) {
          productReply = `\n\n【おすすめ商品】\n${matched.商品名}\n${matched.商品説明}\n${matched.商品リンク}`;
        }
      } catch (err) {
        console.error("商品提案エラー:", err);
      }

      const finalReply = gptReply + productReply;
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: finalReply,
      });
    }
  }));

  res.status(200).end();
});

app.use(express.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`BOTが起動しました（PORT: ${port}）`);
});
