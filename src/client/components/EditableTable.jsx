import React from 'react';

export function EditableTable({ data, tipo, onChangeData }) {
  if (!data || !data.pages || data.pages.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">✏️ Transcrição Extraída</div>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Nenhum dado extraído disponível.
        </div>
      </div>
    );
  }

  // --- RENDERIZADOR DE HOLERITE ---
  if (tipo === 'holerite') {
    const page = data.pages[0];
    const fields = page.fields || [];
    const bases = page.bases || [];

    const handleFieldChange = (index, fieldKey, val) => {
      const updatedFields = [...fields];
      updatedFields[index] = { ...updatedFields[index], [fieldKey]: val };

      const updatedPages = [...data.pages];
      updatedPages[0] = { ...page, fields: updatedFields };
      onChangeData({ ...data, pages: updatedPages });
    };

    const handleBaseChange = (index, fieldKey, val) => {
      const updatedBases = [...bases];
      updatedBases[index] = { ...updatedBases[index], [fieldKey]: val };

      const updatedPages = [...data.pages];
      updatedPages[0] = { ...page, bases: updatedBases };
      onChangeData({ ...data, pages: updatedPages });
    };

    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🧾 Revisor de Holerite (Payroll)</div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Competência: {page.month || 'MM'}/{page.year || 'YYYY'}
          </span>
        </div>

        <div className="table-container">
          <h4 style={{ marginBottom: '0.75rem', color: '#60a5fa' }}>Verbas e Vencimentos / Descontos</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Código</th>
                <th>Descrição / Verba</th>
                <th style={{ width: '100px' }}>Referência</th>
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
                        onChange={(e) => handleFieldChange(idx, 'code', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        className="input-cell"
                        value={item.label || ''} 
                        onChange={(e) => handleFieldChange(idx, 'label', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        className="input-cell"
                        value={item.reference || ''} 
                        onChange={(e) => handleFieldChange(idx, 'reference', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        className="input-cell"
                        value={item.value || ''} 
                        onChange={(e) => handleFieldChange(idx, 'value', e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h4 style={{ margin: '1.5rem 0 0.75rem 0', color: '#a78bfa' }}>Bases, Totais e Valor Líquido</h4>
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
                      onChange={(e) => handleBaseChange(idx, 'label', e.target.value)}
                      style={{ fontWeight: base.label?.toLowerCase().includes('líquido') ? 'bold' : 'normal' }}
                    />
                  </td>
                  <td>
                    <input 
                      className="input-cell"
                      value={base.value || ''} 
                      onChange={(e) => handleBaseChange(idx, 'value', e.target.value)}
                      style={{ fontWeight: base.label?.toLowerCase().includes('líquido') ? 'bold' : 'normal' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- RENDERIZADOR DE CARTÃO DE PONTO ---
  const page = data.pages[0];
  const days = page.days || [];

  const handlePunchChange = (dayIndex, punchIndex, val) => {
    const updatedDays = [...days];
    const day = { ...updatedDays[dayIndex] };
    const punches = [...day.punches];
    punches[punchIndex] = { ...punches[punchIndex], time_hhmm: val, time_raw: val };
    day.punches = punches;
    updatedDays[dayIndex] = day;

    const updatedPages = [...data.pages];
    updatedPages[0] = { ...page, days: updatedDays };
    onChangeData({ ...data, pages: updatedPages });
  };

  const handleDateChange = (dayIndex, val) => {
    const updatedDays = [...days];
    updatedDays[dayIndex] = { ...updatedDays[dayIndex], date_raw: val };

    const updatedPages = [...data.pages];
    updatedPages[0] = { ...page, days: updatedPages };
    onChangeData({ ...data, pages: updatedPages });
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">⏱️ Revisor de Cartão de Ponto</div>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {days.length} Dias Mapeados
        </span>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '120px' }}>Data</th>
              <th>Batidas de Ponto (Entradas / Saídas)</th>
              <th style={{ width: '140px' }}>Status / Alertas</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, dIdx) => {
              const punches = day.punches || [];
              const isOdd = punches.length % 2 !== 0;
              const hasUncertainty = day.date_raw?.includes('?') || punches.some(p => p.time_hhmm?.includes('?'));

              let rowClass = '';
              let alertText = '✅ OK';

              if (isOdd) {
                rowClass = 'row-danger';
                alertText = '⚠️ Batida Ímpar!';
              } else if (hasUncertainty) {
                rowClass = 'row-warning';
                alertText = '🔍 Incerteza (?)';
              }

              return (
                <tr key={`day-${dIdx}`} className={rowClass}>
                  <td>
                    <input 
                      className="input-cell"
                      value={day.date_raw || ''} 
                      onChange={(e) => handleDateChange(dIdx, e.target.value)}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {punches.map((punch, pIdx) => (
                        <div key={`p-${pIdx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: punch.kind === 'IN' ? '#34d399' : '#f87171' }}>
                            {punch.kind || (pIdx % 2 === 0 ? 'IN' : 'OUT')}:
                          </span>
                          <input 
                            className="input-cell"
                            style={{ width: '70px', textCenter: 'center' }}
                            value={punch.time_hhmm || punch.time_raw || ''} 
                            onChange={(e) => handlePunchChange(dIdx, pIdx, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{alertText}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
