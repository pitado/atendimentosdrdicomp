// Cliente mínimo para a API do Umbler Talk.
// Docs: https://help.umbler.com/hc/pt-br/articles/21150267515149-Manual-da-API-do-Talk
// A API só está disponível no plano Enterprise do Umbler Talk.
//
// Os nomes de campo abaixo foram confirmados contra a spec OpenAPI oficial
// (https://app-utalk.umbler.com/api/docs/v1/docs.json). Pontos importantes:
// - O histórico de um chat vem em `latestMessages` (não `messages`), e só é
//   preenchido quando se passa includeMessages > 0 em GET /v1/chats/{id}/.
// - `organizationId` é obrigatório nas rotas de chat.
// - A rota GET /v1/chats/{id}/relative-messages/ pagina o histórico completo.

const BASE_URL = "https://app-utalk.umbler.com/api";

function getToken(): string {
  const token = process.env.UMBLER_API_TOKEN;
  if (!token) {
    throw new Error(
      "UMBLER_API_TOKEN não configurado. Adicione a variável de ambiente na Vercel."
    );
  }
  return token;
}

function requireOrganizationId(): string {
  const organizationId = process.env.UMBLER_ORGANIZATION_ID;
  if (!organizationId) {
    throw new Error("UMBLER_ORGANIZATION_ID não configurado.");
  }
  return organizationId;
}

async function umblerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Umbler API ${res.status} em ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export interface UmblerMember {
  id: string;
  name?: string;
  organizations?: { id: string; name?: string }[];
}

// GET /v1/members/me/ — primeira chamada recomendada, retorna quem você é
// e o(s) OrganizationId(s) necessários pras outras rotas.
export async function getMe() {
  return umblerFetch<UmblerMember>("/v1/members/me/");
}

// Uma "parte" do chat. Mensagens de texto têm `content`; itens de metadata
// (bot iniciado, chat fechado etc.) podem vir no mesmo array, mas sem `content`.
export interface UmblerChatMessage {
  id: string;
  eventAtUTC: string;
  content?: string;
  // Origem da mensagem, conforme o enum MessageSources da API.
  source?: "Contact" | "Member" | "External" | "Bot" | string;
  messageType?: string;
}

export interface UmblerChat {
  id: string;
  contact?: {
    id?: string;
    name?: string;
    phoneNumber?: string;
  };
  lastMessage?: UmblerChatMessage;
  // Preenchido por GET /v1/chats/{id}/ quando includeMessages > 0.
  latestMessages?: UmblerChatMessage[];
  organizationId?: string;
  open?: boolean;
  eventAtUTC?: string;
}

// GET /v1/chats — lista de chats, com filtros/paginação (Skip/Take).
// `organizationId` é obrigatório; por padrão a API já traz só os chats abertos
// (ChatState=Open).
export async function listChats(params: {
  organizationId: string;
  skip?: number;
  take?: number;
}) {
  const qs = new URLSearchParams({
    organizationId: params.organizationId,
    ...(params.skip != null ? { Skip: String(params.skip) } : {}),
    ...(params.take != null ? { Take: String(params.take) } : {}),
  });
  return umblerFetch<{ items: UmblerChat[]; page?: unknown }>(
    `/v1/chats/?${qs.toString()}`
  );
}

// GET /v1/chats/{id}/ — um chat específico. Com includeMessages > 0, a API
// devolve as últimas mensagens (até ~100) no campo `latestMessages`.
// `organizationId` é obrigatório.
export async function getChat(
  chatId: string,
  opts?: { includeMessages?: number }
) {
  const qs = new URLSearchParams({
    organizationId: requireOrganizationId(),
    includeMessages: String(opts?.includeMessages ?? 100),
  });
  return umblerFetch<UmblerChat & { latestMessages?: UmblerChatMessage[] }>(
    `/v1/chats/${chatId}/?${qs.toString()}`
  );
}

