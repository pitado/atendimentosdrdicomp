// GET /api/umbler/chats-abertos
// Lista os chats abertos na Umbler (clientes que já responderam e estão
// aguardando atendimento), já com nome, telefone e última mensagem —
// pra preencher o painel sem digitar na mão.

import { listChats } from '@/lib/umbler';

export async function GET() {
  const organizationId = process.env.UMBLER_ORGANIZATION_ID;
  if (!organizationId) {
    return Response.json({ ok: false, erro: 'UMBLER_ORGANIZATION_ID não configurado.' }, { status: 500 });
  }

  try {
    const { items } = await listChats({ organizationId, take: 50 });

    // DEBUG temporário — remover depois de confirmar o formato real dos campos.
    if (items && items[0]) {
      console.log('[api/umbler/chats-abertos] exemplo de chat cru:', JSON.stringify(items[0]));
    }

    const abertos = (items || [])
      .filter((c) => c.open)
      .map((c) => {
        const contato = c.contact || c.Contact || {};
        const ultima = c.lastMessage || c.LastMessage || {};
        return {
          id: c.id,
          nome: contato.name || contato.Name || '',
          telefone: contato.phoneNumber || contato.PhoneNumber || contato.phone || contato.Phone || '',
          ultimaMensagem: ultima.content || ultima.Content || '',
          ultimaMensagemEm: ultima.eventAtUTC || ultima.EventAtUTC || null,
          // Quem mandou a última mensagem — pra separar Fila (Contact) de Chats.
          ultimaMensagemSource: ultima.source || ultima.Source || '',
        };
      })
      .sort((a, b) => new Date(b.ultimaMensagemEm || 0) - new Date(a.ultimaMensagemEm || 0));

    return Response.json({ ok: true, chats: abertos });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Falha ao buscar chats na Umbler.', detalhe }, { status: 502 });
  }
}
