// POST /api/sugerir-mensagem
// Body: { mensagemCliente: string, opcoes: [{ t: string, q: string }] }
// Manda a última mensagem do cliente pra Claude junto com a lista de
// mensagens-padrão (de todas as abas, exceto as internas), e pede pra
// escolher qual combina melhor. Retorna só o índice dentro da lista
// enviada — o painel (client-side) já sabe mapear esse índice de volta
// pra aba+posição e montar a mensagem pronta pra enviar.
// Precisa da env GEMINI_API_KEY (gratuita, via aistudio.google.com/apikey).

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, erro: 'Corpo inválido — esperado JSON.' }, { status: 400 });
  }

  const mensagemCliente = (body?.mensagemCliente || '').toString().trim();
  const opcoes = Array.isArray(body?.opcoes) ? body.opcoes : [];

  if (!mensagemCliente) {
    return Response.json({ ok: false, erro: 'Sem conversa do cliente pra analisar.' }, { status: 400 });
  }
  if (opcoes.length === 0) {
    return Response.json({ ok: false, erro: 'Sem opções de mensagem pra comparar.' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, erro: 'GEMINI_API_KEY não configurada.' }, { status: 500 });
  }

  const lista = opcoes.map((o, i) => `${i}. ${o.t} (situação: ${o.q})\nTexto da mensagem: """${o.m}"""`).join('\n\n');
  const prompt = `Esta é a conversa até agora entre um cliente e o suporte (CS) da Dicomp:\n"""${mensagemCliente}"""\n\nCom base em como a conversa está agora, escolha entre as opções de mensagens-padrão abaixo qual é a mais adequada para responder AGORA (considere tanto a situação descrita quanto o texto real de cada mensagem):\n\n${lista}\n\nResponda SOMENTE com o número da opção escolhida (só o índice, nenhum outro texto).`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 },
        }),
      }
    );

    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      return Response.json({ ok: false, erro: 'Falha ao consultar a IA.', detalhe }, { status: 502 });
    }

    const data = await r.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const indice = parseInt(texto.match(/\d+/)?.[0] ?? '', 10);

    if (Number.isNaN(indice) || indice < 0 || indice >= opcoes.length) {
      return Response.json({ ok: false, erro: 'A IA não retornou um índice válido.', detalhe: texto }, { status: 502 });
    }

    return Response.json({ ok: true, indice });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Erro ao chamar a IA.', detalhe }, { status: 502 });
  }
}
