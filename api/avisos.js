// Avisos de provas novas por e-mail.
//   POST /api/avisos                      inscrição (e-mail, cidade, raio, distâncias) + e-mail de confirmação
//   GET  /api/avisos?acao=confirmar&t=..  confirma a inscrição (link do e-mail)
//   GET  /api/avisos?acao=sair&t=..       descadastra (link em todo e-mail)
//   GET  /api/avisos?acao=enviar          resumo semanal (agendamento diário; cada pessoa recebe no máximo 1 por semana)
// Envio pelo Resend (resend.com). Sem RESEND_API_KEY, nada é enviado: a rotina só simula e informa.
const { centroCidade } = require('./extrair.js');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const SITE = () => (process.env.SITE_URL || 'https://mapmove.com.br').replace(/\/$/, '');
const NOME = () => process.env.SITE_NOME || 'Mapmove';
const DIST = { '5K': [3, 6.5], '10K': [7, 12.5], '21K': [15, 25], '42K': [30, 50] };

async function rpc(nome, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${nome}: ${r.status} ${j && j.message ? j.message : ''}`);
  return j;
}
async function ehAdmin(jwt) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataCurta = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };
function km(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

async function enviarEmail(para, assunto, html, sair) {
  const chave = process.env.RESEND_API_KEY, de = process.env.AVISOS_REMETENTE;
  if (!chave || !de) return { simulado: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: de, to: [para], subject: assunto, html, headers: sair ? { 'List-Unsubscribe': `<${sair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { enviado: true };
}

const molde = (titulo, corpo, sair) => `<!doctype html><html><body style="margin:0;background:#EDEEEA;font-family:Arial,Helvetica,sans-serif;color:#1E2124">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-size:26px;font-weight:700;letter-spacing:.5px;margin-bottom:16px">${esc(NOME())}</div>
<div style="background:#fff;border-radius:8px;padding:24px">
<h1 style="font-size:22px;margin:0 0 12px">${titulo}</h1>${corpo}</div>
<p style="font-size:12px;color:#5E6367;margin:16px 4px">Você recebe este e-mail porque se inscreveu nos avisos de corridas do ${esc(NOME())}.${sair ? ` <a href="${esc(sair)}" style="color:#5E6367">Não quero mais receber</a>.` : ''}</p>
</div></body></html>`;
const botao = (href, txt) => `<a href="${esc(href)}" style="display:inline-block;background:#FF4D00;color:#1E2124;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:6px">${esc(txt)}</a>`;

async function emailConfirmacao(email, token) {
  const ok = `${SITE()}/api/avisos?acao=confirmar&t=${token}`, sair = `${SITE()}/api/avisos?acao=sair&t=${token}`;
  return enviarEmail(email, `Confirme os avisos de corridas do ${NOME()}`,
    molde('Falta só confirmar', `<p style="line-height:1.5">Clique no botão para começar a receber, uma vez por semana, as corridas novas perto de você.</p><p>${botao(ok, 'Confirmar meu e-mail')}</p><p style="font-size:13px;color:#5E6367">Se não foi você que pediu, é só ignorar este e-mail.</p>`, sair), sair);
}

function pagina(res, status, titulo, texto) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} · ${esc(NOME())}</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#EDEEEA;font-family:Arial,Helvetica,sans-serif;color:#1E2124"><div style="max-width:520px;margin:12vh auto;padding:0 16px">
<div style="background:#fff;border-radius:8px;padding:28px"><h1 style="margin:0 0 10px;font-size:24px">${esc(titulo)}</h1><p style="line-height:1.5">${texto}</p>
<p><a href="${esc(SITE())}/" style="color:#C23A00;font-weight:700">Ver as próximas corridas</a></p></div></div></body></html>`);
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}

// resumo semanal: corridas publicadas desde o último envio, dentro do raio e das distâncias escolhidas
async function enviarResumos() {
  const token = process.env.ROBO_TOKEN;
  const inscritos = (await rpc('robo_avisos_para_enviar', { p_token: token })) || [];
  const r = { inscritos: inscritos.length, enviados: 0, sem_novidade: 0, simulados: 0, falhas: 0, confirmacoes: 0 };
  // reenvia confirmações que ficaram sem e-mail (ex.: falha do serviço na hora da inscrição)
  const semConf = (await rpc('robo_avisos_sem_confirmacao', { p_token: token })) || [];
  const confOk = [];
  for (const i of semConf) {
    try { const e = await emailConfirmacao(i.email, i.token); if (e.enviado) confOk.push(i.id); } catch { r.falhas++; }
  }
  if (confOk.length) { await rpc('robo_avisos_marcar', { p_token: token, p_ids: confOk, p_tipo: 'confirmacao' }); r.confirmacoes = confOk.length; }
  if (!inscritos.length) return r;
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const q = new URLSearchParams({ select: 'slug,nome,cidade,estado,data,lat,lng,criado_em,corrida_distancias(km,rotulo)', status: 'eq.publicado', data: `gte.${hoje}`, order: 'data.asc', limit: '2000' });
  const cr = await fetch(`${SUPABASE_URL}/rest/v1/corridas?${q}`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` } });
  const corridas = cr.ok ? await cr.json() : [];
  const feitos = [];
  for (const i of inscritos) {
    const lista = corridas.filter((c) => c.criado_em > i.desde && c.lat != null && i.lat != null && km(i.lat, i.lng, c.lat, c.lng) <= i.raio_km
      && (!i.distancias || !i.distancias.length || (c.corrida_distancias || []).some((d) => i.distancias.some((k) => DIST[k] && d.km != null && +d.km >= DIST[k][0] && +d.km <= DIST[k][1]))));
    if (!lista.length) { r.sem_novidade++; continue; }
    const sair = `${SITE()}/api/avisos?acao=sair&t=${i.token}`;
    const linhas = lista.slice(0, 15).map((c) => `<tr><td style="padding:10px 0;border-top:1px solid #E3E5E0;width:64px;font-weight:700;color:#C23A00;vertical-align:top">${dataCurta(c.data)}</td>
      <td style="padding:10px 0;border-top:1px solid #E3E5E0"><a href="${esc(`${SITE()}/corrida/${encodeURIComponent(c.slug)}`)}" style="color:#1E2124;font-weight:700;text-decoration:none">${esc(c.nome)}</a><br>
      <span style="font-size:13px;color:#5E6367">${esc(c.cidade)}${c.estado ? '/' + esc(c.estado) : ''} · ${Math.round(km(i.lat, i.lng, c.lat, c.lng))} km${(c.corrida_distancias || []).length ? ' · ' + esc(c.corrida_distancias.map((d) => d.rotulo).join(', ')) : ''}</span></td></tr>`).join('');
    const titulo = `${lista.length} corrida${lista.length > 1 ? 's' : ''} nova${lista.length > 1 ? 's' : ''} perto de ${esc(i.cidade || 'você')}`;
    const html = molde(titulo, `<table style="width:100%;border-collapse:collapse">${linhas}</table>${lista.length > 15 ? `<p style="font-size:13px;color:#5E6367">E mais ${lista.length - 15}.</p>` : ''}<p style="margin-top:18px">${botao(`${SITE()}/#mapa`, 'Ver todas no mapa')}</p>`, sair);
    try {
      const e = await enviarEmail(i.email, `${lista.length} corrida${lista.length > 1 ? 's' : ''} nova${lista.length > 1 ? 's' : ''} perto de você · ${NOME()}`, html, sair);
      if (e.simulado) r.simulados++; else { r.enviados++; feitos.push(i.id); }
    } catch { r.falhas++; }
  }
  if (feitos.length) await rpc('robo_avisos_marcar', { p_token: token, p_ids: feitos, p_tipo: 'resumo' });
  return r;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  try {
    // links dos e-mails
    if (q.acao === 'confirmar' || q.acao === 'sair') {
      const t = String(q.t || '');
      if (!/^[0-9a-f-]{36}$/i.test(t)) return pagina(res, 400, 'Link inválido', 'Este link não está completo. Abra de novo pelo e-mail.');
      const ok = await rpc(q.acao === 'confirmar' ? 'avisos_confirmar' : 'avisos_sair', { p_token: t });
      if (!ok) return pagina(res, 404, 'Inscrição não encontrada', 'Não achamos esta inscrição. Ela pode ter sido removida.');
      return q.acao === 'confirmar'
        ? pagina(res, 200, 'Tudo certo!', 'Seu e-mail está confirmado. Toda semana em que houver corrida nova perto de você, mandamos um resumo.')
        : pagina(res, 200, 'Pronto, você saiu da lista', 'Você não vai mais receber os avisos de corridas. Se mudar de ideia, é só se inscrever de novo no site.');
    }
    // resumo semanal (agendamento) ou disparo pelo admin
    if (q.acao === 'enviar') {
      const segredo = process.env.CRON_SECRET;
      const enviada = (req.headers.authorization || '').replace(/^Bearer /, '') || String(q.chave || '');
      const ok = (segredo && enviada === segredo) || (enviada.split('.').length === 3 && await ehAdmin(enviada));
      if (!ok) return res.status(401).json({ erro: 'não autorizado' });
      const token = process.env.ROBO_TOKEN;
      const logId = await rpc('robo_log_inicio', { p_token: token, p_rota: 'avisos', p_parametros: 'resumo semanal', p_origem: segredo && enviada === segredo ? 'agendado' : 'admin' }).catch(() => null);
      try {
        const r = await enviarResumos();
        r.servico_configurado = !!(process.env.RESEND_API_KEY && process.env.AVISOS_REMETENTE);
        if (logId) await rpc('robo_log_fim', { p_token: token, p_id: logId, p_ok: true, p_resultado: r, p_erro: null }).catch(() => null);
        return res.status(200).json(r);
      } catch (e) {
        if (logId) await rpc('robo_log_fim', { p_token: token, p_id: logId, p_ok: false, p_resultado: null, p_erro: e.message }).catch(() => null);
        return res.status(500).json({ erro: e.message });
      }
    }
    // inscrição pelo formulário do site
    if (req.method === 'POST') {
      const b = await lerCorpo(req);
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return res.status(400).json({ erro: 'Confira o e-mail.' });
      const cidade = String(b.cidade || '').trim().slice(0, 80);
      const uf = String(b.uf || 'SP').toUpperCase().slice(0, 2);
      let lat = Number(b.lat), lng = Number(b.lng);
      if (!(isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 34 && Math.abs(lng) <= 75)) { lat = null; lng = null; }
      if (lat == null && cidade) { const c = await centroCidade(cidade, uf); if (c) [lat, lng] = c; }
      if (lat == null) return res.status(400).json({ erro: 'Não encontramos essa cidade. Confira o nome ou escolha uma da lista.' });
      const dist = (Array.isArray(b.distancias) ? b.distancias : []).filter((d) => DIST[d]);
      const raio = [25, 50, 100, 200].includes(Number(b.raio)) ? Number(b.raio) : 50;
      const [ins] = (await rpc('robo_avisos_inscrever', { p_token: process.env.ROBO_TOKEN, p_email: email, p_cidade: cidade, p_lat: lat, p_lng: lng, p_raio: raio, p_dist: dist })) || [];
      if (!ins) throw new Error('inscrição não gravada');
      if (ins.confirmado) return res.status(200).json({ ok: true, ja_confirmado: true });
      let enviado = false;
      try { const e = await emailConfirmacao(email, ins.token); enviado = !!e.enviado; } catch { /* o resumo diário tenta de novo */ }
      if (enviado) await rpc('robo_avisos_marcar', { p_token: process.env.ROBO_TOKEN, p_ids: [ins.id], p_tipo: 'confirmacao' }).catch(() => null);
      return res.status(200).json({ ok: true, confirmacao_enviada: enviado });
    }
    return res.status(405).json({ erro: 'método não suportado' });
  } catch (e) {
    return res.status(500).json({ erro: 'Não deu para concluir agora. Tente de novo em alguns minutos.' });
  }
};
