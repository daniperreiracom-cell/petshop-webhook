const express = require('express');
const { google } = require('googleapis');

const app = express();

app.use(express.json());

// 1. CONFIGURAÇÃO GOOGLE CALENDAR
let calendar;
try {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  calendar = google.calendar({ version: 'v3', auth });
  console.log("✅ Google Calendar pronto.");
} catch (e) {
  console.error("❌ Erro nas credenciais do Google.");
}

// 2. FUNÇÃO PARA CRIAR O EVENTO NA AGENDA
async function createEvent(metadata) {
  if (!calendar) return;
  
  const start = new Date(metadata.start_time);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1h de duração

  const event = {
    summary: `🐾 PET: ${metadata.pet_name} (${metadata.service})`,
    description: `Dono: ${metadata.owner_name}\nTelefone: ${metadata.phone}\nPagamento aprovado via Mercado Pago.`,
    start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
  };

  return calendar.events.insert({
    calendarId: process.env.PETSHOP_EMAIL || 'primary',
    resource: event
  });
}

// 3. ROTA DE TESTE (Passo 3 do seu cenário: Gerar o link de R$ 1,00)
app.get('/gerar-pagamento-teste', async (req, res) => {
  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{ title: "Serviço PetShop Teste", quantity: 1, unit_price: 1.00, currency_id: "BRL" }],
        notification_url: "https://project-7wgxx.vercel.app/webhook/mp",
        metadata: {
          start_time: "2026-03-15T14:00:00.000-03:00", // Data do serviço
          service: "Banho e Tosa",
          pet_name: "Rex Teste",
          owner_name: "Cliente Exemplo",
          phone: "11999999999"
        }
      })
    });
    const preference = await response.json();
    res.redirect(preference.init_point); // Manda o cliente para o pagamento
  } catch (error) {
    res.send("Erro ao gerar link: " + error.message);
  }
});

// 4. WEBHOOK (Passo 5 do seu cenário: Receber a confirmação e agendar)
app.post('/webhook/mp', async (req, res) => {
  const { action, data } = req.body;

  if (action === 'payment.created' || action === 'payment.updated') {
    try {
      // Busca detalhes do pagamento para pegar o nome do pet e data que estão no metadata
      const resMP = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      });
      const payment = await resMP.json();

      if (payment.status === 'approved') {
        console.log("💰 Pagamento aprovado! Agendando...");
        await createEvent(payment.metadata);
      }
    } catch (err) {
      console.error("Erro no processamento:", err);
    }
  }
  res.status(200).send('OK');
});

app.get('/', (req, res) => res.send('Servidor Petshop Online!'));

module.exports = app;
