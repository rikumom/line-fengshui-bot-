const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { Configuration, OpenAIApi } = require("openai");
const crypto = require("crypto");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

// 環境変数
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// 署名検証
function validateSignature(signature, body) {
  const hash = crypto
    .createHmac("SHA256", LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// 生データ保持
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Webhook受信
app.post("/", async (req, res) => {
  const signature = req.headers["x-line-signature"];
  if (!validateSignature(signature, req.rawBody)) {
    return res.status(403).send("Invalid signature");
  }

  const event = req.body.events?.[0];
  if (!event || !event.message || !event.replyToken) {
    return res.status(200).send("No valid message event");
  }

  const userMessage = event.message.text;
  const replyToken = event.replyToken;

  try {
    const advice = await getChatGPTAdvice(userMessage);
    const items = await getProductList();
    const recommended = recommendItem(userMessage, items);

    const replyMessage = `${advice}\n\n【おすすめアイテム】\n${recommended}`;
    await replyToLINE(replyToken, replyMessage);

    res.send("OK");
  } catch (error) {
    console.error("処理中にエラー:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ChatGPTの回答を取得
async function getChatGPTAdvice(userMessage) {
  const config = new Configuration({ apiKey: OPENAI_API_KEY });
  const openai = new OpenAIApi(config);
  const chat = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: "あなたは優しく丁寧な風水アドバイザーです。恋愛運、金運、仕事運などに対して、実践的で簡単なアドバイスをしてください。"
      },
      {
        role: "user",
        content: userMessage
      }
    ]
  });
  return chat.data.choices[0].message.content.trim();
}

// 商品リストを取得（Google Sheets）
async function getProductList() {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(GOOGLE_SERVICE_ACCOUNT);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["商品リスト"];
  const rows = await sheet.getRows();
  return rows.map(row => ({
    name: row["商品名"],
    description: row["商品説明"],
    url: row["商品リンク"]
  }));
}

// 商品を選ぶロジック
function recommendItem(userMessage, items) {
  const keyword = userMessage.toLowerCase();
  for (let item of items) {
    const text = `${item.name} ${item.description}`.toLowerCase();
    if (text.includes(keyword)) {
      return `${item.name}\n${item.description}\n購入はこちら: ${item.url}`;
    }
  }
  return "今のご相談にぴったりの商品はまだ準備中です✨";
}

// LINEへ返信
async function replyToLINE(token, message) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken: token,
      messages: [{ type: "text", text: message }]
    })
  });
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
