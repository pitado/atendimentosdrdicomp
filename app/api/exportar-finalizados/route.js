// GET /api/exportar-finalizados?quantidade=10
//
// Puxa chats FECHADOS/FINALIZADOS com o histórico completo de cada um, pra
// servir de base de referência (ver como atendimentos reais se desenrolam,
// sem precisar gastar chamada de IA pra isso).
//
// A API da Umbler, por padrão, só devolve chats ABERTOS (ChatState=Open é o
// padrão, segundo o comentário em lib/umbler.ts). Pra pegar os fechados,
// pedimos explicitamente ChatState=Closed na chamada — o nome exato desse
// valor não está 100% confirmado contra a documentação oficial, então se a
// resposta ainda vier com chats "open":true, é sinal de que o valor certo é
// outro (ver o campo `diagnostico_amostra_de_chats` que essa rota devolve
// nesse caso).
//
// Acesse direto no navegador (GET simples, sem CORS):
//   https://SEU-DOMINIO.vercel.app/api/exportar-finalizados?quantidade=10

import { listChats, getAllChatMessages } from '@/lib/umbler';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const quantidade = Math.min(
    Math.max(parseInt(searchParams.get('quantidade') || '10', 10) || 10, 1),
    30
  );

  const organizationId = process.env.UMBLER_ORGANIZATION_ID;
  if (!organizationId) {
    return Response.json({ ok: false, erro: 'UMBLER_ORGANIZATION_ID não configurado.' }, { status: 500 });
  }

  let fechados = [];
  try {
    const resp = await listChats({
      organizationId,
      skip: 0,
      take: quantidade,
      chatState: 'Closed',
    });
    fechados = resp.items || [];
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Falha ao listar chats fechados na Umbler.', detalhe }, { status: 502 });
  }

  const resultado = [];
  for (const chat of fechados.slice(0, quantidade)) {
    try {
      const mensagens = await getAllChatMessages(chat.id, { max: 200 });
      resultado.push({
        chatId: chat.id,
        open: chat.open,
        contato: {
          nome: chat.contact?.name || null,
          telefone: chat.contact?.phoneNumber || null,
        },
        mensagens: mensagens
          .filter((m) => m.content)
          .map((m) => ({
            quem: m.source === 'Contact' ? 'Cliente' : m.source === 'Bot' ? 'Bot' : 'Atendente',
            texto: m.content,
            quando: m.eventAtUTC,
          })),
      });
    } catch (err) {
      resultado.push({
        chatId: chat.id,
        erro: 'Falha ao buscar histórico deste chat.',
        detalhe: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Se algum item veio com open:true mesmo tendo pedido Closed, o valor do
  // parâmetro provavelmente está errado — devolve uma amostra crua pra
  // ajustar.
  const algumAindaAberto = resultado.some((r) => r.open === true);
  let diagnostico = null;
  if (resultado.length === 0 || algumAindaAberto) {
    diagnostico = fechados.slice(0, 2);
  }

  return Response.json({
    ok: true,
    quantidadePedida: quantidade,
    quantidadeEncontrada: resultado.length,
    chats: resultado,
    ...(diagnostico ? { diagnostico_amostra_de_chats: diagnostico } : {}),
  });
}
