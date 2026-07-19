"use client";

import { useEffect, useState } from "react";

interface Ticket {
  id: string;
  data: string;
  cliente: string;
  contato: string;
  demanda: string;
  descricao_final: string;
  copiado: boolean;
  criado_em: string;
}

export default function DashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tickets");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTickets(json.tickets ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar tickets");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial padrão
    carregar();
  }, []);

  async function copiar(ticket: Ticket) {
    await navigator.clipboard.writeText(ticket.descricao_final);
    setCopiadoId(ticket.id);
    setTimeout(() => setCopiadoId(null), 1600);
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ticket.id, copiado: true }),
    });
    setTickets((prev) =>
      prev.map((t) => (t.id === ticket.id ? { ...t, copiado: true } : t))
    );
  }

  const pendentes = tickets.filter((t) => !t.copiado);
  const jaCopiados = tickets.filter((t) => t.copiado);

  return (
    <main className="max-w-3xl mx-auto p-6 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-blue-900">
          Tickets gerados automaticamente
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Conversas novas do Umbler, já formatadas para colar no ticket do
          sis.dicomp.com.br
        </p>
      </header>

      {carregando && <p className="text-gray-500">Carregando...</p>}
      {erro && (
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-sm mb-4">
          {erro}
        </p>
      )}

      {!carregando && !erro && pendentes.length === 0 && (
        <p className="text-gray-500">
          Nenhum ticket pendente. Assim que a sincronização automática rodar,
          eles aparecem aqui.
        </p>
      )}

      <div className="space-y-4">
        {pendentes.map((ticket) => (
          <div
            key={ticket.id}
            className="border border-blue-200 rounded-xl overflow-hidden bg-white"
          >
            <div className="flex items-center justify-between bg-blue-50 px-4 py-3 border-b border-blue-200">
              <div>
                <div className="font-bold text-blue-900">
                  {ticket.cliente || "Sem nome"}
                </div>
                <div className="text-xs text-gray-500">{ticket.contato}</div>
              </div>
              <button
                onClick={() => copiar(ticket)}
                className="bg-blue-900 hover:bg-blue-950 text-white text-sm font-bold px-4 py-2 rounded-lg transition"
              >
                {copiadoId === ticket.id ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm p-4 font-sans">
              {ticket.descricao_final}
            </pre>
          </div>
        ))}
      </div>

      {jaCopiados.length > 0 && (
        <details className="mt-8">
          <summary className="text-sm text-gray-500 cursor-pointer">
            Já copiados ({jaCopiados.length})
          </summary>
          <div className="space-y-3 mt-3 opacity-60">
            {jaCopiados.map((ticket) => (
              <div
                key={ticket.id}
                className="border border-gray-200 rounded-lg p-3 text-sm"
              >
                <strong>{ticket.cliente || "Sem nome"}</strong> —{" "}
                {ticket.contato}
              </div>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