// Puxa o histórico COMPLETO de um chat, paginando a rota
// GET /v1/chats/{chatId}/relative-messages/ (que devolve no máximo `Take`
// mensagens por chamada). Caminhamos pra trás no tempo (Direction=TakeBefore),
// usando o eventAtUTC da mensagem mais antiga de cada lote como cursor, até
// esgotar a conversa ou bater no teto `max`. Retorna ordenado do mais antigo
// pro mais novo, sem duplicatas. IncludeMetadata fica em False (default), então
// só vêm mensagens de verdade, não eventos de sistema.
export async function getAllChatMessages(
  chatId: string,
  opts?: { max?: number }
): Promise<UmblerChatMessage[]> {
  const organizationId = requireOrganizationId();
  const max = opts?.max ?? 300;
  const take = 50;
  const porId = new Map<string, UmblerChatMessage>();
  let cursor = new Date().toISOString(); // começa "agora" e vai voltando

  for (let volta = 0; volta < 100 && porId.size < max; volta++) {
    const qs = new URLSearchParams({
      organizationId,
      FromEventUTC: cursor,
      Take: String(take),
      Direction: "TakeBefore",
    });
    const resp = await umblerFetch<{ messages?: UmblerChatMessage[] }>(
      `/v1/chats/${chatId}/relative-messages/?${qs.toString()}`
    );
    const lote = resp.messages ?? [];
    if (lote.length === 0) break;

    let novas = 0;
    let maisAntiga = cursor;
    for (const m of lote) {
      if (m.id && !porId.has(m.id)) {
        porId.set(m.id, m);
        novas++;
      }
      if (m.eventAtUTC && m.eventAtUTC < maisAntiga) maisAntiga = m.eventAtUTC;
    }
    // Sem mensagens novas ou o cursor não andou pra trás → chegamos no início.
    if (novas === 0 || maisAntiga === cursor) break;
    cursor = maisAntiga;
    if (lote.length < take) break; // último lote da conversa
  }

  return [...porId.values()].sort(
    (a, b) =>
      new Date(a.eventAtUTC ?? 0).getTime() -
      new Date(b.eventAtUTC ?? 0).getTime()
  );
}

export interface UmblerSendResult {
  id?: string;
  [key: string]: unknown;
}

// POST /v1/messages/simplified/ — jeito mais simples de mandar mensagem.
// Cria o contato/chat automaticamente se ainda não existir. Um 200 aqui
// só significa que a Umbler aceitou a mensagem na fila — não garante
// entrega (isso a própria documentação deles deixa claro).
export async function sendMessageSimplified(params: {
  toPhone: string;
  message: string;
}) {
  const organizationId = requireOrganizationId();
  const fromPhone = process.env.UMBLER_FROM_PHONE;
  if (!fromPhone) {
    throw new Error("UMBLER_FROM_PHONE não configurado.");
  }

  return umblerFetch<UmblerSendResult>("/v1/messages/simplified/", {
    method: "POST",
    body: JSON.stringify({
      ToPhone: params.toPhone,
      FromPhone: fromPhone,
      OrganizationId: organizationId,
      Message: params.message,
    }),
  });
}

// POST /v1/messages/ — envio pra um chat já existente/aberto. Diferente do
// simplified, aceita `prefix`: o nome do atendente que o CLIENTE vê acima da
// mensagem (a "assinatura"). Precisa do chatId (o chat tem que estar aberto).
export async function sendMessage(params: {
  chatId: string;
  message: string;
  prefix?: string;
}) {
  const organizationId = requireOrganizationId();
  return umblerFetch<UmblerSendResult>("/v1/messages/", {
    method: "POST",
    body: JSON.stringify({
      ChatId: params.chatId,
      Message: params.message,
      OrganizationId: organizationId,
      ...(params.prefix ? { Prefix: params.prefix } : {}),
    }),
  });
}
