// GET /api/umbler/organizacoes
// Rota de diagnóstico: chama /v1/members/me/ do Umbler e devolve o resultado.
// Abra no navegador pra descobrir o seu OrganizationId (necessário na env
// UMBLER_ORGANIZATION_ID) e conferir se o token está válido.

import { getMe } from '@/lib/umbler';

export async function GET() {
  try {
    const resposta = await getMe();
    return Response.json({
      ok: true,
      dica: 'Procure o campo com o Id da organização e cole na variável UMBLER_ORGANIZATION_ID.',
      resposta,
    });
  } catch (err) {
    return Response.json({ ok: false, erro: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
