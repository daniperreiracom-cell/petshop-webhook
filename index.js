const express = require('express');
const mercadopago = require('mercadopago');
const { google } = require('googleapis');
const crypto = require('crypto');

mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });
const app = express();
app.use(express.raw({type: 'application/json'}));
app.use(express.json({ verify: (req, res, buf) => req.rawBody = buf; }));

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/calendar']
});
const calendar = google.calendar({ version: 'v3', auth });

async function createEvent(metadata) {
  const start = new Date(metadata.startTime);
  const end = new Date(start.getTime() + 60*60*1000);
  const event = {
    summary: `${metadata.service} - ${metadata.petName}`,
    description: `Dono: ${metadata.ownerName}\nTel: ${metadata.phone}`,
    start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
    attendees: [{ email: process.env.PETSHOP_EMAIL }]
  };
  return calendar.events.insert({ calendarId: 'primary', resource: event });
}

app.post('/webhook/mp', async (req, res) => {
  const signature = req.headers['x-signature'];
  const expectedSig = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(req.rawBody).digest('base64');
  if (signature !== `v1,${expectedSig}`) return res.status(401).send('Unauthorized');

  const payment = req.body;
  if (payment.action === 'payment.updated' && payment.data.status === 'approved') {
    const metadata = payment.data.metadata;
    await createEvent(metadata);
  }
  res.status(200).send('OK');
});

module.exports = app.listen();

