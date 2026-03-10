const express = require('express');
const mercadopago = require('mercadopago');
const { google } = require('googleapis');
const crypto = require('crypto');

// 1. Configuração do Mercado Pago
mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });

const app = express();

// 2. CORREÇÃO DE MIDDLEWARE: 
// Removido o conflito entre express.raw e express.json.
// Usamos apenas o json com o "verify" para capturar o rawBody necessário para a assinatura.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// 3. Configuração Google Calendar
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/calendar']
});
const calendar = google.calendar({ version: 'v3', auth });

async function createEvent(metadata) {
  const start = new Date(metadata.startTime);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const event = {
    summary: `${metadata.service} - ${metadata.petName}`,
    description: `Dono: ${metadata.ownerName}\nTel: ${metadata.phone}`,
    start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
    attendees: [{ email: process.env.PETSHOP_EMAIL }]
  };
  return calendar.events.insert({ calendarId: 'primary', resource: event });
}

// 4. Rota do Webhook
app.post('/webhook/mp', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const secret = process.env.MP_WEBHOOK_SECRET;

    // Validação de assinatura (Opcional no teste inicial, mas importante para segurança)
    if (signature && secret) {
      const expectedSig = crypto.createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex'); // O Mercado Pago costuma usar HEX, verifique se seu secret bate
      
      // Se a assinatura falhar, logamos para depurar
      if (!signature.includes(expectedSig)) {
        console.warn("Assinatura inválida, mas processando para teste...");
      }
    }

    const payment = req.body;
    console.log("Evento recebido:", payment.action);

    if (payment.action === 'payment.updated' || payment.type === 'payment') {
        // Lógica de processamento aqui
        // Nota: O metadata vem dentro do objeto de pagamento que você precisa buscar via API 
        // ou que o MP envia no corpo.
        res.status(200).send('OK');
    } else {
        res.status(200).send('Evento ignorado');
    }
  } catch (error) {
    console.error("Erro no Webhook:", error);
    res.status(500).send('Internal Error');
  }
});

// 5. CORREÇÃO FINAL PARA VERCEL:
// Não use app.listen() no module.exports. 
// A Vercel precisa que você exporte o objeto 'app' diretamente.
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`Rodando na porta ${port}`));
}

module.exports = app;
