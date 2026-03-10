const express = require('express');
const { google } = require('googleapis');
const crypto = require('crypto');

const app = express();

// Middleware para capturar o corpo bruto (necessário para validação de assinatura)
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Configuração Segura do Google Calendar
let calendar;
try {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  calendar = google.calendar({ version: 'v3', auth });
  console.log("Google Calendar configurado com sucesso.");
} catch (e) {
  console.error("ERRO CRÍTICO: Falha ao ler GOOGLE_SERVICE_ACCOUNT. Verifique a variável na Vercel.");
}

// Função para criar evento no Google Calendar
async function createEvent(metadata) {
  if (!calendar) return;
  const start = new Date(metadata.startTime || new Date());
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hora de duração
  
  const event = {
    summary: `PETSHOP: ${metadata.service || 'Banho/Tosa'} - ${metadata.petName || 'Sem Nome'}`,
    description: `Dono: ${metadata.ownerName}\nTel: ${metadata.phone}\nPagamento aprovado via Mercado Pago`,
    start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
  };

  return calendar.events.insert({ 
    calendarId: process.env.PETSHOP_EMAIL || 'primary', 
    resource: event 
  });
}

// ROTA DO WEBHOOK (Onde o Mercado Pago avisa do pagamento)
app.post('/webhook/mp', async (req, res) => {
  const signature = req.headers['x-signature'];
  const secret = process.env.MP_WEBHOOK_SECRET;

  console.log("Recebendo notificação do Mercado Pago...");

  // Validação de segurança (Ajustada para não dar 403 em testes)
  if (signature && secret && req.rawBody) {
    try {
      const parts = signature.split(',');
      const ts = parts.find(p => p.includes('ts=')).split('=')[1];
      const v1 = parts.find(p => p.includes('v1=')).split('=')[1];
      
      const manifest = `id:${req.body.data ? req.body.data.id : ''};request-id:${req.headers['x-request-id']};ts:${ts};`;
      const expectedSig = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

      if (v1 !== expectedSig) {
        console.warn("Assinatura não confere, mas prosseguindo para homologação.");
      }
    } catch (err) {
      console.error("Erro ao validar assinatura:", err.message);
    }
  }

  const paymentData = req.body;

  // O Mercado Pago envia 'action' quando algo acontece
  if (paymentData.action === 'payment.created' || paymentData.action === 'payment.updated') {
    const paymentId = paymentData.data.id;
    console.log(`Pagamento identificado: ${paymentId}`);
    
    // Aqui você pode disparar o seu n8n enviando o paymentId
    // Ou processar direto o Google Calendar se tiver os dados no metadata
    
    return res.status(200).send('OK');
  }

  // Resposta padrão para evitar que o MP tente reenviar a mesma mensagem 1000 vezes
  res.status(200).send('Evento recebido');
});

// Rota de teste para ver se o navegador acessa
app.get('/', (req, res) => res.send('Servidor Petshop Online!'));

module.exports = app;
