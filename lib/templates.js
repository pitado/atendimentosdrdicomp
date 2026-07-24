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
  const pontuados = data.map((t) => {
    const chaves = Array.isArray(t.palavras_chave) ? t.palavras_chave : [];
    const pontos = chaves.reduce(
      (soma, chave) => soma + (textoLower.includes(String(chave).toLowerCase()) ? 1 : 0),
      0
    );
    return { ...t, pontos };
  });

  // Maior pontuação primeiro; em empate (inclusive tudo 0), mantém a ordem
  // original — assim, mesmo sem nenhum match, ainda manda algo como referência
  // de tom/estilo em vez de nada.
  pontuados.sort((a, b) => b.pontos - a.pontos);

  return pontuados.slice(0, limite);
}
