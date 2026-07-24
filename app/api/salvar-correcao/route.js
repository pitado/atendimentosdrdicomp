// POST /api/salvar-correcao
// Body: { chatId, mensagemOriginal, mensagemCorrigida }
//
// Quando o atendente edita uma sugestão errada e salva, essa rota "aprende"
// com a correção: pede pra IA (1) identificar/gerar um rótulo curto de
// situação, (2) generalizar o texto (trocar nome/produto/telefone
// específicos por <placeholders>, pra não vazar dado de um cliente pra
// sugestões de outros depois), e então atualiza o template existente com
// esse rótulo (se já existir) ou cria um novo, no Supabase.
//
// Não trava nada se der erro — é um processo de "aprendizado" em segundo
// plano, não crítico pro fluxo principal de sugerir mensagem.

import { getSupabaseServerClient } from '@/lib/supabase';

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

  const mensagemOriginal = (body?.mensagemOriginal || '').toString().trim();
  const mensagemCorrigida = (body?.mensagemCorrigida || '').toString().trim();

  if (!mensagemCorrigida) {
    return jsonCors({ ok: false, erro: 'Falta mensagemCorrigida.' }, { status: 400 });
  }
  if (mensagemCorrigida === mensagemOriginal) {
    return jsonCors({ ok: true, acao: 'sem_mudanca' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonCors({ ok: false, erro: 'OPENAI_API_KEY não configurada.' }, { status: 500 });
  }

  // 1. Pede pra IA classificar a correção e generalizar o texto.
  const prompt = `Você ajuda a manter uma base de mensagens-modelo de atendimento de uma distribuidora de tecnologia (Dicomp).

Um atendente corrigiu uma sugestão de mensagem que estava errada. Preciso que você:
1. Dê um rótulo curto em snake_case pra essa situação (ex: "sem_cadastro", "fora_do_ramo") — se a correção parecer se encaixar numa dessas situações já conhecidas, REUSE o mesmo nome: apresentacao_cs, sem_cadastro, direcionar_consultor, ja_tem_cadastro, fora_do_ramo, abaixo_do_minimo, produto_fora_catalogo. Se for uma situação realmente nova, crie um rótulo novo, curto e descritivo.
2. Generalize o texto: troque nome do cliente, nome de produto específico, telefone, CNPJ, e qualquer outro dado específico daquele atendimento por um placeholder entre <colchetes> (ex: <nome>, <produto>, <telefone>). Mantenha o resto do texto e o tom exatamente como o atendente escreveu.
3. Liste até 5 palavras-chave (minúsculas) que ajudem a reconhecer quando essa situação se repete numa conversa futura.

TEXTO CORRIGIDO PELO ATENDENTE:
"""${mensagemCorrigida}"""

Responda SOMENTE com um JSON válido, sem texto fora dele:
{"situacao": "...", "texto_generico": "...", "palavras_chave": ["...", "..."]}`;

  let situacao, textoGenerico, palavrasChave;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) throw new Error(`IA respondeu ${r.status}`);
    const data = await r.json();
    const texto = data?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(texto);
    situacao = (parsed.situacao || '').toString().trim();
    textoGenerico = (parsed.texto_generico || '').toString().trim();
    palavrasChave = Array.isArray(parsed.palavras_chave) ? parsed.palavras_chave : [];
  } catch (err) {
    return jsonCors(
      { ok: false, erro: 'Falha ao classificar a correção.', detalhe: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  if (!situacao || !textoGenerico) {
    return jsonCors({ ok: false, erro: 'IA não retornou situação/texto válidos.' }, { status: 502 });
  }

  // 2. Atualiza o template existente (mesma situação) ou cria um novo.
  try {
    const supabase = getSupabaseServerClient();

    const { data: existente } = await supabase
      .from('templates_mensagem')
      .select('id')
      .eq('situacao', situacao)
      .maybeSingle();

    if (existente) {
      await supabase
        .from('templates_mensagem')
        .update({ texto_base: textoGenerico, palavras_chave: palavrasChave, ativo: true })
        .eq('id', existente.id);
      return jsonCors({ ok: true, acao: 'atualizado', situacao });
    }

    await supabase
      .from('templates_mensagem')
      .insert({ situacao, texto_base: textoGenerico, palavras_chave: palavrasChave, ativo: true });
    return jsonCors({ ok: true, acao: 'criado', situacao });
  } catch (err) {
    return jsonCors(
      { ok: false, erro: 'Falha ao salvar no Supabase.', detalhe: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
