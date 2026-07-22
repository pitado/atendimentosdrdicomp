// GET /api/cnpj?cnpj=00000000000000
// Consulta o CNPJ na API pública da CNPJá (gratuita, sem chave, limite de
// 5 consultas/min por IP: https://cnpja.com/api/open) e verifica se algum
// dos CNAEs (principal ou secundário) bate com a lista de elegíveis pro
// Dicomp Direct.
//
// ATENÇÃO: os nomes de campo abaixo (mainActivity, sideActivities, etc.)
// seguem o formato documentado pela CNPJá, mas não foram testados contra
// uma resposta real ainda — se vier diferente, ajuste os caminhos abaixo
// (dá pra ver o formato exato olhando o `bruto` que a rota devolve em caso
// de erro de parsing, ou testando direto https://open.cnpja.com/office/SEU_CNPJ).

const CNAES_ELEGIVEIS = ['7490104', '7319002']; // 74.90-1-04 e 73.19-0-02

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const cnpjBruto = (searchParams.get('cnpj') || '').replace(/\D/g, '');

  if (cnpjBruto.length !== 14) {
    return Response.json({ ok: false, erro: 'CNPJ precisa ter 14 números.' }, { status: 400 });
  }

  let dados;
  try {
    const r = await fetch(`https://open.cnpja.com/office/${cnpjBruto}`, { cache: 'no-store' });
    if (!r.ok) {
      return Response.json({ ok: false, status: r.status, erro: 'CNPJá retornou erro (CNPJ inválido/inexistente ou limite de consultas atingido).' }, { status: 502 });
    }
    dados = await r.json();
  } catch {
    return Response.json({ ok: false, erro: 'Falha ao consultar a CNPJá.' }, { status: 502 });
  }

  const principal = dados.mainActivity;
  const secundarias = Array.isArray(dados.sideActivities) ? dados.sideActivities : [];

  const todasAtividades = [
    ...(principal ? [{ ...principal, principal: true }] : []),
    ...secundarias.map((a) => ({ ...a, principal: false })),
  ];

  const cnaes = todasAtividades.map((a) => {
    const codigo = String(a.id ?? '').replace(/\D/g, '');
    return {
      codigo: a.id ?? '',
      descricao: a.text ?? '',
      principal: !!a.principal,
      bate: CNAES_ELEGIVEIS.includes(codigo),
    };
  });

  const elegivel = cnaes.some((c) => c.bate);

  return Response.json({
    ok: true,
    empresa: {
      razao: dados.company?.name ?? dados.name ?? '',
      fantasia: dados.alias ?? '',
      situacao: dados.status?.text ?? '',
      municipio: dados.address?.city ?? '',
      uf: dados.address?.state ?? '',
    },
    cnaes,
    elegivel,
  });
}
