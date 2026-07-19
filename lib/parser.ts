// Lógica portada da ferramenta HTML (atendimento-cs-dicomp.html) — mesma
// heurística já testada com conversas reais: pega a mensagem mais longa do
// contato como candidata a "demanda", ignorando links de imagem.

export interface TicketDraft {
  data: string;
  cliente: string;
  contato: string;
  demanda: string;
}

function dataHojeBR(): string {
  const d = new Date();
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

// Extrai um rascunho de ticket a partir do texto de um chat exportado no
// formato do Umbler (Contato / Telefone no cabeçalho + linhas "[hh:mm] Nome (contato): ...").
export function extrairTicketDeTexto(textoExportado: string): TicketDraft {
  const mNome = textoExportado.match(/^Contato:\s*(.+)$/m);
  const mTelefone = textoExportado.match(/^Telefone:\s*(.+)$/m);

  const regexMsg =
    /\[\d{2}:\d{2}\]\s*(.+?)\s*\(contato\):\s*([\s\S]*?)(?=\n\[\d{2}:\d{2}\]|\n---|\n*$)/g;

  let candidata = "";
  let m: RegExpExecArray | null;
  while ((m = regexMsg.exec(textoExportado)) !== null) {
    const conteudo = m[2].trim();
    const semLink = conteudo.replace(/https?:\/\/\S+/g, "").trim();
    if (semLink.length > candidata.length) {
      candidata = conteudo;
    }
  }

  return {
    data: dataHojeBR(),
    cliente: mNome ? mNome[1].trim() : "",
    contato: mTelefone ? mTelefone[1].trim() : "",
    demanda: candidata,
  };
}

// Monta o texto final no formato usado no campo "Descrição" do ticket
// (sis.dicomp.com.br/index.php/atendimentos/ListaAtendimentos/index).
export function montarDescricaoTicket(draft: TicketDraft): string {
  const cliente = draft.cliente || "<nome do cliente>";
  const contato = draft.contato || "<telefone>";
  const demanda = draft.demanda || "<descreva a demanda>";
  return `${draft.data}\n\nCliente: ${cliente}\n\nContato: ${contato}\n\nDemanda: ${demanda}`;
}
