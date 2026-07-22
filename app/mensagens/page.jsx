'use client';

import { useState } from 'react';

// ====== Supabase (mesmo projeto/tabelas da extensão Assistente SDR) ======
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error('Supabase GET falhou');
  return r.json();
}
async function sbPost(path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Supabase POST falhou');
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
    { t: 'Saudação de abertura', q: 'Primeira mensagem, assim que o atendimento cai para você', m: `Bom dia/Boa tarde, {nome}! Tudo bem?` },
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
    { t: 'Perguntar a demanda', q: 'Depois que o cliente responder sobre as frentes', m: `Enquanto o nosso time libera o seu pré-cadastro, me conta: com quais *marcas ou produtos* você tem demanda hoje? Assim eu já te direciono ao consultor certo.` },
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

  function consultorAtual() {
    const digitado = consNome.trim();
    if (consultorFila && digitado === consultorFila.nome) return consultorFila;
    if (digitado) return { codigo: null, nome: digitado, telefone: consTel.trim(), genero: detectarGenero(digitado), ramo: ramoInfo ? ramoInfo.ramo : null };
    return consultorFila;
  }

  function aplicar(txt) {
    const c = consultorAtual();
    const f = c ? c.genero === 'F' : false;
    return txt
      .replaceAll('{nome}', nomeCliente.trim() || '<nome>')
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
      if (!j.ok) setErro('O envio falhou: ' + (j.erro || j.detalhe || 'erro desconhecido'));
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

  const c = consultorAtual();
  const lista = FLUXOS[aba] || [];

  return (
    <div className="pagina">
      <header>
        <h1>Mensagens — CS Dicomp</h1>
        <p>Clique em Enviar e a mensagem sai direto no WhatsApp do cliente via Umbler</p>
      </header>

      <div className="container">
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
          {erro && <div className="erro">{erro}</div>}
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

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .pagina { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f4f6fb; color: #22293a; min-height: 100vh; padding-bottom: 60px; }
        header { background: linear-gradient(135deg, #12276b, #1c3f94); color: #fff; padding: 28px 20px 40px; text-align: center; }
        header h1 { font-size: 1.35rem; letter-spacing: .3px; }
        header p { opacity: .85; font-size: .9rem; margin-top: 6px; }
        .container { max-width: 820px; margin: 0 auto; padding: 0 16px; }
        .config { background: #fff; border: 1px solid #c6d4f2; border-radius: 14px; padding: 16px; margin: -18px auto 20px; box-shadow: 0 4px 14px rgba(28,63,148,.10); display: flex; flex-wrap: wrap; gap: 12px; }
        .campo { flex: 1; min-width: 240px; }
        .campo label { font-size: .72rem; font-weight: 600; color: #1c3f94; text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 4px; }
        input { width: 100%; padding: 9px 12px; border: 1px solid #c6d4f2; border-radius: 8px; font-size: .95rem; }
        input:focus { outline: 2px solid #1c3f94; border-color: #1c3f94; }
        .linha { display: flex; gap: 8px; }
        button { border: none; border-radius: 8px; padding: 9px 14px; font-weight: 700; font-size: .88rem; cursor: pointer; white-space: nowrap; }
        button:disabled { opacity: .6; cursor: not-allowed; }
        .btn-azul { background: #1c3f94; color: #fff; }
        .btn-azul:hover { background: #12276b; }
        .btn-verde { background: #1e9e5a; color: #fff; }
        .btn-verde:hover { background: #157a44; }
        .btn-borda { background: #fff; color: #1c3f94; border: 1px solid #1c3f94; }
        .btn-borda:hover { background: #eaf0fc; }
        .ramo-info { width: 100%; background: #eaf0fc; border-left: 4px solid #1c3f94; border-radius: 8px; padding: 8px 12px; font-size: .85rem; color: #1c3f94; }
        .consultor-box { width: 100%; background: #e5f7ee; border-left: 4px solid #1e9e5a; border-radius: 8px; padding: 8px 12px; font-size: .88rem; }
        .erro { width: 100%; color: #c02b2b; font-size: .82rem; }
        .tabs { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
        .tab { flex: 1; min-width: 150px; padding: 12px 10px; border: 1px solid #c6d4f2; background: #fff; color: #1c3f94; border-radius: 10px; }
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
        .rodape { margin: 24px 0; }
        .rodape .btn-azul { width: 100%; padding: 12px; }
        .veredicto { margin-top: 8px; padding: 9px 12px; border-radius: 8px; font-size: .88rem; font-weight: 600; }
        .veredicto.ok { background: #e5f7ee; border-left: 4px solid #1e9e5a; color: #12603a; }
        .veredicto.neutro { background: #fff7e0; border-left: 4px solid #d99a06; color: #7a6216; }
        .cnaes { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .cnae { font-size: .78rem; color: #6b7385; background: #f4f6fb; border-radius: 6px; padding: 5px 9px; }
        .cnae.bate { color: #12603a; background: #e5f7ee; font-weight: 600; }
      `}</style>
    </div>
  );
}
