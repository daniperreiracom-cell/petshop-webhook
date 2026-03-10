const express = require('express');
const { google } = require('googleapis');

const app = express();

app.use(express.json());

/* 1. CONFIGURACAO GOOGLE CALENDAR */
let calendar = null;

try {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.error('❌ Variável GOOGLE_SERVICE_ACCOUNT não encontrada.');
  } else {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    calendar = google.calendar({ version: 'v3', auth });
    console.log('✅ Google Calendar pronto.');
  }
} catch (e) {
  console.error('❌ Erro nas credenciais do Google:', e.message);
}

/* 2. FUNCAO PARA CRIAR O EVENTO NA AGENDA */
async function createEvent(metadata) {
  try {
    if (!calendar) {
      console.error('❌ Google Calendar não foi inicializado.');
      return null;
    }

    if (!metadata || !metadata.start_time) {
      console.error('❌ Metadata inválido ou sem start_time:', metadata);
      return null;
    }

    const start = new Date(metadata.start_time);

    if (isNaN(start.getTime())) {
      console.error('❌ Data inválida em metadata.start_time:', metadata.start_time);
      return null;
    }

    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const calendarId = process.env.PETSHOP_EMAIL;

    if (!calendarId) {
      console.error('❌ Variável PETSHOP_EMAIL não definida.');
      return null;
    }

    const event = {
      summary: `🐾 PET: ${metadata.pet_name || 'Sem nome'} (${metadata.service || 'Serviço'})`,
      description:
        `Dono: ${metadata.owner_name || 'Não informado'}\n` +
        `Telefone: ${metadata.phone || 'Não informado'}\n` +
        `Pagamento aprovado via Mercado Pago.`,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'America/Sao_Paulo'
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'America/Sao_Paulo'
      }
    };

    console.log('📅 Tentando criar evento no Google Calendar...');
    console.log('📌 Calendar ID:', calendarId);
    console.log('📌 Evento:', JSON.stringify(event, null, 2));

    const result = await calendar.events.insert({
      calendarId: calendarId,
      resource: event
    });

    console.log('✅ Evento criado com sucesso no Google Calendar.');
    console.log('🔗 Event ID:', result.data.id);

    return result.data;
  } catch (error) {
    const details = error && error.response && error.response.data
      ? error.response.data
      : error.message;

    console.error('❌ Erro ao criar evento no Google Calendar:', details);
    return null;
  }
}

/* 3. ROTA DE TESTE PARA GERAR PAGAMENTO */
app.get('/gerar-pagamento-teste', async (req, res) => {
  try {
    console.log('🧪 Gerando pagamento de teste...');

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            title: 'Serviço PetShop Teste',
            quantity: 1,
            unit_price: 1.00,
            currency_id: 'BRL'
          }
        ],
        notification_url: 'https://project-7wgxx.vercel.app/webhook/mp',
        metadata: {
          start_time: '2026-03-15T14:00:00.000-03:00',
          service: 'Banho e Tosa',
          pet_name: 'Rex Teste',
          owner_name: 'Cliente Exemplo',
          phone: '11999999999'
        }
      })
    });

    const preference = await response.json();

    console.log('📨 Resposta Mercado Pago preferência:', preference);

    if (!preference.init_point) {
      return res.status(500).send('❌ Mercado Pago não retornou init_point. Verifique o token e a resposta da API.');
    }

    return res.redirect(preference.init_point);
  } catch (error) {
    console.error('❌ Erro ao gerar link de pagamento:', error.message);
    return res.status(500).send('Erro ao gerar link: ' + error.message);
  }
});

/* 4. NOVA ROTA PARA GERAR LINK REAL DO PETSHOP */
app.get('/gerar-link-petshop', async (req, res) => {
  try {
    const {
      pet,
      dono,
      telefone,
      servico,
      data,
      hora,
      valor
    } = req.query;

    if (!pet || !dono || !servico || !data || !hora || !valor) {
      return res.status(400).json({
        erro: 'Parâmetros obrigatórios: pet, dono, servico, data, hora, valor'
      });
    }

    const valorNumerico = Number(valor);

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({
        erro: 'O parâmetro valor deve ser numérico e maior que zero.'
      });
    }

    const startTime = `${data}T${hora}:00-03:00`;

    console.log('🐶 Gerando link petshop com os dados:');
    console.log({
      pet,
      dono,
      telefone,
      servico,
      data,
      hora,
      valor: valorNumerico,
      start_time: startTime
    });

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            title: `PetShop - ${servico} (${pet})`,
            quantity: 1,
            unit_price: valorNumerico,
            currency_id: 'BRL'
          }
        ],
        notification_url: 'https://project-7wgxx.vercel.app/webhook/mp',
        metadata: {
          start_time: startTime,
          service: servico,
          pet_name: pet,
          owner_name: dono,
          phone: telefone || ''
        }
      })
    });

    const preference = await response.json();

    console.log('📨 Resposta Mercado Pago link petshop:', preference);

    if (!preference.init_point) {
      return res.status(500).json({
        erro: 'Erro ao gerar pagamento no Mercado Pago.',
        detalhes: preference
      });
    }

    return res.json({
      mensagem: 'Link gerado com sucesso',
      link_pagamento: preference.init_point,
      dados_agendamento: {
        pet,
        dono,
        telefone: telefone || '',
        servico,
        data,
        hora,
        valor: valorNumerico
      }
    });
  } catch (err) {
    console.error('❌ Erro ao gerar pagamento do petshop:', err.message);
    return res.status(500).json({
      erro: 'Erro interno ao gerar link de pagamento.'
    });
  }
});

/* 5. WEBHOOK MERCADO PAGO */
app.post('/webhook/mp', async (req, res) => {
  try {
    console.log('📩 Webhook recebido do Mercado Pago.');
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));

    const { action, data } = req.body;

    if (!action || !data || !data.id) {
      console.log('⚠️ Webhook sem action ou data.id. Ignorando.');
      return res.status(200).send('OK');
    }

    if (action === 'payment.created' || action === 'payment.updated') {
      console.log(`🔎 Consultando pagamento ${data.id} no Mercado Pago...`);

      const resMP = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      });

      const payment = await resMP.json();

      console.log('💳 Dados do pagamento:', JSON.stringify(payment, null, 2));
      console.log('📌 Status do pagamento:', payment.status);

      if (payment.status === 'approved') {
        console.log('💰 Pagamento aprovado! Agendando no Google Calendar...');

        const createdEvent = await createEvent(payment.metadata);

        if (createdEvent) {
          console.log('✅ Agendamento concluído com sucesso.');
        } else {
          console.log('⚠️ Pagamento aprovado, mas o evento não foi criado.');
        }
      } else {
        console.log(`ℹ️ Pagamento ainda não aprovado. Status atual: ${payment.status}`);
      }
    } else {
      console.log(`ℹ️ Ação recebida e ignorada: ${action}`);
    }

    return res.status(200).send('OK');
  } catch (err) {
    const details = err && err.response && err.response.data
      ? err.response.data
      : err.message;

    console.error('❌ Erro no processamento do webhook:', details);
    return res.status(200).send('OK');
  }
});

/* 6. ROTA RAIZ */
app.get('/', (req, res) => {
  res.send('Servidor Petshop Online!');
});

module.exports = app;
