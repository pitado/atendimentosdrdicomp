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
    const { items } = await listChats({ organizationId, pageSize: 50 });
    const abertos = (items || [])
      .filter((c) => c.open)
      .map((c) => ({
        id: c.id,
        nome: c.contact?.name || '',
        telefone: c.contact?.phoneNumber || '',
        ultimaMensagem: c.lastMessage?.content || '',
        ultimaMensagemEm: c.lastMessage?.eventAtUTC || null,
      }))
      .sort((a, b) => new Date(b.ultimaMensagemEm || 0) - new Date(a.ultimaMensagemEm || 0));

    return Response.json({ ok: true, chats: abertos });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Falha ao buscar chats na Umbler.', detalhe }, { status: 502 });
  }
}
