const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const timingSafeEquals = async (a, b) => {
  if (!a || !b) return false;
  const left = new TextEncoder().encode(a); const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  return crypto.subtle.timingSafeEqual(left, right);
};
const parseJob = row => row && ({ id: row.id, tipo: row.tipo, status: row.status, progress: JSON.parse(row.progress_json), erro: row.erro, value: row.value_json ? JSON.parse(row.value_json) : null, createdAt: row.created_at, updatedAt: row.updated_at });

export default {
  async fetch(request, env) {
    if (!(await timingSafeEquals(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''), env.STATE_API_TOKEN))) return json({ erro: 'não autorizado' }, 401);
    try {
      const { action, ...data } = await request.json();
      const now = new Date().toISOString();
      if (action === 'create') {
        await env.DB.prepare('INSERT INTO transcription_jobs (id,tipo,status,progress_json,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(data.job.id, data.job.tipo, data.job.status, JSON.stringify(data.job.progress), now, now).run();
        return json({ job: data.job });
      }
      if (action === 'get') return json({ job: parseJob((await env.DB.prepare('SELECT * FROM transcription_jobs WHERE id=?').bind(data.id).first())) });
      if (action === 'save') {
        const job = data.job;
        await env.DB.prepare('UPDATE transcription_jobs SET status=?,progress_json=?,erro=?,value_json=?,updated_at=? WHERE id=?').bind(job.status, JSON.stringify(job.progress), job.erro, job.value ? JSON.stringify(job.value) : null, now, job.id).run();
        return json({ job });
      }
      if (action === 'page') {
        await env.DB.prepare(`INSERT INTO transcription_pages (job_id,page_number,status,attempts,value_json,completed_at,updated_at) VALUES (?,?, 'concluida', 1,?,?,?) ON CONFLICT(job_id,page_number) DO UPDATE SET status='concluida', attempts=transcription_pages.attempts+1, value_json=excluded.value_json, completed_at=excluded.completed_at, updated_at=excluded.updated_at`).bind(data.id, data.pageNumber, JSON.stringify(data.value), now, now).run();
        return json({ ok: true });
      }
      return json({ erro: 'ação inválida' }, 400);
    } catch (error) { console.error(JSON.stringify({ event: 'state_error', message: error.message })); return json({ erro: 'falha de persistência' }, 500); }
  }
};
