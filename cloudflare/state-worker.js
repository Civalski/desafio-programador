const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const timingSafeEquals = async (a, b) => {
  if (!a || !b) return false;
  const left = new TextEncoder().encode(a); const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  return crypto.subtle.timingSafeEqual(left, right);
};
const parseJob = row => row && ({ id: row.id, tipo: row.tipo, status: row.status, progress: JSON.parse(row.progress_json), erro: row.erro, value: row.value_json ? JSON.parse(row.value_json) : null, fileName: row.file_name || null, fileSize: row.file_size || null, fileKey: row.file_key || null, expiresAt: row.expires_at || null, retryCount: row.retry_count || 0, lastError: row.last_error || null, audit: row.audit_json ? JSON.parse(row.audit_json) : null, createdAt: row.created_at, updatedAt: row.updated_at });
const attachPersistedPages = async (db, job) => {
  if (!job || job.value || job.status !== 'concluido') return job;
  let { results } = await db.prepare("SELECT value_json FROM transcription_results WHERE job_id=? AND result_kind='final' ORDER BY page_number,result_key").bind(job.id).all();
  if (!results.length) ({ results } = await db.prepare('SELECT value_json FROM transcription_pages WHERE job_id=? ORDER BY page_number').bind(job.id).all());
  job.value = { pages: results.map(row => JSON.parse(row.value_json)), audit: job.audit || null };
  return job;
};

