// Tabela de referência de CNAE → segmento/ramo de atuação da Dicomp, extraída
// das planilhas "Ramo de Atividade e CNAE Dicomp" e "Ramo de Atividade -
// Versão Final". Usada pra saber se o CNPJ consultado é de um ramo que a
// Dicomp atende diretamente (revenda/integrador/provedor etc.) ou não
// (nesse caso, indicar que a compra deve ser feita via revenda parceira).
//
// IMPORTANTE: CNAE tem 7 dígitos (formato XXXX-X/XX). Ex: "9511-8/00" vira
// "9511800". Uma versão anterior desse arquivo tinha os códigos com 8
// dígitos por engano (um dígito a mais em cada um), o que fazia NENHUM CNAE
// bater nunca — corrigido aqui.

// CNAE (7 dígitos, só números) → nome do segmento.
export const CNAE_PARA_SEGMENTO = {
  '4221904': 'REDES',
  '4221905': 'PROVEDOR',
  '4321500': 'MATERIAL ELÉTRICO / INTEGRADOR SOLAR',
  '4322303': 'SEGURANÇA',
  '4652400': 'LOJA DE ELETRÔNICOS / TELEFONIA',
  '4742300': 'LOJA DE MATERIAL ELÉTRICO',
  '4744001': 'MATERIAL DE CONSTRUÇÃO',
  '4744099': 'MATERIAL DE CONSTRUÇÃO',
  '4751201': 'LOJA DE INFORMÁTICA',
  '4752100': 'TELEFONIA',
  '4753900': 'SEGURANÇA',
  '4757100': 'ELETRÔNICO',
  '4759899': 'INFORMÁTICA',
  '4789099': 'LICITAÇÃO',
  '6110801': 'TELEFONIA',
  '6110803': 'PROVEDOR',
  '6190601': 'PROVEDOR',
  '6190602': 'PROVEDOR',
  '6190699': 'PROVEDOR',
  '6209100': 'TECNOLOGIA DA INFORMAÇÃO',
  '6311900': 'REDES / PROVEDOR',
  '6319400': 'REDES / PROVEDOR',
  '8011101': 'SEGURANÇA',
  '8020001': 'SEGURANÇA',
  '8020002': 'SEGURANÇA',
  '9511800': 'TÉCNICO DE INFORMÁTICA',
  '9512600': 'TÉCNICO INTEGRADOR REDES',
  '9521500': 'INFORMÁTICA',
};

// CNAEs adicionais liberados só pro segmento Áudio e Vídeo — MAS com uma
// regra especial: mesmo sendo reconhecidos, esses casos NÃO liberam acesso
// ao site (alinhado internamente — em caso de dúvida, avisar a Tati).
export const CNAE_AUDIO_VIDEO_SEM_SITE = new Set([
  '4329101', '8230001', '9001906', '7739003', '4753900',
]);

// Ramos que a Dicomp NÃO atende diretamente (marcados "NÃO" em "Acessa o
// site" na planilha de Ramos de Atividade) — servem só de referência caso
// o ramo já esteja identificado por outro caminho (ex: pela extensão de
// busca por produto), não pelo CNAE.
export const RAMOS_SEM_ACESSO_SITE = new Set([
  'AUTOMAÇÃO INDUSTRIAL - CONSUMO',
  'AUTOMAÇÃO INDUSTRIAL - FABRICAÇÃO',
  'DISTRIBUIDOR DE SEGURANÇA',
  'DISTRIBUIDOR PARA PROVEDOR',
  'CORPORATIVO',
  'CPF ECOMMERCE',
  'VAREJO',
  'FRETE',
  'FUNCIONÁRIO',
]);

// CNAEs elegíveis pra plataforma Dicomp Direct (já existia em lib/cnpj.js,
// repetido aqui só pra referência/consistência).
export const CNAES_ELEGIVEIS_DIRECT = ['7490104', '7319002'];

// Dado um CNAE (com ou sem formatação), tenta achar o segmento correspondente.
export function segmentoPorCnae(cnaeQualquerFormato) {
  const codigo = String(cnaeQualquerFormato || '').replace(/\D/g, '');
  return CNAE_PARA_SEGMENTO[codigo] || null;
}

// Dado um array de CNAEs (principal + secundários, no formato que vem da
// CNPJá), retorna { segmento, atendidoPelaDicomp }.
// atendidoPelaDicomp = true se PELO MENOS UM CNAE bater com um segmento
// conhecido da Dicomp (ou seja, é candidato a revenda/canal — não consumidor
// final nem ramo que a Dicomp não atende diretamente).
export function analisarCnaesParaRamo(cnaes) {
  const encontrados = [];
  for (const c of cnaes || []) {
    const codigo = String(c.codigo ?? c.id ?? c ?? '').replace(/\D/g, '');
    const segmento = CNAE_PARA_SEGMENTO[codigo];
    if (segmento) encontrados.push(segmento);
  }
  const unicos = [...new Set(encontrados)];
  return {
    segmentos: unicos,
    atendidoPelaDicomp: unicos.length > 0,
  };
}
