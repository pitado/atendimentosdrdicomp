import { NextRequest, NextResponse } from "next/server";
import { getMe, listChats, getChat } from "@/lib/umbler";
import { getSupabaseServerClient } from "@/lib/supabase";
import { montarDescricaoTicket } from "@/lib/parser";

// Protege a rota: só a Vercel (com CRON_SECRET) ou você mesma testando
// manualmente com o header correto podem chamar isso.
function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sem secret configurado ainda = sem trava (ok em dev)
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

  // 1. Descobre a organização (necessário pra listar os chats)
  const me = await getMe();
  const organizationId = me.organizations?.[0]?.id;
  if (!organizationId) {
    return NextResponse.json(
      { error: "Nenhuma organização encontrada para este token" },
      { status: 500 }
    );
  }

  // 2. Lista os chats mais recentes
  const { items: chats } = await listChats({ organizationId, pageSize: 25 });

  let novos = 0;

  for (const chat of chats) {
    const { data: existente } = await supabase
      .from("chats_sincronizados")
      .select("id")
      .eq("id", chat.id)
      .maybeSingle();

    if (existente) continue; // já processado antes

    // 3. Busca o chat completo com as mensagens
    const chatCompleto = await getChat(chat.id);

    await supabase.from("chats_sincronizados").insert({
      id: chat.id,
      contato_nome: chatCompleto.contact?.name ?? null,
      contato_telefone: chatCompleto.contact?.phoneNumber ?? null,
      ultima_mensagem_em: chatCompleto.lastMessage?.eventAtUTC ?? null,
      bruto: chatCompleto,
      processado: true,
    });

    // 4. Monta um rascunho de ticket com a mensagem mais longa do contato
    const mensagensContato = (chatCompleto.messages ?? []).filter(
      (msg) => msg.source === "Contact"
    );
    const demanda = mensagensContato
      .map((msg) => msg.content ?? "")
      .sort((a, b) => b.length - a.length)[0];

    const draft = {
      data: new Date().toLocaleDateString("pt-BR"),
      cliente: chatCompleto.contact?.name ?? "",
      contato: chatCompleto.contact?.phoneNumber ?? "",
      demanda: demanda ?? "",
    };

    await supabase.from("tickets_gerados").insert({
      chat_id: chat.id,
      data: draft.data,
      cliente: draft.cliente,
      contato: draft.contato,
      demanda: draft.demanda,
      descricao_final: montarDescricaoTicket(draft),
    });

    novos++;
  }

  return NextResponse.json({ ok: true, chatsVerificados: chats.length, novos });
}
