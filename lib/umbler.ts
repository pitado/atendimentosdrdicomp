// Cliente mínimo para a API do Umbler Talk.
// Docs: https://help.umbler.com/hc/pt-br/articles/21150267515149-Manual-da-API-do-Talk
// A API só está disponível no plano Enterprise do Umbler Talk.
//
// ATENÇÃO: os nomes exatos dos campos de resposta (contact.name, phoneNumber,
// message.content etc.) não estavam detalhados no manual público — são a
// melhor estimativa com base no que foi documentado. Quando o token chegar,
// confira os nomes reais no Swagger (https://app-utalk.umbler.com/api/) e
// ajuste as interfaces abaixo antes de confiar nos dados.

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

export interface UmblerChatMessage {
  id: string;
  eventAtUTC: string;
  content?: string;
  source?: "Member" | "Contact" | "Bot" | string;
}

export interface UmblerChat {
  id: string;
  contact?: {
    name?: string;
    phoneNumber?: string;
  };
  lastMessage?: UmblerChatMessage;
  organizationId?: string;
  open?: boolean;
}

// GET /v1/chats — lista de chats, com filtros/paginação.
// `organizationId` é obrigatório.
export async function listChats(params: {
  organizationId: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams({
    OrganizationId: params.organizationId,
    ...(params.page ? { Page: String(params.page) } : {}),
    ...(params.pageSize ? { PageSize: String(params.pageSize) } : {}),
  });
  return umblerFetch<{ items: UmblerChat[] }>(`/v1/chats?${qs.toString()}`);
}

// GET /v1/chats/{id}/ — um chat específico + últimas mensagens (até 100).
export async function getChat(chatId: string) {
  return umblerFetch<UmblerChat & { messages: UmblerChatMessage[] }>(
    `/v1/chats/${chatId}/`
  );
}
