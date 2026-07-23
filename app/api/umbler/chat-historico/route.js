// GET /api/umbler/chat-historico?id=CHAT_ID
// Busca o histórico do chat na Umbler e devolve já formatado como uma conversa
// em texto, na ordem em que aconteceu — pra dar contexto de verdade pra IA, não
// só a última mensagem do cliente. Tenta puxar TODAS as mensagens (paginando a
// rota relative-messages); se isso falhar, cai pras últimas ~100 do próprio chat.
//
// GATILHO DE TESTE: se o cliente mandar a mensagem "oitchencha", o histórico é
// cortado a partir dela — o atendimento passa a ser tratado do zero, como um
// cliente novo. É um reset só de contexto: NÃO apaga nada na Umbler.

import { getAllChatMessages, getChat } from '@/lib/umbler';

// Palavra que o cliente manda no WhatsApp pra reiniciar o atendimento (teste).
const GATILHO_RESET = 'oitchencha';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const chatId = (searchParams.get('id') || '').trim();
  // Modo leve (usado pelo auto-refresh de 15s): 1 requisição só, sem paginar —
  // pra não forçar a API da Umbler. Traz as últimas ~100 mensagens.
  const leve = searchParams.get('leve') === '1';
  if (!chatId) {
    return Response.json({ ok: false, erro: 'Informe o id do chat.' }, { status: 400 });
  }

  try {
    let mensagens = [];
    if (leve) {
      const chat = await getChat(chatId, { includeMessages: 100 });
      mensagens = Array.isArray(chat.latestMessages) ? chat.latestMessages : [];
    } else {
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
    }

    const ordenadas = [...mensagens].sort(
      (a, b) => new Date(a.eventAtUTC) - new Date(b.eventAtUTC)
    );

    // Reset de teste: procura a ÚLTIMA vez que o cliente mandou o gatilho e
    // descarta tudo até ela (inclusive). O que sobra é a conversa "nova".
    let base = ordenadas;
    let resetado = false;
    for (let i = ordenadas.length - 1; i >= 0; i--) {
      const m = ordenadas[i];
      if (m.source === 'Contact' && (m.content || '').trim().toLowerCase() === GATILHO_RESET) {
        base = ordenadas.slice(i + 1);
        resetado = true;
        break;
      }
    }

    // Estruturado (pra renderizar em balões no painel) + string (pra IA).
    const estruturadas = base
      .filter((m) => m.content)
      .map((m) => ({
        quem: m.source === 'Contact' ? 'Cliente' : m.source === 'Bot' ? 'Bot' : 'Atendente',
        texto: m.content,
        em: m.eventAtUTC || null,
      }));

    const transcricao = estruturadas.map((m) => `${m.quem}: ${m.texto}`).join('\n');

    return Response.json({ ok: true, transcricao, mensagens: estruturadas, totalMensagens: base.length, resetado });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Falha ao buscar histórico do chat.', detalhe }, { status: 502 });
  }
}
