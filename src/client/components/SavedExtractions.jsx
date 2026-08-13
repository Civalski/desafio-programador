import React, { useEffect, useState } from 'react';

const labels = { processando: 'Processando', concluido: 'Concluído', erro: 'Com erro' };
export function SavedExtractions({ onOpen, onResume, onBack }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = async () => { try { const response = await fetch('/api/transcricoes'); if (!response.ok) throw new Error('Não foi possível carregar as extrações salvas.'); const data = await response.json(); setItems(data.items || []); } catch (err) { setError(err.message); } };
  useEffect(() => { load(); }, []);
  const remove = async item => { if (!window.confirm(`Excluir “${item.fileName || item.id}”? Esta ação remove o PDF e os dados salvos.`)) return; const response = await fetch(`/api/transcricoes/${item.id}`, { method: 'DELETE' }); if (!response.ok) return setError('Não foi possível excluir a extração.'); load(); };
  return <section className="upload-card" style={{ maxWidth: '900px', margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}><div><h2>Extrações salvas</h2><p style={{ color: 'var(--text-muted)' }}>Documentos ficam disponíveis por 90 dias.</p></div><button className="btn-secondary" onClick={onBack}>Novo documento</button></div>
    {error && <p style={{ color: '#991b1b' }}>{error}</p>}
    {items.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Nenhuma extração salva.</p> : <div className="table-container"><table className="data-table"><thead><tr><th>Arquivo</th><th>Tipo</th><th>Status</th><th>Auditoria</th><th>Progresso</th><th>Atualizado</th><th></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.fileName || item.id}</td><td>Holerite</td><td>{labels[item.status] || item.status}</td><td>{item.audit?.status === 'ok' ? 'Sem alertas' : item.audit?.status === 'review_required' ? 'Revisão necessária' : '-'}</td><td>{item.progress?.current || 0}/{item.progress?.total || 0} ({item.progress?.percentage || 0}%)</td><td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : '-'}</td><td style={{ whiteSpace: 'nowrap' }}>{item.status === 'concluido' && <button className="btn-secondary" onClick={() => onOpen(item)}>Abrir</button>} {item.status !== 'concluido' && <button className="btn-success" onClick={() => onResume(item)}>Retomar</button>} <button className="btn-secondary" onClick={() => remove(item)}>Excluir</button></td></tr>)}</tbody></table></div>}
  </section>;
}
