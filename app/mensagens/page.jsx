'use client';

import { useState, useEffect, useRef, Fragment } from 'react';

// ====== Supabase (mesmo projeto/tabelas da extensão Assistente SDR) ======
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SB_CONFIGURADO = !!SB_URL && !!SB_KEY && /^https?:\/\//.test(SB_URL || '');
function checarSbConfig() {
  if (!SB_URL || !SB_KEY) {
    throw new Error('Supabase não configurado — defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel e faça um redeploy.');
  }
  if (!/^https?:\/\//.test(SB_URL)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL precisa começar com https:// (ex.: https://xxxx.supabase.co). Ajuste na Vercel e faça um redeploy.');
  }
}
async function sbGet(path) {
  checarSbConfig();
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw await sbErro(r, 'GET');
  return r.json();
}
async function sbErro(r, metodo) {
  const detalhe = await r.text().catch(() => '');
  // 404/PGRST205 = tabela não existe; 401/403 = RLS/permissão.
  let dica = '';
  if (r.status === 404 || /PGRST205|does not exist|could not find the table/i.test(detalhe)) {
    dica = ' — a tabela não existe (rode o SQL de criação no Supabase).';
  } else if (r.status === 401 || r.status === 403) {
    dica = ' — permissão negada (RLS ligada? desative a RLS dessa tabela).';
  }
  return new Error(`Supabase ${metodo} ${r.status}${dica}${detalhe ? ' · ' + detalhe.slice(0, 160) : ''}`);
}
async function sbPost(path, body, prefer = 'return=representation') {
  checarSbConfig();
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await sbErro(r, 'POST');
  return r.json();
}
async function sbPatch(path, body) {
  checarSbConfig();
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await sbErro(r, 'PATCH');
  return r.json();
}
async function obterProximoVendedor(ramo) {
  const encoded = encodeURIComponent(ramo);
  const disponiveis = await sbGet(`sdr_vendedores?setor=eq.${encoded}&ferias=eq.false&na_fila=eq.true&order=nome.asc`);
  if (disponiveis.length === 0) return { proximo: null, disponiveis };
  const codigos = disponiveis.map((v) => v.codigo).join(',');
  const atendimentos = await sbGet(`sdr_atendimentos?vendedor_codigo=in.(${codigos})&order=criado_em.desc`);
  const ultimo = {};
  atendimentos.forEach((a) => { if (!ultimo[a.vendedor_codigo]) ultimo[a.vendedor_codigo] = a.criado_em; });
  const ranq = [...disponiveis].sort((a, b) => {
    const da = ultimo[a.codigo], db = ultimo[b.codigo];
    if (!da && !db) return 0;
    if (!da) return -1;
    if (!db) return 1;
    return new Date(da) - new Date(db);
  });
  return { proximo: ranq[0], disponiveis };
}

// ====== Textos do fluxo (padrão sem emojis) ======
const ABERTURA = `Olá! Tudo bem?
É um prazer enorme falar com você!

Para eu localizar o seu cadastro aqui, me informa por gentileza:

▪ Nome
▪ CNPJ
▪ E-mail`;

const PORTFOLIO = `*Frentes de negócio da Dicomp*

*Telecom, Redes, Segurança Eletrônica, Consumer e EPIs*
*Energia Renovável e Automação Industrial*
*Áudio e Vídeo Profissional*
*Dicomp Direct (Venda Direta)* — nossa plataforma *gratuita* para você vender direto para o seu cliente final, com acesso a um amplo portfólio de produtos. Você ganha agilidade na operação, reduz custos com impostos e fretes e conta com todo o suporte da Dicomp durante o processo.

Também disponibilizamos o nosso *site* e a *Plataforma Solar*, que facilitam a consulta de produtos e soluções.

Se a plataforma de Venda Direta fizer sentido para o seu negócio, me avisa! Além do consultor comercial, eu te direciono para o nosso time de *Relacionamento Direct*, que apresenta a plataforma e te ajuda a começar a usá-la nas próximas oportunidades de venda.

Você já conhecia todas essas frentes de atuação da Dicomp?`;

const ENCERRAMENTO = `Mais uma vez, muito obrigada pelo interesse nas soluções da Dicomp!
Vai ser um prazer voltar a fazer negócios com você. Tenha um excelente dia!`;

const MSG_DB1_INTERNA = `Db1: verificar se o cliente já possui vendedor responsável pelo segmento informado.
Se não possuir: checar se tem rede associada (cadastro pessoa - entidade - geral - rede cliente) — pode já ter vendedor pela rede.
Se não tiver nenhum: passar para o vendedor da vez (use "Buscar consultor" acima).
Conferir se o contato está correto e salvo na Umbler (se não tiver, adicionar).`;

const MSG_DIRECT_INTERNA = `Conferir no cadastro se o Dicomp Direct já está habilitado: Db1 - Geral - campos adicionais - flag "revenda no Direct".
Oferecer o Direct apenas se o cliente for revenda/integrador E ainda não estiver habilitado.
Registrar no CRM se houve interesse no Direct.`;

const MSG_DIRECT_OFERTA = `Você já conhece a nossa plataforma Direct? Com ela você vende direto para o seu cliente com agilidade, praticidade e segurança. É uma ferramenta exclusiva para o cliente Dicomp, nós cuidamos da operação para você. Quer saber mais?`;

const HANDOFF = `{Art} {consultorTitulo} {consultor} será {art} responsável pelo seu atendimento. Você pode falar diretamente pelo número {telefone}, e {pronome} vai dar continuidade ao seu atendimento, auxiliando no que for necessário.

Caso {pronome} não consiga responder de imediato, o prazo de retorno é de até *4 horas*. Se precisar de qualquer coisa nesse meio tempo, pode me chamar novamente por aqui.`;

