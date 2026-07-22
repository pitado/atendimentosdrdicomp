// POST /api/umbler/enviar
// Body: { telefone: string, mensagem: string }
// Envia mensagem de WhatsApp pro cliente via rota simplificada do Umbler
// Talk (POST /v1/messages/simplified/). Essa rota cria o contato/chat
// automaticamente se ainda não existir.
//
// Precisa das envs: UMBLER_API_TOKEN, UMBLER_ORGANIZATION_ID, UMBLER_FROM_PHONE
// (o número do canal cadastrado na Umbler, o "de onde" a mensagem sai).

import { sendMessageSimplified } from '@/lib/umbler';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, erro: 'Corpo inválido — esperado JSON.' }, { status: 400 });
  }

  const telefone = (body?.telefone || '').toString().trim();
  const mensagem = (body?.mensagem || '').toString().trim();

  if (!telefone) {
    return Response.json({ ok: false, erro: 'Informe o telefone do cliente.' }, { status: 400 });
  }
  if (!mensagem) {
    return Response.json({ ok: false, erro: 'Mensagem vazia.' }, { status: 400 });
  }

  const digitos = telefone.replace(/\D/g, '');
  const toPhone = digitos.startsWith('55') ? digitos : '55' + digitos;

  try {
    const resultado = await sendMessageSimplified({ toPhone, message: mensagem });
    return Response.json({ ok: true, resultado });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Falha ao enviar pela Umbler.', detalhe }, { status: 502 });
  }
}
