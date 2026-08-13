import React, { useState } from 'react';
import { isNonSequentialCompetency } from '../../utils/validationUtils.js';
import { buildCanonicalColumnRegistry, canonicalizePayrollItem, payrollTypeLabel, selectCanonicalOccurrence } from '../../utils/payrollCanonical.js';

export function EditableTable({ data, onChangeData }) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' (Excel Planilha Grid) ou 'list' (Lista Detalhada)

  if (!data || !data.pages || data.pages.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Transcrição Extraída</div>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Nenhum dado extraído disponível.
        </div>
      </div>
    );
  }

  const pages = data.pages || [];

    // Mapear todas as verbas (fields) e bases únicas entre as páginas
    const { fields: verbaColumns, bases: baseColumns } = buildCanonicalColumnRegistry(pages);

    // Atualizador no modo Grid
    const handleGridCellChange = (pageIdx, keyType, column, val) => {
      const updatedPages = [...pages];
      const targetPage = { ...updatedPages[pageIdx] };

      if (keyType === 'field') {
        const fields = [...(targetPage.fields || [])];
        const fieldIdx = fields.findIndex((f) => canonicalizePayrollItem(f, 'field').canonicalKey === column.canonicalKey && Number(f.occurrence || 1) === column.occurrence);
        if (fieldIdx >= 0) {
          fields[fieldIdx] = { ...fields[fieldIdx], value: val };
        } else {
          const label = column.label.replace(/ \d+$/, '');
          fields.push({ code: column.code || '', label, originalLabel: label, canonicalKey: column.canonicalKey, occurrence: column.occurrence, value: val });
        }
        targetPage.fields = fields;
      } else if (keyType === 'base') {
        const bases = [...(targetPage.bases || [])];
        const baseIdx = bases.findIndex((b) => canonicalizePayrollItem(b, 'base').canonicalKey === column.canonicalKey && Number(b.occurrence || 1) === column.occurrence);
        if (baseIdx >= 0) {
          bases[baseIdx] = { ...bases[baseIdx], value: val };
        } else {
          const label = column.label.replace(/ \d+$/, '');
          bases.push({ label, originalLabel: label, canonicalKey: column.canonicalKey, occurrence: column.occurrence, value: val });
        }
        targetPage.bases = bases;
      } else if (keyType === 'competencia') {
        if (val.includes('/')) {
          const [m, y] = val.split('/');
          targetPage.month = m;
          targetPage.year = y;
        } else {
          targetPage.month = val;
        }
      }

      updatedPages[pageIdx] = targetPage;
      onChangeData({ ...data, pages: updatedPages });
    };

    // Atualizador no modo Lista
    const handleListFieldChange = (pageIdx, fieldIdx, prop, val) => {
      const updatedPages = [...pages];
      const targetPage = { ...updatedPages[pageIdx] };
      const fields = [...(targetPage.fields || [])];
      const updatedField = { ...fields[fieldIdx], [prop]: val };
      if (prop === 'label') {
        delete updatedField.canonicalKey;
        updatedField.originalLabel = val;
        updatedField.reviewRequired = false;
        fields[fieldIdx] = canonicalizePayrollItem(updatedField, 'field');
      } else fields[fieldIdx] = updatedField;
      targetPage.fields = fields;
      targetPage.reviewRequired = [...fields, ...(targetPage.bases || [])].some(item => item.reviewRequired || item.conflict || !item.canonicalKey);
      updatedPages[pageIdx] = targetPage;
      onChangeData({ ...data, pages: updatedPages });
    };

    const handleListBaseChange = (pageIdx, baseIdx, prop, val) => {
      const updatedPages = [...pages];
      const targetPage = { ...updatedPages[pageIdx] };
      const bases = [...(targetPage.bases || [])];
      const updatedBase = { ...bases[baseIdx], [prop]: val };
      if (prop === 'label') {
        delete updatedBase.canonicalKey;
        updatedBase.originalLabel = val;
        updatedBase.reviewRequired = false;
        bases[baseIdx] = canonicalizePayrollItem(updatedBase, 'base');
      } else bases[baseIdx] = updatedBase;
      targetPage.bases = bases;
      targetPage.reviewRequired = [...(targetPage.fields || []), ...bases].some(item => item.reviewRequired || item.conflict || !item.canonicalKey);
      updatedPages[pageIdx] = targetPage;
      onChangeData({ ...data, pages: updatedPages });
    };

  return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <span>Revisor de Holerite (Payroll)</span>
            <span className="badge-mock" style={{ marginLeft: '0.5rem', fontSize: '0.68rem' }}>
              Excel Grid View
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="segmented-control" style={{ margin: 0 }}>
              <button
                type="button"
                className={`radio-btn ${viewMode === 'grid' ? 'selected' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Visualização matricial estilo Planilha Excel"
              >
                Planilha (Excel)
              </button>
              <button
                type="button"
                className={`radio-btn ${viewMode === 'list' ? 'selected' : ''}`}
                onClick={() => setViewMode('list')}
                title="Visualização em Lista com Códigos e Referências"
              >
                Lista Detalhada
              </button>
            </div>
          </div>
        </div>

        {data.audit?.extractionMetrics && (
          <div className="audit-warning" role="alert" style={{ margin: '0 1rem 1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: '#fff3cd', color: '#664d03', fontSize: '0.8rem' }}>
            <strong>{data.audit.status === 'review_required' ? 'Revisão de cobertura necessária.' : 'Extração concluída.'}</strong>{' '}
            {data.audit.status === 'review_required' && (data.audit.warnings || []).slice(0, 3).join(' ')}
            {data.audit.status === 'review_required' && (data.audit.warnings || []).length > 3 ? ` (+${data.audit.warnings.length - 3} alertas)` : ''}
            {data.audit.extractionMetrics && (
              <span> Cobertura: {data.audit.extractionMetrics.extractedItems}/{data.audit.extractionMetrics.visibleItems ?? data.audit.extractionMetrics.expectedItems} itens ({Math.round((data.audit.extractionMetrics.coverage ?? 0) * 100)}%); {data.audit.extractionMetrics.deterministicItems ?? 0} identificados localmente; {data.audit.extractionMetrics.aiValidatedItems ?? 0} validados pela IA; {data.audit.extractionMetrics.aiRecoveredItems ?? 0} recuperados pela IA; {data.audit.extractionMetrics.pendingItems ?? 0} pendentes; {data.audit.extractionMetrics.executedPrompts === 0 ? 'resultado inválido: confirmação por IA ausente' : `${data.audit.extractionMetrics.executedPrompts} prompts de IA executados`}.</span>
            )}
          </div>
        )}

        <div className="table-container">
          {viewMode === 'grid' ? (
            <div className="excel-grid-wrapper">
              <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontWeight: 500 }}>
                  Exibindo {pages.length} registro(s) em {verbaColumns.length + baseColumns.length} colunas canônicas
                </span>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <table className="data-table excel-grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px', minWidth: '60px', textAlign: 'center' }}>Pág.</th>
                      <th style={{ width: '120px', minWidth: '110px' }}>Competência</th>
                      <th style={{ minWidth: '130px' }}>Tipo da folha</th>
                      {verbaColumns.map((column, i) => (
                        <th key={`vk-${i}`} style={{ minWidth: '150px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span className="header-badge verba">Verba</span>
                            <span title={column.label}>{column.code ? `${column.code} - ` : ''}{column.label}</span>
                          </div>
                        </th>
                      ))}
                      {baseColumns.map((column, i) => (
                        <th key={`bk-${i}`} style={{ minWidth: '150px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span className="header-badge base">Base / Total</span>
                            <span title={column.label}>{column.label}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p, pIdx) => {
                      const comp = p.month && p.year ? `${p.month}/${p.year}` : (p.month || '');

                      const hasUncertainty =
                        p.reviewRequired ||
                        (p.fields || []).some((f) => f.conflict || f.value?.includes('?') || f.label?.includes('?')) ||
                        (p.bases || []).some((b) => b.conflict || b.value?.includes('?') || b.label?.includes('?'));
                      const prior = pages.slice(0, pIdx).reverse().find(candidate => candidate.month && candidate.year);
                      const nonSequential = prior && isNonSequentialCompetency(prior, p);
                      const empty = !(p.fields || []).length && !(p.bases || []).length && !p.month && !p.year;

                      return (
                        <tr key={`p-row-${pIdx}`} className={nonSequential ? 'row-danger' : (hasUncertainty || empty ? 'row-warning' : '')}>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {p.page || pIdx + 1}
                          </td>
                          <td>
                            <input
                              className="input-cell"
                              value={comp}
                              onChange={(e) => handleGridCellChange(pIdx, 'competencia', null, e.target.value)}
                              style={{ textAlign: 'center', fontWeight: 500 }}
                            />
                          </td>

                          <td>{payrollTypeLabel(p.payrollType)}</td>

                          {verbaColumns.map((column, vIdx) => {
                            const fieldItem = selectCanonicalOccurrence(p.fields || [], column.canonicalKey, column.occurrence, 'field');
                            const val = fieldItem?.value || '';
                            const isUncertain = Boolean(fieldItem?.conflict) || val.includes('?');

                            return (
                              <td key={`vcell-${pIdx}-${vIdx}`} className={isUncertain ? 'row-warning' : ''}>
                                <input
                                  className="input-cell"
                                  value={val}
                                  onChange={(e) => handleGridCellChange(pIdx, 'field', column, e.target.value)}
                                  placeholder="-"
                                />
                              </td>
                            );
                          })}

                          {baseColumns.map((column, bIdx) => {
                            const baseItem = selectCanonicalOccurrence(p.bases || [], column.canonicalKey, column.occurrence, 'base');
                            const val = baseItem?.value || '';
                            const isUncertain = Boolean(baseItem?.conflict) || val.includes('?');

                            return (
                              <td key={`bcell-${pIdx}-${bIdx}`} className={isUncertain ? 'row-warning' : ''}>
                                <input
                                  className="input-cell"
                                  value={val}
                                  onChange={(e) => handleGridCellChange(pIdx, 'base', column, e.target.value)}
                                  style={{ fontWeight: column.label.toLowerCase().includes('líquido') ? 600 : 400 }}
                                  placeholder="-"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              {pages.map((page, pIdx) => {
                const fields = page.fields || [];
                const bases = page.bases || [];

                return (
                  <div key={`page-list-${pIdx}`} style={{ marginBottom: pages.length > 1 ? '2rem' : 0 }}>
                    {pages.length > 1 && (
                      <div style={{ padding: '0.5rem 0', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Página {page.page || pIdx + 1} — Competência: {page.month || 'MM'}/{page.year || 'YYYY'} — {payrollTypeLabel(page.payrollType)}
                      </div>
                    )}
                    <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Verbas e Vencimentos / Descontos
                    </h4>
                    <table className="data-table" style={{ marginBottom: '1.5rem' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>Código</th>
                          <th>Descrição / Verba</th>
                          <th style={{ width: '100px' }}>Ref.</th>
                          <th style={{ width: '120px' }}>Valor (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((item, idx) => {
                          const isUncertain = item.conflict || item.value?.includes('?') || item.label?.includes('?');
                          return (
                            <tr key={`field-${idx}`} className={isUncertain ? 'row-warning' : ''}>
                              <td>
                                <input 
                                  className="input-cell"
                                  value={item.code || ''} 
                                  onChange={(e) => handleListFieldChange(pIdx, idx, 'code', e.target.value)}
                                />
                              </td>
                              <td>
                                <input 
                                  className="input-cell"
                                  value={item.label || ''} 
                                  onChange={(e) => handleListFieldChange(pIdx, idx, 'label', e.target.value)}
                                />
                                {item.originalLabel && item.originalLabel !== item.label && (
                                  <small style={{ color: 'var(--text-subtle)' }}>Original: {item.originalLabel}</small>
                                )}
                              </td>
                              <td>
                                <input 
                                  className="input-cell"
                                  value={item.reference || ''} 
                                  onChange={(e) => handleListFieldChange(pIdx, idx, 'reference', e.target.value)}
                                />
                              </td>
                              <td>
                                <input 
                                  className="input-cell"
                                  value={item.value || ''} 
                                  onChange={(e) => handleListFieldChange(pIdx, idx, 'value', e.target.value)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <h4 style={{ margin: '1rem 0 0.75rem 0', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Bases, Totais e Valor Líquido
                    </h4>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Descrição da Base / Total</th>
                          <th style={{ width: '140px' }}>Valor (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bases.map((base, idx) => (
                          <tr key={`base-${idx}`}>
                            <td>
                              <input 
                                className="input-cell"
                                value={base.label || ''} 
                                onChange={(e) => handleListBaseChange(pIdx, idx, 'label', e.target.value)}
                                style={{ fontWeight: base.label?.toLowerCase().includes('líquido') ? 600 : 400 }}
                              />
                              {base.originalLabel && base.originalLabel !== base.label && (
                                <small style={{ color: 'var(--text-subtle)' }}>Original: {base.originalLabel}</small>
                              )}
                            </td>
                            <td>
                              <input 
                                className="input-cell"
                                value={base.value || ''} 
                                onChange={(e) => handleListBaseChange(pIdx, idx, 'value', e.target.value)}
                                style={{ fontWeight: base.label?.toLowerCase().includes('líquido') ? 600 : 400 }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );

}