const FLUXOS = {
  triagem: [
    { t: 'Saudação de abertura', q: 'Primeira mensagem, assim que o atendimento cai para você', m: `{saudacao}, {nome}! Tudo bem?` },
    { t: 'Explicar papel do CS (lead de link/campanha)', q: 'Cliente chega pedindo consultor direto, vindo de anúncio, bio ou link externo', m: `Eu faço parte do time de Sucesso do Cliente e estou aqui para te apoiar nesse início.

Como temos soluções bem diferentes por aqui, eu te ajudo a identificar o seu foco para te conectar direto com o consultor especialista do seu segmento, que vai cuidar de toda a parte de valores e propostas com você.` },
    { t: 'Cliente sem cadastro', q: 'Cliente ainda não tem cadastro na Dicomp', m: `Verifiquei aqui e sua empresa ainda não tem cadastro na Dicomp — mas é rapidinho de resolver! É só fazer o pré-cadastro por este link:
https://cadastro.dicomp.com.br/cadastro/cliente` },
    { t: 'Perguntar se já fez o cadastro', q: 'Cliente já recebeu o link e o atendimento está parado', m: `Você realizou o cadastro hoje?` },
    { t: 'Cadastro em análise', q: 'Cliente fez o pré-cadastro e está aguardando liberação', m: `{nome}, o seu cadastro ainda está em análise. Assim que for liberado, eu já te encaminho para um consultor que vai te auxiliar no orçamento.` },
    { t: 'Prazo de liberação do cadastro', q: 'Cliente pergunta se tem prazo ou tem urgência no item', m: `{nome}, no máximo em até *4 horas* o cadastro é concluído.` },
    { t: 'Cliente com cadastro (sondagem)', q: 'Cliente já tem cadastro, antes de transferir', m: `Verifiquei aqui e você já tem cadastro, vou te transferir para o seu consultor responsável. Enquanto isso, me conta: com quais *marcas ou produtos* você tem demanda hoje? Assim já te direciono ao consultor certo.` },
    { t: 'Pedir nome + CNPJ + e-mail', q: 'Cliente já chega com demanda pronta, ou lead novo de campanha/link externo', m: `Para eu localizar seu cadastro, pode me passar:
▪ Nome
▪ CNPJ
▪ E-mail` },
    { t: 'Pedir nome', q: 'Sondagem simples, só falta o nome', m: `Qual é o seu nome para eu passar pro consultor?` },
    { t: 'Pedir CNPJ', q: 'Sondagem simples, só falta o CNPJ', m: `Consegue me passar o CNPJ da empresa para eu verificar o cadastro?` },
    { t: 'Pedido de cotação (sem acesso a preço)', q: 'Cliente pede valores diretamente', m: `Eu não tenho acesso a valores por aqui, mas vou te encaminhar para o consultor que vai te ajudar melhor. É só esse produto mesmo ou tem mais alguma coisa?` },
    { t: 'Oferecer o Dicomp Direct', q: 'Revenda/integrador sem o Direct habilitado (conferir antes no Db1)', m: MSG_DIRECT_OFERTA, n: 'Antes de enviar: Db1 - Geral - campos adicionais - conferir a flag "revenda no Direct".' },
    { t: 'Passar para o consultor', q: 'Encaminhamento final do atendimento', m: HANDOFF },
    { t: 'Trocar de vendedor (demora/sem retorno)', q: 'Quando é preciso repassar para outro consultor', m: `Você não teve retorno {do} consultor? Vou repassar seu atendimento para {outroTitulo} que possa te atender agora — desculpe pelo transtorno.

Passei seu atendimento para {outroTitulo}, {consultor}. Desculpe de novo pelo transtorno, e qualquer coisa é só me chamar.` },
  ],
  com: [
    { t: 'Abertura — pedir os dados', q: 'Logo após a mensagem automática do cliente', m: ABERTURA },
    { t: 'Boas-vindas de volta', q: 'Depois que o cliente enviar os dados', m: `Obrigada, {nome}!

Encontrei o seu cadastro aqui na Dicomp! Ficamos muito felizes em saber que continua acompanhando a Dicomp e tem interesse em conhecer de novo as nossas soluções

Deixa eu te mostrar rapidinho tudo o que temos para você hoje.` },
    { t: 'Portfólio Dicomp', q: 'Na sequência da mensagem anterior', m: PORTFOLIO },
    { t: 'Perguntar a demanda', q: 'Depois que o cliente responder sobre as frentes', m: `Perfeito, {nome}!
Para eu te direcionar ao consultor certo, me conta: com quais *marcas ou produtos* você tem demanda hoje?` },
    { t: 'Verificação interna (Db1 + Umbler)', q: 'Fazer antes de definir o consultor', tipo: 'interno', m: MSG_DB1_INTERNA },
    { t: 'Atualizar acesso + catálogo', q: 'Depois que o cliente informar as marcas/produtos', m: `Ótimo, {nome}! Vou atualizar o seu acesso ao site da Dicomp — assim você consulta o nosso estoque e os preços de tabela com muito mais agilidade

Enquanto isso, te deixo aqui o nosso *catálogo digital*, com as principais soluções do portfólio
https://dicomp.com.br/downloads/catalogos/2026/Catalogo-MultiConexoes.pdf`, n: 'Explicar como será a atualização do acesso — validar se o cliente recebe e-mail automático ou se você encaminha o link + nova senha.' },
    { t: 'Dicomp Direct (checagem)', q: 'Revenda/integrador sem o Direct habilitado', tipo: 'interno', m: MSG_DIRECT_INTERNA },
    { t: 'Oferecer o Dicomp Direct', q: 'Só se conferiu acima que não está habilitado', m: MSG_DIRECT_OFERTA },
    { t: 'Aviso do consultor', q: 'Ao encaminhar para o comercial', m: `{Art} {consultorTitulo} vai entrar em contato com você em breve para dar continuidade ao atendimento, tá bem?
Enquanto isso, fico à disposição para qualquer dúvida ou apoio em outras demandas!` },
    { t: 'Passar para o consultor (contato direto)', q: 'Quando for informar o contato do consultor', m: HANDOFF },
    { t: 'Encerramento', q: 'Fechamento do atendimento', m: ENCERRAMENTO },
  ],
  sem: [
    { t: 'Abertura — pedir os dados', q: 'Logo após a mensagem automática do cliente', m: ABERTURA },
    { t: 'Pré-cadastro + boas-vindas', q: 'Depois que o cliente enviar os dados', m: `Obrigada, {nome}!

Verifiquei aqui e a sua empresa ainda não tem cadastro na Dicomp — mas é rapidinho de resolver! É só fazer o pré-cadastro por este link:
https://cadastro.dicomp.com.br/cadastro/cliente

E já que você é novo no nosso ecossistema, deixa eu te apresentar rapidinho as nossas frentes de negócio.` },
    { t: 'Portfólio Dicomp', q: 'Na sequência da mensagem anterior', m: PORTFOLIO },
{ t: 'Follow-up do pré-cadastro', q: 'Se o cliente demorar a concluir o cadastro', m: `Conseguiu finalizar o pré-cadastro?` },
    { t: 'Catálogo digital', q: 'Depois que o cliente informar as marcas/produtos', m: `Ótimo, {nome}! Assim que o seu pré-cadastro for liberado, já te encaminho para o time comercial

Enquanto isso, te deixo aqui o nosso *catálogo digital*, com as principais soluções do portfólio
https://dicomp.com.br/downloads/catalogos/2026/Catalogo-MultiConexoes.pdf` },
    { t: 'Verificação interna (Db1 + Umbler)', q: 'Assim que o cadastro for liberado, antes de definir o consultor', tipo: 'interno', m: MSG_DB1_INTERNA },
    { t: 'Cadastro liberado + consultor', q: 'Assim que o pré-cadastro for aprovado', m: `{nome}, boa notícia!
O seu pré-cadastro já foi liberado e {art} {consultorTitulo} *{consultor}* vai entrar em contato com você em breve para dar continuidade ao atendimento.

Enquanto isso, fico à disposição para qualquer dúvida ou apoio em outras demandas!` },
    { t: 'Passar para o consultor (contato direto)', q: 'Quando for informar o contato do consultor', m: HANDOFF },
    { t: 'Encerramento', q: 'Fechamento do atendimento', m: ENCERRAMENTO },
  ],
};

const EXCECOES_GENERO = {
  luca: 'M', joshua: 'M', elisha: 'M',
  isabel: 'F', raquel: 'F', ines: 'F', 'inês': 'F', ester: 'F', noemi: 'F', ingrid: 'F',
  elizabeth: 'F', miriam: 'F', ruth: 'F', jaqueline: 'F', jacqueline: 'F', yasmin: 'F',
  yasmim: 'F', carmem: 'F', carmen: 'F', aline: 'F', adriane: 'F', eliane: 'F', fabiane: 'F',
  silvane: 'F', solange: 'F', elaine: 'F', daniele: 'F', danielle: 'F', gabriele: 'F',
  gabrielle: 'F', viviane: 'F', simone: 'F', suzane: 'F', susane: 'F', raiane: 'F', ivone: 'F',
  iris: 'F', nicole: 'F', michele: 'F', michelle: 'F', beatriz: 'F', nayane: 'F', luciene: 'F',
  marilene: 'F', rosangela: 'F', rosangele: 'F',
};
function detectarGenero(nomeCompleto) {
  const primeiro = (nomeCompleto || '').trim().split(' ')[0].toLowerCase();
  if (!primeiro) return 'M';
  if (EXCECOES_GENERO[primeiro]) return EXCECOES_GENERO[primeiro];
  return primeiro.endsWith('a') ? 'F' : 'M';
}

// Acha um CNPJ (14 dígitos, formatado ou não) num texto. Fica com o ÚLTIMO
// mencionado — se o cliente corrigiu, o mais recente é o que vale.
function extrairCnpj(texto) {
  if (!texto) return '';
  const matches = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  let achado = '';
  for (const m of matches) {
    const d = m.replace(/\D/g, '');
    if (d.length === 14) achado = d;
  }
  return achado;
}

