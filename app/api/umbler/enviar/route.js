// POST /api/umbler/enviar
// Body: { telefone: string, mensagem: string, chatId?: string, assinatura?: string }
// Envia mensagem de WhatsApp pro cliente. Com chatId, usa POST /v1/messages/
// (que aceita `prefix` = assinatura do atendente, visível pro cliente). Sem
// chatId, cai pro /simplified/ (cria contato/chat), prependendo a assinatura
// no texto quando houver.
//
// Precisa das envs: UMBLER_API_TOKEN, UMBLER_ORGANIZATION_ID, UMBLER_FROM_PHONE.

import { sendMessage, sendMessageSimplified } from '@/lib/umbler';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, erro: 'Corpo inválido — esperado JSON.' }, { status: 400 });
  }

  const telefone = (body?.telefone || '').toString().trim();
  const mensagem = (body?.mensagem || '').toString().trim();
  const chatId = (body?.chatId || '').toString().trim();
  const assinatura = (body?.assinatura || '').toString().trim();

  if (!mensagem) {
    return Response.json({ ok: false, erro: 'Mensagem vazia.' }, { status: 400 });
  }
  if (!chatId && !telefone) {
    return Response.json({ ok: false, erro: 'Informe o chatId ou o telefone do cliente.' }, { status: 400 });
  }

  const digitos = telefone.replace(/\D/g, '');
  const toPhone = digitos.startsWith('55') ? digitos : '55' + digitos;

  // Fallback pro /simplified/ (sem prefix nativo): prepende a assinatura no texto.
  const enviarSimplificado = () => {
    const texto = assinatura ? `*${assinatura}:*\n${mensagem}` : mensagem;
    return sendMessageSimplified({ toPhone, message: texto });
  };

  try {
    let resultado;
    if (chatId) {
      try {
        resultado = await sendMessage({ chatId, message: mensagem, prefix: assinatura || undefined });
      } catch (e) {
        // Ex.: chat fechado -> tenta pelo simplified (que cria/reabre o chat).
        if (!telefone) throw e;
        console.warn('[api/umbler/enviar] /messages/ falhou, caindo pro simplified:', e instanceof Error ? e.message : e);
        resultado = await enviarSimplificado();
      }
    } else {
      resultado = await enviarSimplificado();
    }
    return Response.json({ ok: true, resultado });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    console.error('[api/umbler/enviar] falhou:', detalhe);
    return Response.json({ ok: false, erro: 'Falha ao enviar pela Umbler.', detalhe }, { status: 502 });
  }
}
