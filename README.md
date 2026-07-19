# dicomp-cs-sync

Sincroniza os chats do Umbler Talk automaticamente e já deixa a descrição do
ticket pronta no formato usado em sis.dicomp.com.br, pra você só copiar e
colar.

## Como funciona

1. Uma rotina (cron) chama a API do Umbler periodicamente e busca chats novos.
2. Cada chat novo é salvo no Supabase e processado: extrai nome do contato,
   telefone e a mensagem mais longa dele (heurística de "demanda").
3. O dashboard (`/`) lista os tickets pendentes com um botão de copiar.

## Pré-requisitos

- Token da API do Umbler Talk (plano Enterprise) — ainda pendente de
  confirmar com a Dicomp.
- Conta na Vercel (deploy) e no Supabase (banco de dados) — grátis pro seu
  volume de uso.

## Passo a passo pra colocar no ar

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra o **SQL Editor** e rode o conteúdo de `supabase/schema.sql`.
3. Em **Project Settings > API**, copie a `Project URL` e a
   `service_role key` (não a `anon key` — essa fica só no servidor).

### 2. Vercel

1. Suba este projeto num repositório no GitHub.
2. Importe o repositório na Vercel ([vercel.com/new](https://vercel.com/new)).
3. Em **Settings > Environment Variables**, adicione:
   - `UMBLER_API_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (invente uma senha qualquer)
4. Deploy.

### 3. Cron — importante

O plano **Hobby da Vercel só permite cron 1x por dia**. O `vercel.json` já
vem configurado assim (`0 11 * * *`, ou seja, 11h UTC / 8h em Brasília),
então funciona sem custo, mas só roda uma vez ao dia.

Se quiser rodar com mais frequência (ex.: a cada 15 minutos) sem pagar o
plano Pro da Vercel ($20/mês), use o workflow gratuito do GitHub Actions que
já está em `.github/workflows/sync-chats.yml`:

1. No repositório do GitHub, vá em **Settings > Secrets and variables >
   Actions**.
2. Adicione os secrets:
   - `DEPLOY_URL` — a URL do seu projeto na Vercel (ex.:
     `https://dicomp-cs-sync.vercel.app`)
   - `CRON_SECRET` — a mesma senha que você colocou na Vercel
3. Pronto — o GitHub já chama a rota a cada 15 minutos de graça.

Se preferir manter só o cron da Vercel (1x por dia), pode remover a pasta
`.github/workflows`.

### 4. Testar

Depois do deploy, acesse a URL do projeto. Enquanto o token do Umbler não
chega, o dashboard vai mostrar "Nenhum ticket pendente" ou erro de token —
isso é esperado.

Pra testar a rota de sincronização manualmente (sem esperar o cron):

```
curl https://SEU-PROJETO.vercel.app/api/cron/sync-chats \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```

## Avisos importantes

- **Nomes de campos da API do Umbler**: o manual público não detalha o JSON
  exato de resposta. `lib/umbler.ts` tem a melhor estimativa com base na
  documentação — quando o token chegar, confira os nomes reais no Swagger
  (`https://app-utalk.umbler.com/api/`) e ajuste as interfaces se precisar.
- **Uso pessoal, sem login**: como só você usa, não tem tela de autenticação.
  Se um dia outras pessoas do time forem usar, isso precisa ser adicionado
  antes (Supabase Auth resolve isso bem).
- **Heurística de "demanda"**: pega a mensagem mais longa do contato como
  candidata. Não é perfeito — revise antes de copiar pro ticket, igual você
  já fazia na versão HTML.
