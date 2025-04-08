const express = require('express');
const { Client } = require('@line/bot-sdk');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: '', // 今回は使わないので空にしておきます
};

const client = new Client(config);

app.post('/', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const replyText = `あなたのメッセージ: ${event.message.text}`;
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
