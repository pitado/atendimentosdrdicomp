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
  const prompt = `Você é um assistente de um time de Sucesso do Cliente (CS) que decide qual mensagem-padrão mandar pra um cliente no WhatsApp.

CONTEXTO IMPORTANTE do processo da empresa:
- Existem 3 grupos de mensagens: "Triagem rápida" (funciona pra qualquer cliente, é o caminho padrão), "Com cadastro" (só se sabe de certeza que o cliente JÁ TEM cadastro no sistema interno Db1) e "Sem cadastro" (só se sabe de certeza que o cliente NÃO TEM cadastro).
- A informação de "tem cadastro ou não" vem de um sistema interno (Db1) — ela NÃO aparece na conversa do WhatsApp, a menos que o próprio cliente ou atendente mencione isso explicitamente na conversa.
- Regra: se não houver nenhuma menção explícita na conversa sobre o cliente já ter ou não cadastro, PREFIRA sempre uma mensagem do grupo "Triagem rápida" em vez de arriscar "Com cadastro" ou "Sem cadastro".
- Mensagens marcadas como uso "interno" já foram removidas da lista abaixo — todas as opções são pra enviar de fato ao cliente.

Esta é a conversa até agora entre o cliente e o CS:
"""${mensagemCliente}"""

Estas são as opções de mensagens-padrão disponíveis:

${lista}

Pensando passo a passo: primeiro, identifique em que ponto da conversa o cliente está (primeira mensagem? já respondeu algo? já tem alguma info dele?). Segundo, veja se há alguma pista sobre cadastro (Db1) — se não houver, lembre da regra acima. Terceiro, escolha a opção mais adequada pra responder AGORA.

Depois do seu raciocínio breve, termine sua resposta OBRIGATORIAMENTE com uma linha no formato exato:
RESPOSTA: <número da opção>`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0 },
        }),
      }
    );

    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      return Response.json({ ok: false, erro: 'Falha ao consultar a IA.', detalhe }, { status: 502 });
    }

    const data = await r.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Procura especificamente "RESPOSTA: N" — se não achar (a IA fugiu do
    // formato), cai pro último número mencionado no texto como reserva.
    const matchFormatado = texto.match(/RESPOSTA:\s*(\d+)/i);
    const indice = matchFormatado
      ? parseInt(matchFormatado[1], 10)
      : parseInt([...texto.matchAll(/\d+/g)].map((m) => m[0]).pop() ?? '', 10);

    if (Number.isNaN(indice) || indice < 0 || indice >= opcoes.length) {
      return Response.json({ ok: false, erro: 'A IA não retornou um índice válido.', detalhe: texto }, { status: 502 });
    }

    return Response.json({ ok: true, indice, raciocinio: texto });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, erro: 'Erro ao chamar a IA.', detalhe }, { status: 502 });
  }
}
