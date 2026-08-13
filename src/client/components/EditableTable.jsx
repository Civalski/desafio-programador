import React, { useState } from 'react';
import { isNonSequentialCompetency } from '../../utils/validationUtils.js';

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
    const verbaKeys = [];
    const baseKeys = [];

    pages.forEach((page) => {
      (page.fields || []).forEach((item) => {
        const label = (item.label || item.description || '').trim();
        if (label && !verbaKeys.includes(label)) {
          verbaKeys.push(label);
        }
      });
      (page.bases || []).forEach((base) => {
        const label = (base.label || base.description || '').trim();
        if (label && !baseKeys.includes(label)) {
          baseKeys.push(label);
        }
      });
    });

    // Atualizador no modo Grid
    const handleGridCellChange = (pageIdx, keyType, labelKey, val) => {
      const updatedPages = [...pages];
      const targetPage = { ...updatedPages[pageIdx] };

      if (keyType === 'field') {
        const fields = [...(targetPage.fields || [])];
        const fieldIdx = fields.findIndex(
          (f) => (f.label || f.description || '').trim() === labelKey
        );
        if (fieldIdx >= 0) {
          fields[fieldIdx] = { ...fields[fieldIdx], value: val };
        } else {
          fields.push({ label: labelKey, value: val });
        }
        targetPage.fields = fields;
      } else if (keyType === 'base') {
        const bases = [...(targetPage.bases || [])];
        const baseIdx = bases.findIndex(
          (b) => (b.label || b.description || '').trim() === labelKey
        );
        if (baseIdx >= 0) {
          bases[baseIdx] = { ...bases[baseIdx], value: val };
        } else {
          bases.push({ label: labelKey, value: val });
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
      fields[fieldIdx] = { ...fields[fieldIdx], [prop]: val };
      targetPage.fields = fields;
      updatedPages[pageIdx] = targetPage;
      onChangeData({ ...data, pages: updatedPages });
    };

    const handleListBaseChange = (pageIdx, baseIdx, prop, val) => {
      const updatedPages = [...pages];
      const targetPage = { ...updatedPages[pageIdx] };
      const bases = [...(targetPage.bases || [])];
      bases[baseIdx] = { ...bases[baseIdx], [prop]: val };
      targetPage.bases = bases;
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

        <div className="table-container">
          {viewMode === 'grid' ? (
            <div className="excel-grid-wrapper">
              <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontWeight: 500 }}>
                  Exibindo {pages.length} registro(s) em {verbaKeys.length + baseKeys.length} colunas
                </span>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <table className="data-table excel-grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px', minWidth: '60px', textAlign: 'center' }}>Pág.</th>
                      <th style={{ width: '120px', minWidth: '110px' }}>Competência</th>
                      {verbaKeys.map((key, i) => (
                        <th key={`vk-${i}`} style={{ minWidth: '150px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span className="header-badge verba">Verba</span>
                            <span title={key}>{key}</span>
                          </div>
                        </th>
                      ))}
                      {baseKeys.map((key, i) => (
                        <th key={`bk-${i}`} style={{ minWidth: '150px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span className="header-badge base">Base / Total</span>
                            <span title={key}>{key}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p, pIdx) => {
                      const comp = p.month && p.year ? `${p.month}/${p.year}` : (p.month || '');

                      const fieldMap = {};
                      (p.fields || []).forEach((f) => {
                        const lbl = (f.label || f.description || '').trim();
                        if (lbl) fieldMap[lbl] = f;
                      });

                      const baseMap = {};
                      (p.bases || []).forEach((b) => {
                        const lbl = (b.label || b.description || '').trim();
                        if (lbl) baseMap[lbl] = b;
                      });

                      const hasUncertainty =
                        (p.fields || []).some((f) => f.value?.includes('?') || f.label?.includes('?')) ||
                        (p.bases || []).some((b) => b.value?.includes('?') || b.label?.includes('?'));
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

                          {verbaKeys.map((key, vIdx) => {
                            const fieldItem = fieldMap[key];
                            const val = fieldItem?.value || '';
                            const isUncertain = val.includes('?');

                            return (
                              <td key={`vcell-${pIdx}-${vIdx}`} className={isUncertain ? 'row-warning' : ''}>
                                <input
                                  className="input-cell"
                                  value={val}
                                  onChange={(e) => handleGridCellChange(pIdx, 'field', key, e.target.value)}
                                  placeholder="-"
                                />
                              </td>
                            );
                          })}

                          {baseKeys.map((key, bIdx) => {
                            const baseItem = baseMap[key];
                            const val = baseItem?.value || '';
                            const isUncertain = val.includes('?');

                            return (
                              <td key={`bcell-${pIdx}-${bIdx}`} className={isUncertain ? 'row-warning' : ''}>
                                <input
                                  className="input-cell"
                                  value={val}
                                  onChange={(e) => handleGridCellChange(pIdx, 'base', key, e.target.value)}
                                  style={{ fontWeight: key.toLowerCase().includes('líquido') ? 600 : 400 }}
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
                        Página {page.page || pIdx + 1} — Competência: {page.month || 'MM'}/{page.year || 'YYYY'}
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
                          const isUncertain = item.value?.includes('?') || item.label?.includes('?');
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
