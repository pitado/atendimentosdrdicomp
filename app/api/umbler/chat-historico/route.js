// GET /api/umbler/chat-historico?id=CHAT_ID
// Busca o histórico do chat na Umbler e devolve já formatado como uma conversa
// em texto, na ordem em que aconteceu — pra dar contexto de verdade pra IA, não
// só a última mensagem do cliente. Tenta puxar TODAS as mensagens (paginando a
// rota relative-messages); se isso falhar, cai pras últimas ~100 do próprio chat.

import { getAllChatMessages, getChat } from '@/lib/umbler';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const chatId = (searchParams.get('id') || '').trim();
  if (!chatId) {
    return Response.json({ ok: false, erro: 'Informe o id do chat.' }, { status: 400 });
  }

  try {
    let mensagens = [];
    try {
      mensagens = await getAllChatMessages(chatId, { max: 300 });
    } catch {
      mensagens = [];
    }
    // Reserva: se a paginação não trouxe nada, usa as mensagens que já vêm
    // embutidas no próprio chat (latestMessages).
    if (mensagens.length === 0) {
      const chat = await getChat(chatId, { includeMessages: 100 });
      mensagens = Array.isArray(chat.latestMessages) ? chat.latestMessages : [];
    }

    const ordenadas = [...mensagens].sort(
      (a, b) => new Date(a.eventAtUTC) - new Date(b.eventAtUTC)
    );

    const transcricao = ordenadas
      .filter((m) => m.content)
      .map((m) => {
        const quem = m.source === 'Contact' ? 'Cliente' : m.source === 'Bot' ? 'Bot' : 'Atendente';
        return `${quem}: ${m.content}`;
      })
      .join('\n');

    return Response.json({ ok: true, transcricao, totalMensagens: ordenadas.length });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Falha ao buscar histórico do chat.', detalhe }, { status: 502 });
  }
}
