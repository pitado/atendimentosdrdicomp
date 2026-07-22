// GET /api/umbler/chat-historico?id=CHAT_ID
// Busca o histórico completo de um chat (até 100 mensagens) e devolve já
// formatado como uma conversa em texto, na ordem em que aconteceu — pra
// dar contexto de verdade pra IA, não só a última mensagem do cliente.

import { getChat } from '@/lib/umbler';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const chatId = (searchParams.get('id') || '').trim();
  if (!chatId) {
    return Response.json({ ok: false, erro: 'Informe o id do chat.' }, { status: 400 });
  }

  try {
    const chat = await getChat(chatId);
    const mensagens = Array.isArray(chat.messages) ? chat.messages : [];

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
