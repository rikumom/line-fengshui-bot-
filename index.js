const express = require("express");
const { Client } = require("@line/bot-sdk");
const bodyParser = require("body-parser");
const axios = require("axios");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
};
const client = new Client(config);

// 環境変数から読み込む
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); // JSON文字列

// Google API 認証
const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT.client_email,
  null,
  GOOGLE_SERVICE_ACCOUNT.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);
const sheets = google.sheets({ version: "v4", auth });

app.post("/", async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (error) {
    console.error("エラー:", error);
    res.status(500).send("エラーが発生しました。");
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return null;

  const userMessage = event.message.text;
  const replyToken = event.replyToken;

  // キャッシュシートからチェック
  const cached = await checkCache(userMessage);
  if (cached) {
    return client.replyMessage(replyToken, {
      type: "text",
      text: cached,
    });
  }

  // ChatGPTアドバイス
  const advice = await getAdvice(userMessage);

  // 商品提案
  const product = await getRecommendedProduct(userMessage);

  const fullReply = `${advice}\n\n【おすすめアイテム】\n${product}`;

  // LINEへ返信
  await client.replyMessage(replyToken, {
    type: "text",
    text: fullReply,
  });

  // キャッシュ保存
  await saveToCache(userMessage, fullReply);

  return true;
}

// ChatGPTからアドバイス取得
async function getAdvice(userMessage) {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "あなたは優しく丁寧な風水アドバイザーです。恋愛運・金運・健康運・仕事運などに関する質問に、初心者にもわかりやすくアドバイスをしてください。",
        },
        { role: "user", content: userMessage },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

// 商品をスプレッドシートから検索して提案
async function getRecommendedProduct(userMessage) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "商品リスト!A2:C",
  });

  const items = res.data.values || [];
  const keyword = userMessage.toLowerCase();

  for (let item of items) {
    const name = item[0] || "";
    const description = item[1] || "";
    const url = item[2] || "";
    const fullText = (name + description).toLowerCase();
    if (fullText.includes(keyword)) {
      return `${name}\n${description}\n購入はこちら: ${url}`;
    }
  }

  return "ぴったりの商品は見つかりませんでしたが、今後追加されるかもしれません✨";
}

// キャッシュから探す
async function checkCache(message) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "キャッシュ!A2:B",
  });

  const rows = res.data.values || [];
  const found = rows.find((row) => row[0] === message);
  return found ? found[1] : null;
}

// キャッシュに保存
async function saveToCache(message, response) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "キャッシュ!A:B",
    valueInputOption: "RAW",
    requestBody: {
      values: [[message, response]],
    },
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
