// POST /api/sugerir-mensagem-por-chat
// Body: { chatId: string }
//
// Recebe só o chatId (é o que o content-script da extensão consegue pegar
// direto da URL da Umbler). Busca o histórico completo do chat, monta a
// transcrição e pede pra IA redigir a próxima mensagem, no mesmo estilo de
// tom natural/humano das outras rotas do projeto.
//
// Retorna { ok, mensagem, raciocinio }.
// Reaproveita getAllChatMessages/getChat de lib/umbler.ts e a mesma
// OPENAI_API_KEY já configurada na Vercel.
//
// CORS: essa rota é chamada de fora do domínio da Vercel (a extensão roda
// dentro da página da Umbler), então precisa liberar explicitamente os
// headers de CORS — sem isso o navegador bloqueia a resposta mesmo que a
// chamada tenha ido e voltado com sucesso.

import { getAllChatMessages, getChat } from '@/lib/umbler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonCors(data, init) {
  return Response.json(data, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init?.headers || {}) },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonCors({ ok: false, erro: 'Corpo inválido — esperado JSON.' }, { status: 400 });
  }

  const chatId = (body?.chatId || '').toString().trim();
  if (!chatId) {
    return jsonCors({ ok: false, erro: 'Informe o chatId.' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonCors({ ok: false, erro: 'OPENAI_API_KEY não configurada.' }, { status: 500 });
  }

  let mensagens = [];
  try {
    mensagens = await getAllChatMessages(chatId, { max: 300 });
    if (mensagens.length === 0) {
      const chat = await getChat(chatId, { includeMessages: 100 });
      mensagens = Array.isArray(chat.latestMessages) ? chat.latestMessages : [];
    }
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return jsonCors({ ok: false, erro: 'Falha ao buscar histórico do chat na Umbler.', detalhe }, { status: 502 });
  }

  const ordenadas = [...mensagens].sort((a, b) => new Date(a.eventAtUTC) - new Date(b.eventAtUTC));
  const transcricao = ordenadas
    .filter((m) => m.content)
    .map((m) => {
      const quem = m.source === 'Contact' ? 'Cliente' : m.source === 'Bot' ? 'Bot' : 'Atendente';
      return `${quem}: ${m.content}`;
    })
    .join('\n');

  if (!transcricao) {
    return jsonCors({ ok: false, erro: 'Chat sem mensagens pra basear a sugestão.' }, { status: 400 });
  }

  const prompt = `Você é uma pessoa do time de Sucesso do Cliente (CS) da Dicomp atendendo no WhatsApp. Seu trabalho é ler a conversa e escrever a PRÓXIMA mensagem, de um jeito natural, humano e acolhedor — nunca robótico.

CONTEXTO DA EMPRESA (Dicomp):
- A Dicomp é uma DISTRIBUIDORA/atacado de tecnologia. O cliente do outro lado NÃO é consumidor final: é o CANAL — revenda, integrador de sistemas, provedor de internet ou lojista, que compra pra revender ou usar em projetos.
- Segmentos: Redes e Conectividade, Segurança Eletrônica/CFTV, Telecom/Telefonia, Energia Solar, Automação Industrial, Áudio e Vídeo, Consumer e EPIs.
- Fale como quem entende o negócio do cliente. Não trate o cliente como consumidor final.

CONVERSA ATÉ AGORA (Cliente / Atendente / Bot):
"""${transcricao}"""

TAREFA:
1. Identifique em que ponto da conversa o cliente está.
2. Escreva a próxima mensagem, natural e profissional, do jeito que uma pessoa simpática do CS escreveria.
   - NÃO invente dados (preço, prazo, cadastro, nomes) que não estejam na conversa.
   - Tom cordial e leve, sem soar de robô. Use *asteriscos* pra negrito de destaques. NÃO use emojis.
   - Se precisar de um dado que ainda não está na conversa (ex: nome do consultor), deixe um placeholder entre <colchetes angulares> pro atendente completar.

Responda SOMENTE com um JSON válido, sem texto fora dele, neste formato exato:
{"mensagem": "<a mensagem pronta pra enviar>", "raciocinio": "<1-2 frases explicando por que essa é a próxima mensagem certa>"}`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      return jsonCors({ ok: false, erro: 'Falha ao consultar a IA.', detalhe }, { status: 502 });
    }

    const data = await r.json();
    const texto = data?.choices?.[0]?.message?.content || '';

    let parsed = null;
    try {
      parsed = JSON.parse(texto);
    } catch {
      parsed = null;
    }

    const mensagem = parsed && typeof parsed.mensagem === 'string' ? parsed.mensagem.trim() : '';
    const raciocinio = parsed && typeof parsed.raciocinio === 'string' ? parsed.raciocinio : '';

    if (!mensagem) {
      return jsonCors({ ok: false, erro: 'A IA não retornou uma mensagem válida.', detalhe: texto }, { status: 502 });
    }

    return jsonCors({ ok: true, mensagem, raciocinio });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return jsonCors({ ok: false, erro: 'Erro ao chamar a IA.', detalhe }, { status: 502 });
  }
}
