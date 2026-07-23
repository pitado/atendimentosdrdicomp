// POST /api/sugerir-mensagem
// Body: {
//   mensagemCliente: string (a conversa inteira, em texto),
//   opcoes: [{ t, q, m }]  (mensagens-padrão, com nome/consultor já preenchidos),
//   contexto: { nomeCliente, produto, ramo, consultor, cnpj, cadastroStatus }
// }
// Pede pra IA duas coisas: (1) escolher qual mensagem-padrão responde melhor
// AGORA e (2) reescrever essa mensagem num tom natural e humano de WhatsApp,
// mantendo a intenção, os links e as regras da empresa.
// Retorna { ok, indice, mensagem, raciocinio }.
// Precisa da env OPENAI_API_KEY (via platform.openai.com/api-keys).

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, erro: 'Corpo inválido — esperado JSON.' }, { status: 400 });
  }

  const mensagemCliente = (body?.mensagemCliente || '').toString().trim();
  const opcoes = Array.isArray(body?.opcoes) ? body.opcoes : [];
  const contexto = body?.contexto && typeof body.contexto === 'object' ? body.contexto : {};

  if (!mensagemCliente) {
    return Response.json({ ok: false, erro: 'Sem conversa do cliente pra analisar.' }, { status: 400 });
  }
  if (opcoes.length === 0) {
    return Response.json({ ok: false, erro: 'Sem opções de mensagem pra comparar.' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, erro: 'OPENAI_API_KEY não configurada.' }, { status: 500 });
  }

  const lista = opcoes
    .map((o, i) => `${i}. ${o.t} (situação: ${o.q})\nTexto-base: """${o.m}"""`)
    .join('\n\n');

  // Monta o bloco de contexto do atendimento — só entra o que veio preenchido.
  const linhasContexto = [];
  if (contexto.nomeCliente) linhasContexto.push(`- Nome do cliente: ${contexto.nomeCliente}`);
  if (contexto.produto) linhasContexto.push(`- Produto/demanda que o cliente busca: ${contexto.produto}`);
  if (contexto.ramo) linhasContexto.push(`- Ramo/segmento identificado: ${contexto.ramo}`);
  if (contexto.consultor?.nome) {
    const tel = contexto.consultor.telefone ? ` (telefone ${contexto.consultor.telefone})` : '';
    linhasContexto.push(`- Consultor que vai assumir: ${contexto.consultor.titulo || 'consultor'} ${contexto.consultor.nome}${tel}`);
  }
  if (contexto.cnpj?.razao) {
    const sit = contexto.cnpj.situacao ? ` — situação ${contexto.cnpj.situacao}` : '';
    const direct = contexto.cnpj.elegivelDirect ? ' — perfil com cara de revenda/integrador (elegível pro Dicomp Direct)' : '';
    linhasContexto.push(`- Empresa (CNPJ): ${contexto.cnpj.razao}${sit}${direct}`);
  }
  const blocoContexto = linhasContexto.length
    ? linhasContexto.join('\n')
    : '(nenhuma info extra além da conversa)';

  // Regra de cadastro conforme o que o atendente marcou no painel.
  let regraCadastro;
  if (contexto.cadastroStatus === 'sim') {
    regraCadastro = 'O atendente CONFIRMOU no Db1 que este cliente JÁ TEM cadastro. Priorize mensagens do grupo "Com cadastro".';
  } else if (contexto.cadastroStatus === 'nao') {
    regraCadastro = 'O atendente CONFIRMOU que este cliente NÃO TEM cadastro. Priorize mensagens do grupo "Sem cadastro".';
  } else {
    regraCadastro = 'O status de cadastro NÃO foi confirmado. Tente inferir pela conversa; se não houver menção explícita sobre ter ou não cadastro, PREFIRA sempre "Triagem rápida".';
  }

  const prompt = `Você é uma pessoa do time de Sucesso do Cliente (CS) da Dicomp atendendo no WhatsApp. Seu trabalho é escolher a próxima mensagem e escrevê-la de um jeito natural, humano e acolhedor — nunca robótico.

CONTEXTO DO PROCESSO:
- Existem 3 grupos de mensagens-padrão: "Triagem rápida" (caminho padrão, serve pra qualquer cliente), "Com cadastro" (só quando se sabe que o cliente JÁ TEM cadastro no sistema interno Db1) e "Sem cadastro" (só quando se sabe que NÃO tem).
- ${regraCadastro}
- As mensagens de uso interno já foram removidas da lista — todas as opções abaixo são pra enviar de fato ao cliente.

CONTEXTO DESTE ATENDIMENTO:
${blocoContexto}

CONVERSA ATÉ AGORA (Cliente / Atendente / Bot):
"""${mensagemCliente}"""

OPÇÕES DE MENSAGENS-PADRÃO (o texto-base já vem com nome/consultor preenchidos quando conhecidos):

${lista}

TAREFA:
1. Identifique em que ponto da conversa o cliente está e escolha, pelo índice, a melhor mensagem-padrão pra responder AGORA.
2. Reescreva o texto-base dessa opção como uma mensagem de WhatsApp natural e profissional, do jeito que uma pessoa simpática do CS escreveria. Regras da reescrita:
   - Mantenha a INTENÇÃO, os LINKS e qualquer informação essencial do texto-base. NÃO invente dados (preço, prazo, cadastro, nomes) que não estejam no contexto.
   - Personalize com o contexto (nome do cliente, produto, consultor) quando fizer sentido.
   - Tom cordial e leve, sem soar de robô. Use *asteriscos* pra negrito de destaques. NÃO use emojis.
   - Se o texto-base tiver algum trecho entre <colchetes angulares> (ex: <nome do consultor>), é um dado ainda não preenchido: mantenha o placeholder exatamente como está pra o atendente completar.
   - Pode ajustar a saudação e deixar o texto mais solto, contanto que a mensagem continue completa e fiel à intenção.

Responda SOMENTE com um JSON válido, sem texto fora dele, neste formato exato:
{"indice": <número da opção escolhida>, "mensagem": "<a mensagem reescrita, pronta pra enviar>", "raciocinio": "<1-2 frases explicando a escolha>"}`;

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
        max_tokens: 700,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      return Response.json({ ok: false, erro: 'Falha ao consultar a IA.', detalhe }, { status: 502 });
    }

    const data = await r.json();
    const texto = data?.choices?.[0]?.message?.content || '';

    let parsed = null;
    try {
      parsed = JSON.parse(texto);
    } catch {
      parsed = null;
    }

    // Índice: do JSON; se falhou o parse, tenta achar no texto solto como reserva.
    const indice =
      parsed && Number.isInteger(parsed.indice)
        ? parsed.indice
        : parseInt((texto.match(/"?indice"?\s*[:=]\s*(\d+)/i) || [])[1] ?? '', 10);
    // Mensagem reescrita (pode vir vazia — o painel cai pro texto-base nesse caso).
    const mensagem = parsed && typeof parsed.mensagem === 'string' ? parsed.mensagem.trim() : '';
    const raciocinio = parsed && typeof parsed.raciocinio === 'string' ? parsed.raciocinio : texto;

    if (Number.isNaN(indice) || indice < 0 || indice >= opcoes.length) {
      return Response.json({ ok: false, erro: 'A IA não retornou um índice válido.', detalhe: texto }, { status: 502 });
    }

    return Response.json({ ok: true, indice, mensagem, raciocinio });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Erro ao chamar a IA.', detalhe }, { status: 502 });
  }
}
