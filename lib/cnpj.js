// Lógica de consulta de CNPJ (CNPJá) reaproveitada entre /api/cnpj (consulta
// manual) e /api/sugerir-mensagem-por-chat (detecção automática no chat).

const CNAES_ELEGIVEIS = ['7490104', '7319002']; // 74.90-1-04 e 73.19-0-02

export async function consultarCnpj(cnpjBruto) {
  const r = await fetch(`https://open.cnpja.com/office/${cnpjBruto}`, { cache: 'no-store' });
  if (!r.ok) {
    throw new Error(`CNPJá retornou ${r.status}`);
  }
  const dados = await r.json();

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

  return {
    razao: dados.company?.name ?? dados.name ?? '',
    fantasia: dados.alias ?? '',
    situacao: dados.status?.text ?? '',
    municipio: dados.address?.city ?? '',
    uf: dados.address?.state ?? '',
    cnaes,
    elegivel,
  };
}

// Acha o CNPJ mais recente mencionado num texto (procura de trás pra frente,
// pra pegar o último CNPJ dito, não o primeiro). Aceita formatado ou só
// números. Retorna só os 14 dígitos, ou null se não achar nenhum válido.
export function encontrarCnpjNoTexto(texto) {
  const matches = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  for (let i = matches.length - 1; i >= 0; i--) {
    const digitos = matches[i].replace(/\D/g, '');
    if (digitos.length === 14) return digitos;
  }
  return null;
}