function formatarCnpj(d) {
  const s = (d || '').replace(/\D/g, '').slice(0, 14);
  if (s.length !== 14) return s;
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12, 14)}`;
}

// Inicial pro avatar da lista/cabeçalho.
function inicial(txt) {
  const s = (txt || '').trim();
  return s ? s[0].toUpperCase() : '?';
}

// ===== Data/hora das mensagens (o `em` vem em UTC; exibimos no fuso local) =====
function formatarHora(em) {
  if (!em) return '';
  const d = new Date(em);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function chaveDia(em) {
  if (!em) return '';
  const d = new Date(em);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}
function rotuloDia(em) {
  if (!em) return '';
  const d = new Date(em);
  if (Number.isNaN(d.getTime())) return '';
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const dk = d.toLocaleDateString('pt-BR');
  if (dk === hoje.toLocaleDateString('pt-BR')) return 'Hoje';
  if (dk === ontem.toLocaleDateString('pt-BR')) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Detecta a mensagem de handoff pro consultor por trechos ESTÁVEIS (o nome e o
// telefone do consultor mudam, então não entram na checagem). Quando isso é
// enviado, o atendimento é finalizado e vira um ticket (Respondidos).
function ehHandoff(texto) {
  const t = normalizar(texto);
  return t.includes('responsavel pelo seu atendimento') && t.includes('prazo de retorno');
}

// Tenta extrair o nome do consultor do texto do handoff ("O consultor NOME será...").
function extrairConsultorHandoff(texto) {
  const m = (texto || '').match(/consultor(?:a)?\s+(.+?)\s+ser[áa](?:\s|$)/i);
  return m ? m[1].trim() : '';
}

export default function Mensagens() {
  const [aba, setAba] = useState('triagem');
  const [nomeCliente, setNomeCliente] = useState('');
  const [telCliente, setTelCliente] = useState('');
  const [produto, setProduto] = useState('');
  const [ramoInfo, setRamoInfo] = useState(null);
  const [consultorFila, setConsultorFila] = useState(null);
  const [consNome, setConsNome] = useState('');
  const [consTel, setConsTel] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [statusEnvio, setStatusEnvio] = useState({});
  const [registrando, setRegistrando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [cnpjInfo, setCnpjInfo] = useState(null);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [cnpjAuto, setCnpjAuto] = useState(false); // CNPJ veio da conversa (auto)
  const [chatsAbertos, setChatsAbertos] = useState([]);
  const [carregandoChats, setCarregandoChats] = useState(false);
  const [chatSelecionadoId, setChatSelecionadoId] = useState(null);
  const [conversaMensagens, setConversaMensagens] = useState([]); // balões (Cliente/Bot/Atendente)
  const [mobilePane, setMobilePane] = useState('lista'); // 'lista' | 'conversa' (só afeta o mobile)
  const [conversaUsadaIA, setConversaUsadaIA] = useState('');
  const [raciocinioIA, setRaciocinioIA] = useState('');
  const [sugestaoIA, setSugestaoIA] = useState(null);
  const [mensagemEditavel, setMensagemEditavel] = useState('');
  const [cadastroStatus, setCadastroStatus] = useState('nao_sei'); // 'nao_sei' | 'sim' | 'nao'
  const [resetTeste, setResetTeste] = useState(false);
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [erroIA, setErroIA] = useState('');
  const [mostrarManual, setMostrarManual] = useState(false);
  const [faseAtiva, setFaseAtiva] = useState('fila'); // 'fila' | 'chats' | 'respondidos'
  const [busca, setBusca] = useState('');
  const [tickets, setTickets] = useState([]); // Respondidos (Supabase)
  const [demandaEdits, setDemandaEdits] = useState({}); // edição de demanda por chat_id
  const [ticketBusy, setTicketBusy] = useState({}); // status de ação por chat_id
  const [ticketFoco, setTicketFoco] = useState(null); // ticket destacado no board
  const corpoRef = useRef(null); // pra rolar a conversa pro fim

  function consultorAtual() {
    const digitado = consNome.trim();
    if (consultorFila && digitado === consultorFila.nome) return consultorFila;
    if (digitado) return { codigo: null, nome: digitado, telefone: consTel.trim(), genero: detectarGenero(digitado), ramo: ramoInfo ? ramoInfo.ramo : null };
    return consultorFila;
  }

  function aplicar(txt) {
    const c = consultorAtual();
    const f = c ? c.genero === 'F' : false;
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    return txt
      .replaceAll('{nome}', nomeCliente.trim() || '<nome>')
      .replaceAll('{saudacao}', saudacao)
      .replaceAll('{consultor}', c ? c.nome : '<nome do consultor>')
      .replaceAll('{telefone}', c && c.telefone ? c.telefone : '<telefone do consultor>')
      .replaceAll('{consultorTitulo}', f ? 'consultora' : 'consultor')
      .replaceAll('{Art}', f ? 'A' : 'O')
      .replaceAll('{art}', f ? 'a' : 'o')
      .replaceAll('{pronome}', f ? 'ela' : 'ele')
      .replaceAll('{do}', f ? 'da' : 'do')
      .replaceAll('{outroTitulo}', f ? 'outra consultora' : 'outro consultor');
  }

  async function buscarConsultor() {
    setErro('');
    setRamoInfo(null);
    if (!produto.trim()) { setErro('Digite o produto que o cliente quer.'); return; }
    setBuscando(true);
    try {
      const r = await fetch('/api/ramo?produto=' + encodeURIComponent(produto.trim()));
      const j = await r.json();
      if (!j.encontrado) {
        setErro('Produto não encontrado na loja. Tenta outro termo.');
      } else {
        setRamoInfo(j);
        const { proximo } = await obterProximoVendedor(j.ramo);
        if (!proximo) {
          setErro(`Ramo identificado (${j.ramo}), mas a fila está vazia no momento.`);
        } else {
          const c = { codigo: proximo.codigo, nome: proximo.nome, telefone: proximo.telefone, genero: proximo.genero || 'M', ramo: j.ramo };
          setConsultorFila(c);
          setConsNome(proximo.nome);
          setConsTel(proximo.telefone);
          setRegistrado(false);
        }
      }
    } catch {
      setErro('Erro na busca. Confere as variáveis do Supabase e a conexão.');
    }
    setBuscando(false);
  }

  async function enviar(chave, texto) {
    if (!telCliente.trim()) { setErro('Preenche o telefone do cliente antes de enviar.'); return; }
    setErro('');
    setStatusEnvio((s) => ({ ...s, [chave]: 'enviando' }));
    try {
      const r = await fetch('/api/umbler/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: telCliente, mensagem: texto }),
      });
      const j = await r.json();
      setStatusEnvio((s) => ({ ...s, [chave]: j.ok ? 'ok' : 'erro' }));
      if (j.ok) {
        // Mostra na conversa que a mensagem saiu (o refresh confirma depois).
        setConversaMensagens((ms) => [...ms, { quem: 'Atendente', texto, em: new Date().toISOString() }]);
        // Se foi o handoff pro consultor, finaliza o atendimento -> Respondidos.
        // Detecta pelo trecho estável do texto OU pelo template que a IA escolheu
        // (caso a IA tenha reescrito a mensagem de um jeito diferente).
        const tituloHandoff = sugestaoIA && /passar para o consultor/i.test(sugestaoIA.t || '');
        if ((ehHandoff(texto) || (chave === 'ia-sugestao' && tituloHandoff)) && chatSelecionadoId) {
          criarTicketPendente({ id: chatSelecionadoId, nome: nomeCliente, telefone: telCliente }, texto);
        }
      } else {
        setErro('O envio falhou: ' + [j.erro, j.detalhe].filter(Boolean).join(' — '));
      }
    } catch {
      setStatusEnvio((s) => ({ ...s, [chave]: 'erro' }));
      setErro('O envio falhou (rede ou servidor).');
    }
  }

  function copiar(chave, texto) {
    navigator.clipboard.writeText(texto).then(() => {
      setStatusEnvio((s) => ({ ...s, [chave]: 'copiado' }));
      setTimeout(() => setStatusEnvio((s) => ({ ...s, [chave]: undefined })), 1400);
    });
  }

  async function registrarAtendimento() {
const c = consultorAtual();
    if (!c || !c.codigo) { setErro('Para registrar, o consultor precisa vir da fila (Buscar consultor).'); return; }
    setRegistrando(true);
    setErro('');
    try {
      await sbPost('sdr_atendimentos', { vendedor_codigo: c.codigo, ramo: c.ramo || 'Demais segmentos', produto: produto.trim() || null });
      setRegistrado(true);
      setConsultorFila(null);
    } catch {
      setErro('Erro ao registrar o atendimento.');
    }
    setRegistrando(false);
  }

  async function consultarCnpj() {
    setErro('');
    setCnpjInfo(null);
    setCnpjAuto(false);
    const d = cnpj.replace(/\D/g, '');
    if (d.length !== 14) { setErro('CNPJ precisa ter 14 números.'); return; }
    setBuscandoCnpj(true);
    try {
      const r = await fetch('/api/cnpj?cnpj=' + d);
      const j = await r.json();
      if (!j.ok) setErro('Consulta do CNPJ falhou: ' + (j.erro || j.status || 'erro desconhecido'));
      else setCnpjInfo(j);
    } catch {
      setErro('Erro na consulta do CNPJ.');
    }
    setBuscandoCnpj(false);
  }

  // Detecta um CNPJ na conversa e já consulta a CNPJá, pra alimentar o contexto
  // da IA sem o atendente precisar digitar. Retorna o resultado (ou null).
  async function detectarEVerificarCnpj(texto) {
    const d = extrairCnpj(texto);
    if (!d) return null;
    setCnpj(formatarCnpj(d));
    try {
      const r = await fetch('/api/cnpj?cnpj=' + d);
      const info = await r.json();
      if (info.ok) {
        setCnpjInfo(info);
        setCnpjAuto(true);
        return info;
      }
    } catch {
      // silencioso — o CNPJ é um extra; se falhar, o atendimento segue sem ele
    }
    return null;
  }

  async function buscarChatsAbertos() {
    setErro('');
    setCarregandoChats(true);
    try {
      const r = await fetch('/api/umbler/chats-abertos');
      const j = await r.json();
      if (!j.ok) {
        setErro('Falha ao buscar atendimentos abertos: ' + [j.erro, j.detalhe].filter(Boolean).join(' — '));
      } else {
        setChatsAbertos(j.chats);
      }
    } catch {
      setErro('Erro de rede ao buscar atendimentos abertos.');
    }
    setCarregandoChats(false);
  }

  // ===== Pipeline / tickets (Respondidos) =====
  async function carregarTickets() {
    try {
      const rows = await sbGet('tickets_atendimento?order=criado_em.desc');
      setTickets(Array.isArray(rows) ? rows : []);
    } catch {
      // silencioso — provavelmente a tabela tickets_atendimento ainda não existe
    }
  }

  function ticketDoChat(chatId) {
    return tickets.find((t) => t.chat_id === chatId) || null;
  }

  // Cria o ticket pendente quando o handoff é detectado (envio ou ao abrir o
  // chat). Idempotente: se já existe ticket pro chat, não faz nada.
  async function criarTicketPendente(chat, textoHandoff, mensagens, cnpjInfoArg) {
    const chatId = chat?.id;
    if (!chatId || ticketDoChat(chatId)) return;
    // demanda sugerida: o produto digitado ou a maior mensagem do cliente.
    const msgs = Array.isArray(mensagens) ? mensagens : conversaMensagens;
    const maiorDoCliente = msgs
      .filter((m) => m.quem === 'Cliente' && m.texto)
      .map((m) => m.texto)
      .sort((a, b) => b.length - a.length)[0] || '';
    const demanda = produto.trim() || maiorDoCliente;
    // CNPJ: extrai da própria conversa (robusto); razão social do resultado da
    // CNPJá (passado ou do estado).
    const info = cnpjInfoArg !== undefined ? cnpjInfoArg : cnpjInfo;
    const cnpjDaConversa = extrairCnpj(msgs.map((m) => m.texto).join('\n'));
    const registro = {
      chat_id: chatId,
      cliente: chat.nome || nomeCliente || '',
      telefone: chat.telefone || telCliente || '',
      cnpj: cnpjDaConversa ? formatarCnpj(cnpjDaConversa) : (cnpj || ''),
      razao: info?.empresa?.razao || '',
      demanda,
      consultor: extrairConsultorHandoff(textoHandoff) || (consultorAtual()?.nome || ''),
      status: 'pendente',
    };
    try {
      await sbPost('tickets_atendimento', registro, 'resolution=ignore-duplicates,return=representation');
      await carregarTickets();
    } catch (e) {
      setErro('Não consegui registrar o ticket. ' + (e?.message || ''));
    }
  }

  async function aprovarTicket(chatId) {
    setTicketBusy((s) => ({ ...s, [chatId]: 'criando' }));
    try {
      const demanda = demandaEdits[chatId];
      const patch = { status: 'criado', atualizado_em: new Date().toISOString() };
      if (demanda !== undefined) patch.demanda = demanda;
      await sbPatch(`tickets_atendimento?chat_id=eq.${encodeURIComponent(chatId)}`, patch);
      await carregarTickets();
      setTicketBusy((s) => ({ ...s, [chatId]: 'criado' }));
    } catch (e) {
      setTicketBusy((s) => ({ ...s, [chatId]: 'erro' }));
      setErro('Não consegui aprovar o ticket. ' + (e?.message || ''));
    }
  }

  async function selecionarChatAberto(chat) {
    setChatSelecionadoId(chat.id);
    setMobilePane('conversa');
    setNomeCliente(chat.nome || '');
    setTelCliente(chat.telefone || '');
    setSugestaoIA(null);
    setErroIA('');
    setResetTeste(false);
    setCnpjInfo(null);
    setCnpjAuto(false);
    setConversaMensagens([]);
    setMensagemEditavel('');

    try {
      const r = await fetch('/api/umbler/chat-historico?id=' + encodeURIComponent(chat.id));
      const j = await r.json();
      if (j.ok) {
        setResetTeste(!!j.resetado);
        const msgs = Array.isArray(j.mensagens) ? j.mensagens : [];
        setConversaMensagens(msgs);
        // A IA NÃO gera nada automaticamente — só quando você clicar em "Gerar".
        // Aqui só detectamos o CNPJ (grátis) pro contexto/ticket.
        setConversaUsadaIA('');
        setRaciocinioIA('');
        setSugestaoIA(null);
        setMensagemEditavel('');
        const temHandoff = msgs.some((m) => m.quem === 'Atendente' && ehHandoff(m.texto));
        const finalizado = !!ticketDoChat(chat.id) || temHandoff;
        const infoCnpj = j.transcricao ? await detectarEVerificarCnpj(j.transcricao) : null;
        if (finalizado && temHandoff) criarTicketPendente(chat, '', msgs, infoCnpj);
      } else if (chat.ultimaMensagem) {
        // não conseguiu o histórico — mostra ao menos a última mensagem
        setConversaMensagens([{ quem: 'Cliente', texto: chat.ultimaMensagem }]);
      }
    } catch {
      if (chat.ultimaMensagem) {
        setConversaMensagens([{ quem: 'Cliente', texto: chat.ultimaMensagem }]);
      }
    }
  }

  // Gera a sugestão da IA sob demanda (botão "Gerar"), a partir da conversa
  // atual — nunca automático.
  function gerarSugestao() {
    const transcricao = conversaMensagens
      .filter((m) => m.texto)
      .map((m) => `${m.quem}: ${m.texto}`)
      .join('\n');
    if (!transcricao) {
      setErroIA('Ainda não há conversa pra a IA analisar.');
      return;
    }
    sugerirRespostaIA(transcricao); // usa o cnpjInfo do estado (detectado ao abrir)
  }

  async function sugerirRespostaIA(mensagemCliente, cnpjInfoArg) {
    setErroIA('');
    setSugestaoIA(null);
    setRaciocinioIA('');
    setMensagemEditavel('');
    setConversaUsadaIA(mensagemCliente);
    setCarregandoIA(true);
    try {
      // Achata as 3 abas de fluxo (menos itens internos) numa lista só,
      // pra IA escolher de uma vez só entre todas elas.
      const abasParaSugerir = ['triagem', 'com', 'sem'];
      const opcoes = [];
      abasParaSugerir.forEach((abaKey) => {
        (FLUXOS[abaKey] || []).forEach((item, indice) => {
          if (item.tipo !== 'interno') opcoes.push({ aba: abaKey, indice, t: item.t, q: item.q, m: item.m });
        });
      });

      // Contexto do atendimento — o que o painel já sabe, pra IA personalizar.
      const cons = consultorAtual();
      // Usa o CNPJ passado (detecção automática) ou, se não veio argumento, o do
      // estado (consulta manual na aba Direct / "Gerar de novo").
      const cnpjUsar = cnpjInfoArg === undefined ? cnpjInfo : cnpjInfoArg;
      const contexto = {
        nomeCliente: nomeCliente.trim() || null,
        produto: produto.trim() || null,
        ramo: (ramoInfo && ramoInfo.ramo) || (cons && cons.ramo) || null,
        consultor: cons && cons.nome
          ? { nome: cons.nome, telefone: cons.telefone || null, titulo: cons.genero === 'F' ? 'consultora' : 'consultor' }
          : null,
        cnpj: cnpjUsar
          ? { razao: cnpjUsar.empresa.razao, situacao: cnpjUsar.empresa.situacao, elegivelDirect: cnpjUsar.elegivel }
          : null,
        cadastroStatus,
      };

      const r = await fetch('/api/sugerir-mensagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Manda os textos-base já com nome/consultor preenchidos (aplicar), pra
        // IA só precisar deixar naturais — sem lidar com {placeholders}.
        body: JSON.stringify({
          mensagemCliente,
          opcoes: opcoes.map((o) => ({ t: o.t, q: o.q, m: aplicar(o.m) })),
          contexto,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErroIA([j.erro, j.detalhe].filter(Boolean).join(' — '));
      } else {
        const escolhida = opcoes[j.indice];
        if (escolhida) {
          setAba(escolhida.aba);
          setSugestaoIA(escolhida);
          setRaciocinioIA(j.raciocinio || '');
          // Usa a mensagem reescrita pela IA; se vier vazia, cai pro texto-base.
          setMensagemEditavel(j.mensagem || aplicar(FLUXOS[escolhida.aba][escolhida.indice].m));
        }
      }
    } catch {
      setErroIA('Erro de rede ao pedir a sugestão da IA.');
    }
    setCarregandoIA(false);
  }

  useEffect(() => {
    buscarChatsAbertos();
    carregarTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mantém o pipeline vivo: revê a lista de atendimentos + os tickets a cada 15s
  // (1 req Umbler + 1 Supabase). Pausa com a aba oculta e não sobrepõe.
  useEffect(() => {
    let emVoo = false;
    async function tick() {
      if (emVoo || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      emVoo = true;
      try {
        const r = await fetch('/api/umbler/chats-abertos');
        const j = await r.json();
        if (j.ok && Array.isArray(j.chats)) setChatsAbertos(j.chats);
        await carregarTickets();
      } catch {
        // silencioso — atualização de fundo
      }
      emVoo = false;
    }
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh das mensagens do chat aberto a cada 15s. Usa o modo "leve"
  // (1 requisição só, sem paginar) e NÃO re-dispara a IA — pra não forçar as
  // APIs. Pausa quando a aba está oculta e nunca sobrepõe requisições.
  useEffect(() => {
    if (!chatSelecionadoId) return;
    let cancelado = false;
    let emVoo = false;
    async function tick() {
      if (emVoo || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      emVoo = true;
      try {
        const r = await fetch('/api/umbler/chat-historico?leve=1&id=' + encodeURIComponent(chatSelecionadoId));
        const j = await r.json();
        if (!cancelado && j.ok && Array.isArray(j.mensagens)) {
          setConversaMensagens(j.mensagens);
          setResetTeste(!!j.resetado);
        }
      } catch {
        // silencioso — é atualização de fundo
      }
      emVoo = false;
    }
    const id = setInterval(tick, 15000);
    return () => { cancelado = true; clearInterval(id); };
  }, [chatSelecionadoId]);

  // Rola a conversa pro fim quando chegam mensagens novas.
  useEffect(() => {
    const el = corpoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversaMensagens]);

  const c = consultorAtual();
  const lista = FLUXOS[aba] || [];

  // ===== Derivação do pipeline (Fila / Chats / Respondidos) =====
  const idsFinalizados = new Set(tickets.map((t) => t.chat_id));
  const termo = busca.trim().toLowerCase();
  const casaBusca = (nome, tel) =>
    !termo || (nome || '').toLowerCase().includes(termo) || (tel || '').toLowerCase().includes(termo);

  const abertosVisiveis = chatsAbertos.filter(
    (ch) => !idsFinalizados.has(ch.id) && casaBusca(ch.nome, ch.telefone)
  );
  // Fila: cliente mandou a última mensagem (esperando). Mais antigo no topo.
  const filaLista = abertosVisiveis
    .filter((ch) => ch.ultimaMensagemSource === 'Contact')
    .sort((a, b) => new Date(a.ultimaMensagemEm || 0) - new Date(b.ultimaMensagemEm || 0));
  // Chats: eu (ou o bot) respondi por último. Mais recente no topo.
  const chatsLista = abertosVisiveis
    .filter((ch) => ch.ultimaMensagemSource !== 'Contact')
    .sort((a, b) => new Date(b.ultimaMensagemEm || 0) - new Date(a.ultimaMensagemEm || 0));
  const respondidosLista = tickets.filter((t) => casaBusca(t.cliente, t.telefone));
  const listaFase = faseAtiva === 'fila' ? filaLista : faseAtiva === 'chats' ? chatsLista : respondidosLista;
  const ticketAtual = ticketDoChat(chatSelecionadoId);

  function focarTicket(chatId) {
    setTicketFoco(chatId);
    setMobilePane('conversa'); // no mobile, revela o board
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const el = document.getElementById('ticket-' + chatId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    }
  }

  function cardTicket(t) {
    const busy = ticketBusy[t.chat_id];
    return (
      <div id={'ticket-' + t.chat_id} key={t.chat_id} className={t.chat_id === ticketFoco ? 'ticket-card destaque' : 'ticket-card'}>
        <div className="ticket-top">
          <span>🎫 Ticket para o consultor</span>
          <span className={t.status === 'criado' ? 'ticket-badge criado' : 'ticket-badge pend'}>
            {t.status === 'criado' ? 'Ticket criado ✓' : 'Aguardando aprovação'}
          </span>
        </div>
        <div className="ticket-grid">
          <div><span>Cliente</span>{t.cliente || '—'}</div>
          <div><span>Telefone</span>{t.telefone || '—'}</div>
          <div><span>CNPJ</span>{t.cnpj || '—'}</div>
          <div><span>Razão social</span>{t.razao || '—'}</div>
          {t.consultor ? <div><span>Consultor</span>{t.consultor}</div> : null}
        </div>
        <label className="ticket-demanda-label">Demanda</label>
        <textarea
          className="ticket-demanda"
          value={demandaEdits[t.chat_id] ?? t.demanda ?? ''}
          onChange={(e) => setDemandaEdits((s) => ({ ...s, [t.chat_id]: e.target.value }))}
          rows={2}
          disabled={t.status === 'criado'}
        />
        {t.status === 'criado' ? (
          <div className="ticket-ok">✓ Ticket criado — a criação real no sistema do vendedor entra na integração futura.</div>
        ) : (
          <button className="btn-verde ticket-btn" type="button" onClick={() => aprovarTicket(t.chat_id)} disabled={busy === 'criando'}>
            {busy === 'criando' ? 'Criando…' : 'Solicitar aprovação / Criar ticket'}
          </button>
        )}
        {busy === 'erro' && <div className="erro">Não consegui criar o ticket — confira a tabela no Supabase.</div>}
        <div className="ticket-nota">Por ora só registra a aprovação. A criação no sistema do vendedor será integrada depois.</div>
      </div>
    );
  }

  return (
    <div className={mobilePane === 'conversa' ? 'app pane-conversa' : 'app'}>
      {/* ===== Coluna lateral: lista de clientes ===== */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <img src="/logo/sdr.svg" alt="SDR" className="sidebar-logo" />
          <button className="btn-refresh" onClick={buscarChatsAbertos} disabled={carregandoChats} type="button" title="Atualizar lista">
            {carregandoChats ? '…' : '↻'}
          </button>
        </div>
        {!SB_CONFIGURADO && (
          <div className="sb-aviso">⚠ Supabase não configurado — Fila/consultor/tickets não vão salvar. Defina <b>NEXT_PUBLIC_SUPABASE_URL</b> e <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b> (com https://) na Vercel e faça um redeploy.</div>
        )}
        <div className="sidebar-busca">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por nome ou número…" />
        </div>
        <div className="fases">
          <button type="button" className={faseAtiva === 'fila' ? 'fase ativa' : 'fase'} onClick={() => setFaseAtiva('fila')}>
            Fila <span className="fase-badge">{filaLista.length}</span>
          </button>
          <button type="button" className={faseAtiva === 'chats' ? 'fase ativa' : 'fase'} onClick={() => setFaseAtiva('chats')}>
            Chats <span className="fase-badge">{chatsLista.length}</span>
          </button>
          <button type="button" className={faseAtiva === 'respondidos' ? 'fase ativa' : 'fase'} onClick={() => setFaseAtiva('respondidos')}>
            Respondidos <span className="fase-badge">{respondidosLista.length}</span>
          </button>
        </div>
        <div className="lista-chats">
          {carregandoChats && chatsAbertos.length === 0 && <div className="vazio">Carregando…</div>}
          {listaFase.length === 0 && !(carregandoChats && chatsAbertos.length === 0) && (
            <div className="vazio">
              {faseAtiva === 'fila' ? 'Ninguém esperando na fila.' : faseAtiva === 'chats' ? 'Nenhum chat em andamento.' : 'Nenhum ticket ainda.'}
            </div>
          )}
          {faseAtiva === 'respondidos'
            ? respondidosLista.map((t) => (
                <button
                  key={t.chat_id}
                  type="button"
                  className={t.chat_id === ticketFoco ? 'chat-item selecionado' : 'chat-item'}
                  onClick={() => focarTicket(t.chat_id)}
                >
                  <div className="avatar">{inicial(t.cliente || t.telefone)}</div>
                  <div className="chat-item-txt">
                    <div className="chat-nome">{t.cliente || t.telefone || 'Cliente'}</div>
                    <div className="chat-msg">{t.status === 'criado' ? '✓ Ticket criado' : '• Ticket pendente'} · {t.demanda || 'sem demanda'}</div>
                  </div>
                </button>
              ))
            : listaFase.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  className={chat.id === chatSelecionadoId ? 'chat-item selecionado' : 'chat-item'}
                  onClick={() => selecionarChatAberto(chat)}
                >
                  <div className="avatar">{inicial(chat.nome || chat.telefone)}</div>
                  <div className="chat-item-txt">
                    <div className="chat-nome">{chat.nome || chat.telefone || 'Sem nome'}</div>
                    <div className="chat-msg">{chat.ultimaMensagem || '(sem mensagem)'}</div>
                  </div>
                </button>
              ))}
        </div>
      </aside>

      {/* ===== Conversa / Board de tickets ===== */}
      <main className="conversa">
        {faseAtiva === 'respondidos' ? (
          <div className="tickets-board">
            <div className="board-titulo">🎫 Tickets — Respondidos <span className="board-count">{respondidosLista.length}</span></div>
            {respondidosLista.length === 0 ? (
              <div className="conversa-vazia">Nenhum ticket ainda. Quando um atendimento for transferido pro consultor, o ticket aparece aqui.</div>
            ) : (
              <div className="board-grid">{respondidosLista.map((t) => cardTicket(t))}</div>
            )}
          </div>
        ) : !chatSelecionadoId ? (
          <div className="placeholder">
            <div className="placeholder-ico">💬</div>
            <p>Selecione um atendimento na coluna ao lado para começar.</p>
          </div>
        ) : (
          <>
            <div className="conversa-header">
              <button className="btn-voltar" onClick={() => setMobilePane('lista')} type="button" title="Voltar">←</button>
              <div className="avatar avatar-header">{inicial(nomeCliente || telCliente)}</div>
              <div className="conversa-header-txt">
                <div className="conversa-nome">{nomeCliente || telCliente || 'Cliente'}</div>
                <div className="conversa-sub">
                  {telCliente || '—'}
                  {cnpjInfo && cnpjAuto ? ` · ${cnpjInfo.empresa.razao}` : ''}
                </div>
              </div>
              <button className="btn-ferramentas" onClick={() => setMostrarManual(true)} type="button">🛠 Ferramentas</button>
            </div>

            <div className="conversa-corpo" ref={corpoRef}>
              {ticketAtual && cardTicket(ticketAtual)}
              {cnpjInfo && cnpjAuto && (
                <div className="cnpj-auto">
                  <span><strong>CNPJ detectado:</strong> {cnpj || ''} — {cnpjInfo.empresa.razao}</span>
                  <span className={cnpjInfo.elegivel ? 'tag-ok' : 'tag-neutro'}>
                    {cnpjInfo.elegivel ? 'elegível pro Direct' : 'sem CNAE elegível'}
                  </span>
                </div>
              )}
              {resetTeste && (
                <div className="reset-aviso">
                  ↺ Conversa reiniciada (teste) — tratando como <strong>cliente novo</strong>.
                </div>
              )}
              {conversaMensagens.length === 0 && <div className="conversa-vazia">Sem mensagens ainda.</div>}
              {conversaMensagens.map((m, i) => {
                const anterior = conversaMensagens[i - 1];
                const mostrarData = m.em && (!anterior || chaveDia(anterior.em) !== chaveDia(m.em));
                return (
                  <Fragment key={i}>
                    {mostrarData && (
                      <div className="dia-sep"><span>{rotuloDia(m.em)}</span></div>
                    )}
                    <div className={'bolha ' + (m.quem === 'Cliente' ? 'entrada' : m.quem === 'Bot' ? 'bot' : 'saida')}>
                      <span className="bolha-quem">{m.quem}</span>
                      <div className="bolha-txt">{m.texto}</div>
                      {m.em && <span className="bolha-hora">{formatarHora(m.em)}</span>}
                    </div>
                  </Fragment>
                );
              })}
            </div>

            <div className="compositor">
              {erroIA && <div className="erro">A sugestão da IA falhou: {erroIA}</div>}
              {carregandoIA && <div className="ia-status">Gerando sugestão…</div>}
              {sugestaoIA && (
                <div className="sug-cab">
                  <span className="sug-tag">Sugestão da IA</span>
                  <span className="sug-titulo">{sugestaoIA.t}</span>
                  <details className="sug-porque">
                    <summary>por quê?</summary>
                    <div className="sug-porque-txt">{raciocinioIA || '(sem raciocínio)'}</div>
                  </details>
                </div>
              )}
              {!ticketAtual && (
                <div className="cc">
                  <span className="cc-label">Cadastro:</span>
                  <div className="seg">
                    <button type="button" className={cadastroStatus === 'nao_sei' ? 'seg-btn ativo' : 'seg-btn'} onClick={() => setCadastroStatus('nao_sei')}>Não sei</button>
                    <button type="button" className={cadastroStatus === 'sim' ? 'seg-btn ativo' : 'seg-btn'} onClick={() => setCadastroStatus('sim')}>Tem</button>
                    <button type="button" className={cadastroStatus === 'nao' ? 'seg-btn ativo' : 'seg-btn'} onClick={() => setCadastroStatus('nao')}>Não tem</button>
                  </div>
                  <button type="button" className="btn-gerar-mini" onClick={gerarSugestao} disabled={carregandoIA}>
                    {carregandoIA ? '…' : sugestaoIA ? '↻ Gerar de novo' : '✨ Gerar sugestão'}
                  </button>
                </div>
              )}
              <div className="compositor-linha">
                <textarea
                  className="composer-input"
                  value={mensagemEditavel}
                  onChange={(e) => setMensagemEditavel(e.target.value)}
                  placeholder="Clique em ✨ Gerar sugestão pra a IA escrever aqui — ou digite você mesmo"
                  rows={Math.min(10, Math.max(2, mensagemEditavel.split('\n').length + 1))}
                />
                <div className="compositor-botoes">
                  <button className="btn-borda" onClick={() => copiar('ia-sugestao', mensagemEditavel)} disabled={!mensagemEditavel.trim()}>
                    {statusEnvio['ia-sugestao'] === 'copiado' ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button className="btn-verde" onClick={() => enviar('ia-sugestao', mensagemEditavel)} disabled={statusEnvio['ia-sugestao'] === 'enviando' || !mensagemEditavel.trim()}>
                    {statusEnvio['ia-sugestao'] === 'enviando' ? 'Enviando…' : statusEnvio['ia-sugestao'] === 'ok' ? 'Enviada!' : statusEnvio['ia-sugestao'] === 'erro' ? 'Erro — tentar de novo' : 'Enviar no WhatsApp'}
                  </button>
                </div>
              </div>
              {erro && <div className="erro">{erro}</div>}
            </div>
          </>
        )}
      </main>

      {/* ===== Drawer de ferramentas (config, templates, CNPJ, registrar) ===== */}
      {mostrarManual && (
        <div className="drawer-backdrop" onClick={() => setMostrarManual(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-top">
              <strong>Ferramentas do atendimento</strong>
              <button className="drawer-fechar" onClick={() => setMostrarManual(false)} type="button">✕</button>
            </div>
            <div className="drawer-corpo">
        <div className="config">
          <div className="campo">
            <label>Nome do cliente</label>
            <input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} placeholder="Ex: Brenda" />
          </div>
          <div className="campo">
            <label>Telefone do cliente (WhatsApp)</label>
            <input value={telCliente} onChange={(e) => setTelCliente(e.target.value)} placeholder="+55 44 99999-0000" />
          </div>
          <div className="campo">
            <label>Produto (busca ramo + consultor)</label>
            <div className="linha">
              <input value={produto} onChange={(e) => setProduto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscarConsultor(); }} placeholder="Ex: Inversor Growatt" />
              <button className="btn-azul" onClick={buscarConsultor} disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar consultor'}</button>
            </div>
          </div>
          <div className="campo">
            <label>Consultor (ou digite na mão)</label>
            <div className="linha">
              <input value={consNome} onChange={(e) => setConsNome(e.target.value)} placeholder="Nome do consultor" />
              <input value={consTel} onChange={(e) => setConsTel(e.target.value)} placeholder="Telefone" />
            </div>
          </div>
          {ramoInfo && <div className="ramo-info"><strong>Ramo: {ramoInfo.ramo}</strong> — {ramoInfo.motivo}</div>}
          {c && c.nome && (
            <div className="consultor-box">
              <strong>{c.nome}</strong> ({c.genero === 'F' ? 'consultora' : 'consultor'})
              {c.codigo ? ` — fila de ${c.ramo}, código ${c.codigo}` : ' — digitado manualmente'}
              {c.telefone ? ` · ${c.telefone}` : ''}
            </div>
          )}
        </div>

        <div className="tabs">
          <button className={aba === 'triagem' ? 'tab ativa' : 'tab'} onClick={() => setAba('triagem')}>Triagem rápida</button>
          <button className={aba === 'com' ? 'tab ativa' : 'tab'} onClick={() => setAba('com')}>Com cadastro</button>
          <button className={aba === 'sem' ? 'tab ativa' : 'tab'} onClick={() => setAba('sem')}>Sem cadastro</button>
          <button className={aba === 'direct' ? 'tab ativa' : 'tab'} onClick={() => setAba('direct')}>Direct (CNPJ)</button>
        </div>

        {aba === 'direct' && (
          <div>
            <div className="card">
              <div className="card-top">
                <span className="num">1</span>
                <div>
                  <div className="titulo">Consultar CNPJ</div>
                  <div className="situacao">Cole o CNPJ que o cliente mandou no chat</div>
                </div>
              </div>
              <div className="card-body">
                <div className="linha">
                  <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') consultarCnpj(); }} placeholder="00.000.000/0000-00" />
                  <button className="btn-azul" onClick={consultarCnpj} disabled={buscandoCnpj}>{buscandoCnpj ? 'Consultando...' : 'Consultar'}</button>
                </div>
                {cnpjInfo && (
                  <div style={{ marginTop: 10 }}>
                    <div className="consultor-box">
                      <strong>{cnpjInfo.empresa.razao}</strong>
                      {cnpjInfo.empresa.fantasia ? ` (${cnpjInfo.empresa.fantasia})` : ''} — {cnpjInfo.empresa.situacao}
                      {cnpjInfo.empresa.municipio ? ` · ${cnpjInfo.empresa.municipio}/${cnpjInfo.empresa.uf}` : ''}
                    </div>
                    <div className={cnpjInfo.elegivel ? 'veredicto ok' : 'veredicto neutro'}>
                      {cnpjInfo.elegivel
                        ? 'Perfil com cara de revenda/integrador — vale oferecer o Direct (confira o Db1 no passo 2).'
                        : 'Sem indícios claros de revenda/integrador nos CNAEs — avalie manualmente antes de oferecer.'}
                    </div>
                    <div className="cnaes">
                      {cnpjInfo.cnaes.map((cn, i2) => (
                        <div key={i2} className={cn.bate ? 'cnae bate' : 'cnae'}>
                          {cn.principal ? '(principal) ' : ''}{cn.codigo} — {cn.descricao}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card interno">
              <div className="card-top">
                <span className="num">2</span>
                <div>
                  <div className="titulo">Conferir no Db1<span className="badge"> INTERNO — NÃO ENVIAR</span></div>
                  <div className="situacao">Antes de oferecer</div>
                </div>
</div>
              <div className="card-body"><pre className="msg">{MSG_DIRECT_INTERNA}</pre></div>
            </div>

            <div className="card">
              <div className="card-top">
                <span className="num">3</span>
                <div>
                  <div className="titulo">Oferecer o Dicomp Direct</div>
                  <div className="situacao">Se for revenda/integrador e o Direct ainda não estiver habilitado</div>
                </div>
              </div>
              <div className="card-body">
                <pre className="msg">{MSG_DIRECT_OFERTA}</pre>
                <div className="acoes">
                  <button className="btn-borda" onClick={() => copiar('direct-oferta', MSG_DIRECT_OFERTA)}>{statusEnvio['direct-oferta'] === 'copiado' ? 'Copiado!' : 'Copiar'}</button>
                  <button className="btn-verde" onClick={() => enviar('direct-oferta', MSG_DIRECT_OFERTA)} disabled={statusEnvio['direct-oferta'] === 'enviando'}>
                    {statusEnvio['direct-oferta'] === 'enviando' ? 'Enviando...' : statusEnvio['direct-oferta'] === 'ok' ? 'Enviada!' : statusEnvio['direct-oferta'] === 'erro' ? 'Erro — tentar de novo' : 'Enviar no WhatsApp'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {lista.map((item, i) => {
          const chave = aba + '-' + i;
          const interno = item.tipo === 'interno';
          const texto = aplicar(item.m);
          const st = statusEnvio[chave];
          return (
            <div className={interno ? 'card interno' : 'card'} key={chave}>
              <div className="card-top">
                <span className="num">{i + 1}</span>
                <div>
                  <div className="titulo">{item.t}{interno && <span className="badge"> INTERNO — NÃO ENVIAR</span>}</div>
                  <div className="situacao">{item.q}</div>
                </div>
              </div>
              <div className="card-body">
                <pre className="msg">{texto}</pre>
                {item.n && <div className="nota">{item.n}</div>}
                {!interno && (
                  <div className="acoes">
                    <button className="btn-borda" onClick={() => copiar(chave, texto)}>{st === 'copiado' ? 'Copiado!' : 'Copiar'}</button>
                    <button className="btn-verde" onClick={() => enviar(chave, texto)} disabled={st === 'enviando'}>
                      {st === 'enviando' ? 'Enviando...' : st === 'ok' ? 'Enviada!' : st === 'erro' ? 'Erro — tentar de novo' : 'Enviar no WhatsApp'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {aba !== 'direct' && (
        <div className="rodape">
          <button className="btn-azul" onClick={registrarAtendimento} disabled={registrando || registrado}>
            {registrando ? 'Registrando...' : registrado ? 'Atendimento registrado!' : 'Registrar atendimento (avança a fila)'}
          </button>
        </div>
        )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        .app { display: flex; height: 100vh; overflow: hidden; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #22293a; background: #eef1f7; }
        input { width: 100%; padding: 9px 12px; border: 1px solid #c6d4f2; border-radius: 8px; font-size: .95rem; }
        input:focus { outline: 2px solid #1c3f94; border-color: #1c3f94; }
        button { border: none; border-radius: 8px; padding: 9px 14px; font-weight: 700; font-size: .88rem; cursor: pointer; white-space: nowrap; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .btn-azul { background: #1c3f94; color: #fff; }
        .btn-azul:hover:not(:disabled) { background: #12276b; }
        .btn-verde { background: #1e9e5a; color: #fff; }
        .btn-verde:hover:not(:disabled) { background: #157a44; }
        .btn-borda { background: #fff; color: #1c3f94; border: 1px solid #1c3f94; }
        .btn-borda:hover:not(:disabled) { background: #eaf0fc; }
        .erro { color: #c02b2b; font-size: .82rem; margin: 4px 0; }
        .linha { display: flex; gap: 8px; }

        /* ===== Sidebar ===== */
        .sidebar { width: 340px; flex-shrink: 0; background: #fff; border-right: 1px solid #e1e6f0; display: flex; flex-direction: column; }
        .sidebar-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: linear-gradient(135deg, #12276b, #1c3f94); padding: 14px 16px; }
        .sidebar-logo { height: 26px; width: auto; background: #fff; padding: 5px 10px; border-radius: 8px; }
        .btn-refresh { background: rgba(255,255,255,.16); color: #fff; width: 34px; height: 34px; padding: 0; border-radius: 50%; font-size: 1rem; }
        .btn-refresh:hover:not(:disabled) { background: rgba(255,255,255,.28); }
        .sidebar-sub { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #6b7385; padding: 12px 16px 6px; }
        .lista-chats { flex: 1; overflow-y: auto; padding: 0 8px 8px; display: flex; flex-direction: column; gap: 2px; }
        .chat-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: none; border-radius: 10px; padding: 10px; cursor: pointer; }
        .chat-item:hover { background: #f2f5fb; }
        .chat-item.selecionado { background: #eaf0fc; }
        .avatar { width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; background: #1c3f94; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.05rem; }
        .chat-item-txt { min-width: 0; flex: 1; }
        .chat-nome { font-weight: 700; font-size: .9rem; color: #22293a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-msg { font-size: .8rem; color: #6b7385; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vazio { font-size: .82rem; color: #97a0af; padding: 14px; text-align: center; }
        .sb-aviso { margin: 8px 10px 0; background: #fdeaea; border: 1px solid #f3b6b6; border-radius: 8px; padding: 8px 10px; font-size: .74rem; color: #97231f; line-height: 1.4; }
        .sidebar-busca { padding: 10px 12px 6px; }
        .sidebar-busca input { font-size: .85rem; padding: 8px 12px; border-radius: 20px; background: #f2f5fb; }
        .fases { display: flex; gap: 4px; padding: 4px 10px 8px; border-bottom: 1px solid #eef1f7; }
        .fase { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: none; color: #6b7385; font-size: .82rem; padding: 8px 4px; border-radius: 8px; border-bottom: 2px solid transparent; }
        .fase:hover { background: #f2f5fb; }
        .fase.ativa { color: #1c3f94; border-bottom-color: #1c3f94; font-weight: 800; }
        .fase-badge { background: #e1e6f0; color: #4a5568; border-radius: 20px; font-size: .68rem; font-weight: 800; padding: 1px 7px; min-width: 18px; text-align: center; }
        .fase.ativa .fase-badge { background: #1c3f94; color: #fff; }

        /* ===== Conversa ===== */
        .conversa { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #e7ebf3; }
        .placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #8a93a6; text-align: center; padding: 24px; }
        .placeholder-ico { font-size: 3rem; }
        .conversa-header { display: flex; align-items: center; gap: 12px; background: #1c3f94; color: #fff; padding: 10px 16px; }
        .conversa-header .avatar-header { background: #fff; color: #1c3f94; width: 40px; height: 40px; }
        .btn-voltar { display: none; background: none; color: #fff; padding: 4px 8px; font-size: 1.2rem; }
        .conversa-header-txt { flex: 1; min-width: 0; }
        .conversa-nome { font-weight: 700; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .conversa-sub { font-size: .76rem; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btn-ferramentas { background: rgba(255,255,255,.16); color: #fff; font-size: .82rem; }
        .btn-ferramentas:hover { background: rgba(255,255,255,.28); }
        .conversa-corpo { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
        .conversa-vazia { text-align: center; color: #8a93a6; font-size: .85rem; margin: auto; }
        .bolha { max-width: 74%; padding: 7px 11px; border-radius: 12px; font-size: .9rem; line-height: 1.4; box-shadow: 0 1px 1px rgba(0,0,0,.06); }
        .bolha-quem { display: block; font-size: .68rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; opacity: .6; margin-bottom: 2px; }
        .bolha-txt { white-space: pre-wrap; word-break: break-word; }
        .bolha.entrada { align-self: flex-start; background: #fff; color: #22293a; border-top-left-radius: 3px; }
        .bolha.saida { align-self: flex-end; background: #dcf8c6; color: #103a24; border-top-right-radius: 3px; }
        .bolha.saida .bolha-quem { color: #1e7a45; }
        .bolha.bot { align-self: center; background: #eceff5; color: #6b7385; font-size: .82rem; max-width: 88%; text-align: center; box-shadow: none; }
        .bolha-hora { display: block; text-align: right; font-size: .64rem; color: #9aa3b2; margin-top: 2px; }
        .bolha.saida .bolha-hora { color: #5f9673; }
        .bolha.bot .bolha-hora { text-align: center; }
        .dia-sep { align-self: center; margin: 6px 0 2px; }
        .dia-sep span { background: #d6dce8; color: #4a5568; font-size: .7rem; font-weight: 700; border-radius: 20px; padding: 3px 12px; }

        /* ===== Banners ===== */
        .cnpj-auto { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; background: #eaf0fc; border: 1px solid #c6d4f2; border-left: 4px solid #1c3f94; border-radius: 8px; padding: 9px 12px; font-size: .8rem; color: #1c3f94; }
        .cnpj-auto .tag-ok { background: #e5f7ee; color: #12603a; border-radius: 20px; padding: 2px 10px; font-weight: 700; font-size: .72rem; white-space: nowrap; }
        .cnpj-auto .tag-neutro { background: #fff7e0; color: #7a6216; border-radius: 20px; padding: 2px 10px; font-weight: 700; font-size: .72rem; white-space: nowrap; }
        .reset-aviso { background: #fff7e0; border: 1px solid #f0d98c; border-left: 4px solid #d99a06; color: #7a6216; border-radius: 8px; padding: 9px 12px; font-size: .8rem; }

        /* ===== Card de ticket (Respondidos) ===== */
        .ticket-card { background: #fff; border: 1px solid #c6d4f2; border-radius: 12px; padding: 14px; box-shadow: 0 2px 10px rgba(28,63,148,.10); }
        .ticket-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-weight: 800; color: #12276b; margin-bottom: 12px; }
        .ticket-badge { font-size: .68rem; font-weight: 800; border-radius: 20px; padding: 3px 10px; white-space: nowrap; }
        .ticket-badge.pend { background: #fff7e0; color: #7a6216; }
        .ticket-badge.criado { background: #e5f7ee; color: #12603a; }
        .ticket-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin-bottom: 12px; }
        .ticket-grid > div { font-size: .88rem; color: #22293a; }
        .ticket-grid > div > span { display: block; font-size: .66rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #8a93a6; margin-bottom: 1px; }
        .ticket-demanda-label { display: block; font-size: .66rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #8a93a6; margin-bottom: 4px; }
        .ticket-demanda { width: 100%; font-family: inherit; font-size: .88rem; background: #f4f6fb; border: 1px solid #c6d4f2; border-radius: 8px; padding: 8px 10px; resize: vertical; line-height: 1.4; margin-bottom: 12px; }
        .ticket-demanda:focus { outline: 2px solid #1c3f94; border-color: #1c3f94; }
        .ticket-btn { width: 100%; padding: 11px; }
        .ticket-ok { background: #e5f7ee; color: #12603a; border-radius: 8px; padding: 10px 12px; font-size: .86rem; font-weight: 600; }
        .ticket-nota { font-size: .72rem; color: #97a0af; margin-top: 8px; }
        .ticket-card.destaque { outline: 2px solid #1c3f94; outline-offset: 1px; }
        .tickets-board { flex: 1; overflow-y: auto; padding: 16px; }
        .board-titulo { display: flex; align-items: center; gap: 8px; font-weight: 800; color: #12276b; font-size: 1rem; margin-bottom: 14px; }
        .board-count { background: #1c3f94; color: #fff; border-radius: 20px; font-size: .72rem; font-weight: 800; padding: 1px 9px; }
        .board-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; align-items: start; }

        /* ===== Compositor ===== */
        .compositor { border-top: 1px solid #d5dced; background: #f7f9fc; padding: 10px 16px 14px; }
        .ia-status { font-size: .82rem; color: #1c3f94; margin-bottom: 6px; }
        .sug-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; font-size: .82rem; }
        .sug-tag { background: #1c3f94; color: #fff; border-radius: 20px; padding: 2px 10px; font-weight: 800; font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; }
        .sug-titulo { font-weight: 700; color: #22293a; }
        .sug-porque { margin-left: auto; }
        .sug-porque summary { font-size: .76rem; color: #1c3f94; cursor: pointer; font-weight: 600; }
        .sug-porque-txt { font-size: .78rem; color: #6b7385; background: #eef1f7; border-radius: 8px; padding: 8px 10px; margin-top: 6px; max-width: 520px; }
        .cc { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .cc-label { font-size: .76rem; font-weight: 700; color: #1c3f94; }
        .seg { display: inline-flex; border: 1px solid #c6d4f2; border-radius: 8px; overflow: hidden; }
        .seg-btn { background: #fff; color: #1c3f94; border: none; border-radius: 0; padding: 6px 11px; font-size: .78rem; font-weight: 600; }
        .seg-btn + .seg-btn { border-left: 1px solid #c6d4f2; }
        .seg-btn.ativo { background: #1c3f94; color: #fff; }
        .btn-gerar-mini { margin-left: auto; background: #eaf0fc; color: #1c3f94; font-size: .78rem; padding: 6px 11px; }
        .btn-gerar-mini:hover:not(:disabled) { background: #dbe6fb; }
        .compositor-linha { display: flex; gap: 8px; align-items: flex-end; }
        .composer-input { flex: 1; white-space: pre-wrap; font-family: inherit; font-size: .92rem; background: #fff; border: 1px solid #c6d4f2; border-radius: 12px; padding: 10px 12px; resize: none; line-height: 1.4; max-height: 220px; }
        .composer-input:focus { outline: 2px solid #1c3f94; border-color: #1c3f94; }
        .compositor-botoes { display: flex; flex-direction: column; gap: 6px; }
        .compositor-botoes .btn-verde { min-width: 150px; }

        /* ===== Drawer de ferramentas ===== */
        .drawer-backdrop { position: fixed; inset: 0; background: rgba(18,39,107,.35); display: flex; justify-content: flex-end; z-index: 50; }
        .drawer { width: 460px; max-width: 92vw; height: 100%; background: #f4f6fb; display: flex; flex-direction: column; box-shadow: -8px 0 24px rgba(0,0,0,.18); }
        .drawer-top { display: flex; align-items: center; justify-content: space-between; background: #1c3f94; color: #fff; padding: 14px 16px; font-size: .95rem; }
        .drawer-fechar { background: rgba(255,255,255,.16); color: #fff; width: 30px; height: 30px; padding: 0; border-radius: 50%; }
        .drawer-corpo { flex: 1; overflow-y: auto; padding: 16px; }

        /* ===== Utilitários usados no drawer ===== */
        .config { background: #fff; border: 1px solid #c6d4f2; border-radius: 14px; padding: 16px; margin: 0 0 16px; display: flex; flex-wrap: wrap; gap: 12px; }
        .campo { flex: 1; min-width: 200px; }
        .campo label { font-size: .72rem; font-weight: 600; color: #1c3f94; text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 4px; }
        .ramo-info { width: 100%; background: #eaf0fc; border-left: 4px solid #1c3f94; border-radius: 8px; padding: 8px 12px; font-size: .85rem; color: #1c3f94; }
        .consultor-box { width: 100%; background: #e5f7ee; border-left: 4px solid #1e9e5a; border-radius: 8px; padding: 8px 12px; font-size: .88rem; }
        .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .tab { flex: 1; min-width: 120px; padding: 10px; border: 1px solid #c6d4f2; background: #fff; color: #1c3f94; border-radius: 10px; }
        .tab.ativa { background: #1c3f94; color: #fff; }
        .card { background: #fff; border: 1px solid #c6d4f2; border-radius: 14px; margin-bottom: 16px; overflow: hidden; }
        .card.interno { border-color: #f0d98c; }
        .card.interno .card-top { background: #fff7e0; border-bottom-color: #f0d98c; }
        .card.interno .num { background: #d99a06; }
        .card-top { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; background: #eaf0fc; border-bottom: 1px solid #c6d4f2; }
        .num { background: #1c3f94; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: .85rem; flex-shrink: 0; }
        .titulo { font-weight: 700; }
        .badge { font-size: .65rem; font-weight: 800; color: #7a6216; letter-spacing: .05em; }
        .situacao { font-size: .8rem; color: #6b7385; margin-top: 2px; }
        .card-body { padding: 12px 16px; }
        .msg { white-space: pre-wrap; font-family: inherit; font-size: .9rem; background: #f4f6fb; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; word-break: break-word; }
        .nota { font-size: .78rem; color: #7a6216; background: #fff7e0; border: 1px solid #f0d98c; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
        .acoes { display: flex; gap: 8px; flex-wrap: wrap; }
        .acoes .btn-verde { flex: 1; }
        .rodape { margin: 8px 0 0; }
        .rodape .btn-azul { width: 100%; padding: 12px; }
        .veredicto { margin-top: 8px; padding: 9px 12px; border-radius: 8px; font-size: .88rem; font-weight: 600; }
        .veredicto.ok { background: #e5f7ee; border-left: 4px solid #1e9e5a; color: #12603a; }
        .veredicto.neutro { background: #fff7e0; border-left: 4px solid #d99a06; color: #7a6216; }
        .cnaes { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .cnae { font-size: .78rem; color: #6b7385; background: #f4f6fb; border-radius: 6px; padding: 5px 9px; }
        .cnae.bate { color: #12603a; background: #e5f7ee; font-weight: 600; }

        /* ===== Responsivo (mobile: uma coluna por vez) ===== */
        @media (max-width: 760px) {
          .sidebar { width: 100%; }
          .conversa { display: none; }
          .app.pane-conversa .sidebar { display: none; }
          .app.pane-conversa .conversa { display: flex; }
          .btn-voltar { display: inline-flex; }
          .bolha { max-width: 85%; }
          .compositor-botoes .btn-verde { min-width: 0; }
        }
      `}</style>
    </div>
  );
}
