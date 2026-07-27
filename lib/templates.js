// Busca as mensagens-modelo (templates_mensagem no Supabase) mais relevantes
// pra conversa atual, com um filtro simples por palavra-chave — sem gastar
// nenhuma chamada de IA nisso. Assim, mesmo que a tabela cresça com o tempo
// (50, 100+ templates), o prompt continua recebendo só um punhado (padrão: 4),
// e o custo por sugestão não sobe.

import { getSupabaseServerClient } from './supabase';

export async function buscarTemplatesRelevantes(transcricao, limite = 4) {
  let data;
  try {
    const supabase = getSupabaseServerClient();
    const resp = await supabase
      .from('templates_mensagem')
      .select('situacao, texto_base, palavras_chave')
      .eq('ativo', true);
    if (resp.error) throw resp.error;
    data = resp.data || [];
  } catch (err) {
    console.warn('Falha ao buscar templates no Supabase:', err instanceof Error ? err.message : err);
    return [];
  }

  if (data.length === 0) return [];

  const textoLower = (transcricao || '').toLowerCase();
  const pontuados = data
    .map((t) => {
      const chaves = Array.isArray(t.palavras_chave) ? t.palavras_chave : [];
      const pontos = chaves.reduce(
        (soma, chave) => soma + (textoLower.includes(String(chave).toLowerCase()) ? 1 : 0),
        0
      );
      return { ...t, pontos };
    })
    // Só os que bateram de verdade — mandar template sem relação nenhuma
    // com a conversa só gasta token à toa, sem ajudar em nada.
    .filter((t) => t.pontos > 0);

  pontuados.sort((a, b) => b.pontos - a.pontos);

  return pontuados.slice(0, limite);
}

// Busca UM template pela situação exata (ex: "apresentacao_cs") — usada pro
// atalho da primeira mensagem, que nem precisa chamar a IA: a resposta já
// sai 100% determinística direto do banco.
export async function buscarTemplatePorSituacao(situacao) {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('templates_mensagem')
      .select('situacao, texto_base')
      .eq('situacao', situacao)
      .eq('ativo', true)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (err) {
    console.warn('Falha ao buscar template por situação:', err instanceof Error ? err.message : err);
    return null;
  }
}
