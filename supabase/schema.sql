-- Rode isso uma vez no SQL Editor do seu projeto Supabase.
-- Como o projeto é de uso pessoal (sem login/RLS multiusuário por enquanto),
-- mantemos as tabelas simples, sem Row Level Security.

create table if not exists chats_sincronizados (
  id text primary key,               -- id do chat no Umbler
  contato_nome text,
  contato_telefone text,
  ultima_mensagem_em timestamptz,
  bruto jsonb,                       -- resposta crua da API, pra debug/reprocessamento
  processado boolean default false,
  criado_em timestamptz default now()
);

create table if not exists tickets_gerados (
  id uuid primary key default gen_random_uuid(),
  chat_id text references chats_sincronizados(id),
  data text not null,
  cliente text,
  contato text,
  demanda text,
  descricao_final text not null,     -- texto pronto pra colar no sis.dicomp.com.br
  copiado boolean default false,     -- marca se ela já copiou/usou esse ticket
  criado_em timestamptz default now()
);

create index if not exists idx_tickets_gerados_chat_id on tickets_gerados(chat_id);
create index if not exists idx_chats_sincronizados_processado on chats_sincronizados(processado);
