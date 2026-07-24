// GET /api/umbler/exportar-finalizados?quantidade=10
//
// Puxa chats FECHADOS/FINALIZADOS (open === false) com o histórico completo
// de cada um, pra servir de base de referência (ver como atendimentos reais
// se desenrolam, sem precisar gastar chamada de IA pra isso).
//
// Não existe um filtro documentado com certeza pra "só chats fechados" direto
// na API da Umbler, então aqui a gente pagina a listagem geral de chats
// (GET /v1/chats/) e filtra pelo campo `open` de cada um — mais lento, mas
// não depende de adivinhar um parâmetro que pode não existir.
//
// Acesse direto no navegador (é uma chamada GET simples, sem CORS, já que
// você está navegando pra ela, não chamando via fetch de outro domínio):
//   https://SEU-DOMINIO.vercel.app/api/umbler/exportar-finalizados?quantidade=10
//
// Por padrão pega só 10 (pra não estourar o tempo limite da função serverless
// da Vercel) — se quiser mais, aumenta o `quantidade` aos poucos e vê até
// onde aguenta sem dar timeout.

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

  const fechados = [];
  let skip = 0;
  const take = 100;
  const maxPaginas = 15; // teto de segurança: no máximo ~1500 chats escaneados

  try {
    for (let pagina = 0; pagina < maxPaginas && fechados.length < quantidade; pagina++) {
      const resp = await listChats({ organizationId, skip, take });
      const itens = resp.items || [];
      if (itens.length === 0) break;

      for (const chat of itens) {
        if (chat.open === false) fechados.push(chat);
        if (fechados.length >= quantidade) break;
      }
      skip += take;
      if (itens.length < take) break; // acabaram os chats
    }
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Falha ao listar chats na Umbler.', detalhe }, { status: 502 });
  }

  const resultado = [];
  for (const chat of fechados.slice(0, quantidade)) {
    try {
      const mensagens = await getAllChatMessages(chat.id, { max: 200 });
      resultado.push({
        chatId: chat.id,
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

  return Response.json({
    ok: true,
    quantidadePedida: quantidade,
    quantidadeEncontrada: resultado.length,
    chats: resultado,
  });
}
