// GET /api/ramo?produto=...
// Busca o produto na loja da Dicomp e classifica o ramo (mesma lógica da
// extensão Assistente SDR). Rodando no servidor, sem problema de CORS.

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const produto = (searchParams.get('produto') || '').trim();
  if (!produto) {
    return Response.json({ encontrado: false, erro: 'Informe o produto.' }, { status: 400 });
  }

  const url = 'https://loja.dicomp.com.br/busca?palavra=' + encodeURIComponent(produto);
  let htmlText;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    htmlText = await r.text();
  } catch {
    return Response.json({ encontrado: false, erro: 'Falha ao consultar a loja.' }, { status: 502 });
  }

  // Remove tags e normaliza o texto
  const texto = htmlText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();

  if (texto.includes('nenhum produto') || texto.includes('não encontramos resultados')) {
    return Response.json({ encontrado: false });
  }

  const audioVideoTerms = ['áudio e vídeo', 'audio e video', 'som profissional', 'som ambiente', 'painel de led', 'display interativo', 'totem', 'video conferencia'];
  const solarAutoTerms = ['energia renovável', 'energia renovavel', 'energia solar', 'automação industrial', 'automacao industrial', 'automação comercial', 'fotovoltaic', 'clp', 'inversor', 'servo acionamento'];
  const demaisTerms = ['provedor', 'rede', 'telefonia', 'segurança eletrônica', 'seguranca eletronica', 'segurança do trabalho', 'consumer'];

  const getScore = (terms) => terms.reduce((acc, term) => {
    const m = texto.match(new RegExp(term, 'g'));
    return acc + (m ? m.length : 0);
  }, 0);

  const scoreAV = getScore(audioVideoTerms);
  const scoreSA = getScore(solarAutoTerms);
  const scoreDE = getScore(demaisTerms);

  let ramo, motivo;
  if (scoreAV === 0 && scoreSA === 0 && scoreDE === 0) {
    ramo = 'Demais segmentos';
    motivo = 'Produto existe, mas sem ligação direta com A/V ou Solar na busca.';
  } else if (scoreAV > scoreSA && scoreAV > scoreDE) {
    ramo = 'Áudio e Vídeo';
    motivo = `Associação com Áudio/Vídeo (${scoreAV} menções).`;
  } else if (scoreSA > scoreAV && scoreSA > scoreDE) {
    ramo = 'Solar/Automação';
    motivo = `Associação com Solar/Automação (${scoreSA} menções).`;
  } else {
    ramo = 'Demais segmentos';
    motivo = `Associado a Provedor/Segurança/Redes (${scoreDE} menções).`;
  }

  return Response.json({ encontrado: true, ramo, motivo });
}
