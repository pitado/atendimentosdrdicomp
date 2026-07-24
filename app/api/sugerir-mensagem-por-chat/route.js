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
import { consultarCnpj, encontrarCnpjNoTexto } from '@/lib/cnpj';
import { buscarTemplatesRelevantes } from '@/lib/templates';

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

// O navegador manda um OPTIONS "de teste" (preflight) antes do POST de
// verdade, pra perguntar se a chamada cross-origin é permitida. Sem essa
// resposta, o POST nem chega a ser enviado.
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

  // 1. Busca o histórico do chat (mesma lógica de /api/umbler/chat-historico).
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

  // 1.5. Procura um CNPJ na fala do CLIENTE (não do atendente/bot) e, se
  // achar, consulta a situação/elegibilidade — sem travar a sugestão se essa
  // consulta falhar (CNPJá tem limite de 5/min, então erro aqui é esperado
  // às vezes; nesse caso a IA só segue sem esse contexto extra).
  let contextoCnpj = '';
  const falaDoCliente = ordenadas
    .filter((m) => m.source === 'Contact' && m.content)
    .map((m) => m.content)
    .join(' ');
  const cnpjDetectado = encontrarCnpjNoTexto(falaDoCliente);

  if (cnpjDetectado) {
    try {
      const info = await consultarCnpj(cnpjDetectado);

      const linhaRamo = info.atendidoPelaDicomp
        ? `- Ramo identificado pelo CNAE: ${info.segmentos.join(', ')} (é um canal válido — revenda/integrador/provedor etc.)`
        : `- Ramo pelo CNAE: NÃO bateu com nenhum segmento que a Dicomp atende diretamente. Provavelmente é consumidor final ou empresa fora do canal — a compra deve ser direcionada a uma REVENDA PARCEIRA, não atendida direto pela Dicomp.`;

      const linhaDirect = info.elegivel
        ? `- Elegível pra plataforma Dicomp Direct: SIM (só como informação de fundo — NÃO ofereça o Direct automaticamente. Só mencione se o cliente já dá sinal de que isso é relevante agora, ex: perguntou sobre revenda, margem, ou forma de comprar pra revender. Fora isso, siga o atendimento normal sem tocar no assunto).`
        : `- Elegível pra plataforma Dicomp Direct: não (CNAE não bate com os elegíveis).`;

      contextoCnpj = `\nCONTEXTO DO CNPJ (detectado na conversa, já verificado — pode usar esses dados com segurança):
- CNPJ: ${cnpjDetectado}
- Razão social: ${info.razao || '(não informado)'}
- Situação cadastral: ${info.situacao || '(não informado)'}
- Cidade/UF: ${info.municipio || '?'}/${info.uf || '?'}
${linhaRamo}
${linhaDirect}
`;
    } catch (err) {
      console.warn('Falha ao consultar CNPJ detectado:', err instanceof Error ? err.message : err);
    }
  }

  // 1.6. Busca as mensagens-modelo mais relevantes (sem gastar IA nisso —
  // é só um filtro por palavra-chave, ver lib/templates.js).
  const templates = await buscarTemplatesRelevantes(transcricao, 4);
  const blocoTemplates = templates.length
    ? `\nMENSAGENS-MODELO (de atendimentos reais seus — reaproveite o texto e o tom quando fizer sentido pra situação atual, adaptando os dados entre <colchetes>):\n${templates
        .map((t) => `- (${t.situacao}) "${t.texto_base}"`)
        .join('\n')}\n`
    : '';

  // 2. Pede pra IA redigir a próxima mensagem, no mesmo tom das outras rotas.
  const prompt = `Você é uma pessoa do time de Sucesso do Cliente (CS) da Dicomp atendendo no WhatsApp. Seu trabalho é ler a conversa e escrever a PRÓXIMA mensagem, de um jeito natural, humano e acolhedor — nunca robótico.

CONTEXTO DA EMPRESA (Dicomp):
- A Dicomp é uma DISTRIBUIDORA/atacado de tecnologia. O cliente do outro lado NÃO é consumidor final: é o CANAL — revenda, integrador de sistemas, provedor de internet ou lojista, que compra pra revender ou usar em projetos.
- Segmentos: Redes e Conectividade, Segurança Eletrônica/CFTV, Telecom/Telefonia, Energia Solar, Automação Industrial, Áudio e Vídeo, Consumer e EPIs.
- Fale como quem entende o negócio do cliente. Não trate o cliente como consumidor final.

CONVERSA ATÉ AGORA (Cliente / Atendente / Bot):
"""${transcricao}"""
${contextoCnpj}${blocoTemplates}
TAREFA:
1. Identifique em que ponto da conversa o cliente está.
2. Escreva a próxima mensagem, natural e profissional, do jeito que uma pessoa simpática do CS escreveria.
   - Se alguma MENSAGEM-MODELO acima encaixar na situação, use ela como base (mesmo texto/tom), só preenchendo os dados entre <colchetes> — não precisa reescrever do zero se já existe um modelo bom pra isso.
   - NÃO invente dados (preço, prazo, cadastro, nomes) que não estejam na conversa.
   - Se o CONTEXTO DO CNPJ estiver preenchido acima, use naturalmente esses dados. Se ele disser que o ramo NÃO bateu com nenhum segmento da Dicomp, oriente com cuidado que esse tipo de compra é feito através de uma revenda parceira, sem inventar qual revenda (isso o atendente vai completar). NÃO ofereça a plataforma Direct por conta própria — só toque nesse assunto se o contexto do CNPJ pedir explicitamente ou se o próprio cliente já demonstrou interesse nisso na conversa.
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