export default {
  async fetch(request, env) {
    if (!(await timingSafeEquals(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''), env.STATE_API_TOKEN))) return json({ erro: 'não autorizado' }, 401);
    try {
      const { action, ...data } = await request.json();
      const now = new Date().toISOString();
      if (action === 'create') {
        await env.DB.prepare('INSERT INTO transcription_jobs (id,tipo,status,progress_json,created_at,updated_at,file_name,file_size,file_key,expires_at,retry_count,last_error,audit_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(data.job.id, data.job.tipo, data.job.status, JSON.stringify(data.job.progress), now, now, data.job.fileName, data.job.fileSize, data.job.fileKey, data.job.expiresAt, 0, null, null).run();
        return json({ job: data.job });
      }
      if (action === 'get') return json({ job: await attachPersistedPages(env.DB, parseJob((await env.DB.prepare('SELECT * FROM transcription_jobs WHERE id=?').bind(data.id).first()))) });
      if (action === 'save') {
        const job = data.job;
        await env.DB.prepare('UPDATE transcription_jobs SET status=?,progress_json=?,erro=?,value_json=?,updated_at=?,retry_count=?,last_error=?,audit_json=? WHERE id=?').bind(job.status, JSON.stringify(job.progress), job.erro, job.value ? JSON.stringify(job.value) : null, now, job.retryCount || 0, job.lastError || null, job.audit ? JSON.stringify(job.audit) : null, job.id).run();
        return json({ job });
      }
      if (action === 'page') {
        await env.DB.prepare(`INSERT INTO transcription_pages (job_id,page_number,status,attempts,value_json,completed_at,updated_at) VALUES (?,?, 'concluida', 1,?,?,?) ON CONFLICT(job_id,page_number) DO UPDATE SET status='concluida', attempts=transcription_pages.attempts+1, value_json=excluded.value_json, completed_at=excluded.completed_at, updated_at=excluded.updated_at`).bind(data.id, data.pageNumber, JSON.stringify(data.value), now, now).run();
        return json({ ok: true });
      }
      if (action === 'result') {
        await env.DB.prepare(`INSERT INTO transcription_results (job_id,result_key,page_number,result_kind,attempts,value_json,completed_at,updated_at) VALUES (?,?,?,?,1,?,?,?) ON CONFLICT(job_id,result_key) DO UPDATE SET result_kind=excluded.result_kind,attempts=transcription_results.attempts+1,value_json=excluded.value_json,completed_at=excluded.completed_at,updated_at=excluded.updated_at`).bind(data.id,data.resultKey,data.pageNumber,data.resultKind,JSON.stringify(data.value),now,now).run();
        return json({ ok: true });
      }
      if (action === 'completed_results') { const { results } = await env.DB.prepare("SELECT result_key FROM transcription_results WHERE job_id=? AND result_kind='checkpoint'").bind(data.id).all(); return json({ keys: results.map(row => row.result_key) }); }
      if (action === 'checkpoint_results') { const { results } = await env.DB.prepare("SELECT value_json FROM transcription_results WHERE job_id=? AND result_kind='checkpoint' ORDER BY page_number,result_key").bind(data.id).all(); return json({ results: results.map(row => JSON.parse(row.value_json)) }); }
      if (action === 'final_results') {
        await env.DB.prepare("DELETE FROM transcription_results WHERE job_id=? AND result_kind='final'").bind(data.id).run();
        const statements = (data.pages || []).map((page,index) => env.DB.prepare("INSERT INTO transcription_results (job_id,result_key,page_number,result_kind,attempts,value_json,completed_at,updated_at) VALUES (?,?,?,'final',1,?,?,?)").bind(data.id,`final:${String(index).padStart(5,'0')}`,Number(page.page || index+1),JSON.stringify(page),now,now));
        if (statements.length) await env.DB.batch(statements);
        return json({ ok: true });
      }
      if (action === 'complete') {
        await env.DB.prepare('UPDATE transcription_jobs SET status=?,progress_json=?,erro=NULL,value_json=NULL,audit_json=?,updated_at=? WHERE id=?').bind('concluido', JSON.stringify(data.progress), data.audit ? JSON.stringify(data.audit) : null, now, data.id).run();
        return json({ ok: true });
      }
      if (action === 'completed_pages') { const { results } = await env.DB.prepare('SELECT page_number FROM transcription_pages WHERE job_id=?').bind(data.id).all(); return json({ pages: results.map(row => row.page_number) }); }
      if (action === 'list') { const { results } = await env.DB.prepare('SELECT * FROM transcription_jobs ORDER BY updated_at DESC').all(); return json({ jobs: results.map(parseJob) }); }
      if (action === 'file_put') { await env.DOCUMENTS.put(data.fileKey, Uint8Array.from(atob(data.content), char => char.charCodeAt(0)), { httpMetadata: { contentType: data.contentType }, customMetadata: { expiresAt: data.expiresAt } }); return json({ ok: true }); }
      if (action === 'file_get') { const object = await env.DOCUMENTS.get(data.fileKey); if (!object) return json({ erro: 'arquivo não encontrado' }, 404); const bytes = new Uint8Array(await object.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return json({ content: btoa(binary) }); }
      if (action === 'delete') { if (data.fileKey) await env.DOCUMENTS.delete(data.fileKey); await env.DB.prepare('DELETE FROM transcription_results WHERE job_id=?').bind(data.id).run(); await env.DB.prepare('DELETE FROM transcription_pages WHERE job_id=?').bind(data.id).run(); await env.DB.prepare('DELETE FROM transcription_jobs WHERE id=?').bind(data.id).run(); return json({ ok: true }); }
      return json({ erro: 'ação inválida' }, 400);
    } catch (error) { console.error(JSON.stringify({ event: 'state_error', message: error.message })); return json({ erro: 'falha de persistência' }, 500); }
  }
  ,async scheduled(_event, env) {
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare('SELECT id,file_key FROM transcription_jobs WHERE expires_at IS NOT NULL AND expires_at < ?').bind(now).all();
    for (const job of results) { if (job.file_key) await env.DOCUMENTS.delete(job.file_key); await env.DB.prepare('DELETE FROM transcription_results WHERE job_id=?').bind(job.id).run(); await env.DB.prepare('DELETE FROM transcription_pages WHERE job_id=?').bind(job.id).run(); await env.DB.prepare('DELETE FROM transcription_jobs WHERE id=?').bind(job.id).run(); }
  }
};
