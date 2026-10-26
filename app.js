/* Interfaz del cruce de listas: carga de archivos, configuración, resultados y descarga. */
(function () {
  'use strict';

  const TYPE_LABEL = {
    total: 'Coincidencia total',
    correo: 'Coincide el correo',
    nombre: 'Coincide el nombre',
    none: 'Sin coincidencia',
  };
  const FILL = { total: 'FFC6EFCE', correo: 'FFFFEB9C', nombre: 'FFFFEB9C', none: 'FFFFC7CE' };

  const state = { A: null, B: null, result: null, mode: 'ambos', tab: 'total' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cellText = (v) => (v instanceof Date ? v.toLocaleDateString('es-CO') : String(v ?? ''));

  // ---------- Carga de archivos ----------

  document.querySelectorAll('.list-card').forEach((card) => {
    const key = card.dataset.list;
    const drop = $('.drop', card);
    const input = $('input[type=file]', drop);

    input.addEventListener('change', () => input.files[0] && loadFile(key, input.files[0]));
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      if (e.dataTransfer.files[0]) loadFile(key, e.dataTransfer.files[0]);
    });
  });

  async function loadFile(key, file) {
    const card = document.querySelector(`.list-card[data-list="${key}"]`);
    const dropText = $('.drop-text', card);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      state[key] = { fileName: file.name, workbook };
      selectSheet(key, workbook.SheetNames[0]);
      $('.drop', card).classList.add('loaded');
      dropText.textContent = `✓ ${file.name}`;
    } catch (err) {
      console.error(err);
      state[key] = null;
      $('.drop', card).classList.remove('loaded');
      dropText.textContent = `No se pudo leer "${file.name}". ¿Es un Excel (.xlsx, .xls) o .csv?`;
      $('.config', card).hidden = true;
    }
    hideResults();
    updateCompareButton();
  }

  function selectSheet(key, sheetName) {
    const list = state[key];
    const ws = list.workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    // Quita filas vacías al final (Excel suele traer cientos)
    while (rows.length && rows[rows.length - 1].every((c) => String(c ?? '').trim() === '')) rows.pop();
    list.sheetName = sheetName;
    list.rows = rows;
    setHeaderRow(key, Matcher.detectHeaderRow(rows));
  }

  function setHeaderRow(key, headerRow) {
    const list = state[key];
    list.headerRow = headerRow;
    const width = Math.max(0, ...list.rows.map((r) => r.length));
    list.headers = Array.from({ length: width }, (_, i) => {
      const h = cellText(list.rows[headerRow]?.[i]).trim();
      return h || `Columna ${XLSX.utils.encode_col(i)}`;
    });
    Object.assign(list, Matcher.guessColumns(list.headers));
    renderConfig(key);
  }

  // ---------- Configuración de cada lista ----------

  function renderConfig(key) {
    const list = state[key];
    const card = document.querySelector(`.list-card[data-list="${key}"]`);
    const box = $('.config', card);
    const sheets = list.workbook.SheetNames;
    const headerOptions = list.rows.slice(0, 15).map((r, i) => {
      const preview = r.map(cellText).filter((c) => c.trim()).slice(0, 4).join(' | ');
      return `<option value="${i}" ${i === list.headerRow ? 'selected' : ''}>Fila ${i + 1}: ${esc(preview.slice(0, 60)) || '(vacía)'}</option>`;
    });
    const nameChecks = list.headers
      .map((h, i) => `<label><input type="checkbox" value="${i}" ${list.nameColumns.includes(i) ? 'checked' : ''}> ${esc(h)}</label>`)
      .join('');
    const emailOptions = ['<option value="">— Sin correo —</option>']
      .concat(list.headers.map((h, i) => `<option value="${i}" ${list.emailColumn === i ? 'selected' : ''}>${esc(h)}</option>`))
      .join('');

    box.innerHTML = `
      ${sheets.length > 1 ? `<label class="field">Hoja<select data-role="sheet">${sheets.map((s) => `<option ${s === list.sheetName ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      <label class="field">Fila de encabezados<select data-role="header">${headerOptions.join('')}</select></label>
      <div class="field"><span class="hint" style="margin:0">Columna(s) de nombre <small>(si el nombre y el apellido vienen separados, marca ambas)</small></span><div class="checks" data-role="names">${nameChecks}</div></div>
      <label class="field">Columna de correo<select data-role="email">${emailOptions}</select></label>
      <div class="preview" data-role="preview"></div>`;
    box.hidden = false;

    $('[data-role=sheet]', box)?.addEventListener('change', (e) => {
      selectSheet(key, e.target.value);
      hideResults();
      updateCompareButton();
    });
    $('[data-role=header]', box).addEventListener('change', (e) => {
      setHeaderRow(key, Number(e.target.value));
      hideResults();
      updateCompareButton();
    });
    $('[data-role=names]', box).addEventListener('change', () => {
      list.nameColumns = [...box.querySelectorAll('[data-role=names] input:checked')].map((i) => Number(i.value));
      renderPreview(key);
      hideResults();
      updateCompareButton();
    });
    $('[data-role=email]', box).addEventListener('change', (e) => {
      list.emailColumn = e.target.value === '' ? null : Number(e.target.value);
      renderPreview(key);
      hideResults();
      updateCompareButton();
    });
    renderPreview(key);
  }

  function renderPreview(key) {
    const list = state[key];
    const box = $(`.list-card[data-list="${key}"] [data-role=preview]`);
    const data = dataRows(list);
    const people = data.length;
    if (!list.nameColumns.length && list.emailColumn == null) {
      box.innerHTML = '<p class="warn">Elige al menos una columna de nombre o de correo.</p>';
      return;
    }
    const sample = data.slice(0, 3).map((r) => {
      const name = list.nameColumns.map((c) => cellText(r[c])).join(' ');
      const mail = list.emailColumn == null ? '' : cellText(r[list.emailColumn]);
      return `<tr><td>${esc(name)}</td><td>${esc(mail)}</td></tr>`;
    });
    box.innerHTML = `<p style="margin:0 0 4px">${people} fila${people === 1 ? '' : 's'} con datos. Ejemplo:</p><table>${sample.join('')}</table>`;
  }

  /** Filas después del encabezado (todas, para conservar el número de fila). */
  function dataRows(list) {
    return list.rows.slice(list.headerRow + 1);
  }

  function listReady(list) {
    return list && (list.nameColumns.length || list.emailColumn != null);
  }

  function updateCompareButton() {
    const ready = listReady(state.A) && listReady(state.B);
    $('#compare').disabled = !ready;
    $('#compare-hint').textContent = ready
      ? 'Listo para comparar.'
      : 'Sube las dos listas y elige en cada una la columna de nombre y/o de correo.';
  }

  // ---------- Comparación y resultados ----------

  document.querySelectorAll('input[name=mode]').forEach((r) =>
    r.addEventListener('change', (e) => {
      state.mode = e.target.value;
      hideResults();
    })
  );

  $('#compare').addEventListener('click', () => {
    const toInput = (list) => ({ rows: dataRows(list), nameColumns: list.nameColumns, emailColumn: list.emailColumn });
    state.result = Matcher.matchLists(toInput(state.A), toInput(state.B), state.mode);
    state.tab = 'total';
    renderSummary();
    $('#results').hidden = false;
    $('#list-view').hidden = true;
    $('#toggle-list').textContent = 'Ver lista aquí';
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function hideResults() {
    state.result = null;
    $('#results').hidden = true;
  }

  function renderSummary() {
    const r = state.result;
    $('#summary').innerHTML = `
      <div class="stat total"><b>${r.total.length}</b><span>Coincidencia total</span></div>
      <div class="stat parcial"><b>${r.parcial.length}</b><span>Coincidencia parcial</span></div>
      <div class="stat none"><b>${r.sinCoincidenciaA.length}</b><span>Lista 1 sin coincidencia</span></div>
      <div class="stat other"><b>${r.sinCoincidenciaB.length}</b><span>Lista 2 sin pareja</span></div>`;
  }

  $('#toggle-list').addEventListener('click', () => {
    const view = $('#list-view');
    view.hidden = !view.hidden;
    $('#toggle-list').textContent = view.hidden ? 'Ver lista aquí' : 'Ocultar lista';
    if (!view.hidden) renderTabs();
  });

  const TABS = [
    { id: 'total', label: 'Coincidencia al 100%', help: 'Coinciden el correo y el nombre: es la misma persona.' },
    { id: 'parcial', label: 'Coincidencia parcial', help: 'Solo coincide el correo o solo el nombre. Conviene revisarlas a mano.' },
    { id: 'sinA', label: 'Sin concordancia', help: 'Personas de la Lista 1 que no aparecen en la Lista 2.' },
    { id: 'sinB', label: 'Lista 2 sin pareja', help: 'Personas de la Lista 2 que no aparecen en la Lista 1.' },
  ];

  function renderTabs() {
    const r = state.result;
    const counts = { total: r.total.length, parcial: r.parcial.length, sinA: r.sinCoincidenciaA.length, sinB: r.sinCoincidenciaB.length };
    $('.tabs').innerHTML = TABS.map(
      (t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${state.tab === t.id}">${t.label} (${counts[t.id]})</button>`
    ).join('');
    document.querySelectorAll('.tab').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        renderTabs();
      })
    );
    $('#tab-help').textContent = TABS.find((t) => t.id === state.tab).help;
    renderTable();
  }

  function renderTable() {
    const r = state.result;
    const table = $('#result-table');
    const rowA = (p) => state.A.headerRow + 2 + p.index;
    const rowB = (p) => state.B.headerRow + 2 + p.index;
    let head;
    let body;
    if (state.tab === 'total' || state.tab === 'parcial') {
      const pairs = state.tab === 'total' ? r.total : r.parcial;
      head = '<tr><th>Resultado</th><th>Lista 1</th><th>Correo lista 1</th><th>Lista 2</th><th>Correo lista 2</th><th>Detalle</th></tr>';
      body = pairs.map(
        (p) => `<tr>
          <td><span class="tag ${p.type}">${TYPE_LABEL[p.type]}</span></td>
          <td>${esc(p.a.name)} <small class="hint">fila ${rowA(p.a)}</small></td><td class="mail">${esc(p.a.rawEmail)}</td>
          <td>${esc(p.b.name)} <small class="hint">fila ${rowB(p.b)}</small></td><td class="mail">${esc(p.b.rawEmail)}</td>
          <td>${esc(p.reason)}</td></tr>`
      );
    } else {
      const people = state.tab === 'sinA' ? r.sinCoincidenciaA : r.sinCoincidenciaB;
      const rowOf = state.tab === 'sinA' ? rowA : rowB;
      head = '<tr><th>Fila</th><th>Nombre</th><th>Correo</th></tr>';
      body = people.map((p) => `<tr><td>${rowOf(p)}</td><td>${esc(p.name)}</td><td class="mail">${esc(p.rawEmail)}</td></tr>`);
    }
    table.innerHTML = `<thead>${head}</thead><tbody>${body.join('') || '<tr><td colspan="6" class="empty">No hay personas en este grupo.</td></tr>'}</tbody>`;
  }

  // ---------- Descarga en Excel ----------

  $('#download').addEventListener('click', async () => {
    const btn = $('#download');
    btn.disabled = true;
    btn.textContent = 'Generando…';
    try {
      await downloadExcel();
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el Excel: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Descargar Excel';
    }
  });

  async function downloadExcel() {
    const r = state.result;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Cruce de listas - La Cocreadora';

    // Resumen
    const res = wb.addWorksheet('Resumen');
    res.columns = [{ width: 34 }, { width: 60 }];
    res.addRow(['Cruce de listas']).font = { bold: true, size: 14 };
    res.addRow(['Fecha', new Date().toLocaleString('es-CO')]);
    res.addRow(['Lista 1', `${state.A.fileName} (hoja ${state.A.sheetName})`]);
    res.addRow(['Lista 2', `${state.B.fileName} (hoja ${state.B.sheetName})`]);
    res.addRow(['Comparado por', { ambos: 'Correo y nombre', correo: 'Solo correo', nombre: 'Solo nombre' }[state.mode]]);
    res.addRow([]);
    [
      ['Coincidencia total', r.total.length, 'total'],
      ['Coincidencia parcial (solo correo o solo nombre)', r.parcial.length, 'correo'],
      ['Lista 1 sin coincidencia', r.sinCoincidenciaA.length, 'none'],
      ['Lista 2 sin pareja', r.sinCoincidenciaB.length, 'none'],
    ].forEach(([label, n, type]) => {
      const row = res.addRow([label, n]);
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[type] } };
    });

    // Parejas encontradas
    const pairsSheet = wb.addWorksheet('Coincidencias');
    pairsSheet.columns = [
      { header: 'Resultado', width: 22 },
      { header: 'Nombre (Lista 1)', width: 32 },
      { header: 'Correo (Lista 1)', width: 32 },
      { header: 'Fila Lista 1', width: 11 },
      { header: 'Nombre (Lista 2)', width: 32 },
      { header: 'Correo (Lista 2)', width: 32 },
      { header: 'Fila Lista 2', width: 11 },
      { header: 'Detalle', width: 50 },
    ];
    styleHeader(pairsSheet.getRow(1));
    r.pairs.forEach((p) => {
      const row = pairsSheet.addRow([
        TYPE_LABEL[p.type], p.a.name, p.a.rawEmail, state.A.headerRow + 2 + p.a.index,
        p.b.name, p.b.rawEmail, state.B.headerRow + 2 + p.b.index, p.reason,
      ]);
      paintRow(row, 8, p.type);
    });

    // Cada lista con su resultado al lado, coloreada fila por fila
    const byA = new Map(r.pairs.map((p) => [p.a.index, p]));
    const byB = new Map(r.pairs.map((p) => [p.b.index, p]));
    addListSheet(wb, 'Lista 1', state.A, (i) => byA.get(i), (p) => p.b, 'Lista 2', new Set(r.sinCoincidenciaA.map((x) => x.index)));
    addListSheet(wb, 'Lista 2', state.B, (i) => byB.get(i), (p) => p.a, 'Lista 1', new Set(r.sinCoincidenciaB.map((x) => x.index)));

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cruce_de_listas_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function addListSheet(wb, title, list, pairOf, otherOf, otherLabel, unmatched) {
    const ws = wb.addWorksheet(title);
    const extra = ['Resultado', `Coincide con (${otherLabel})`, `Correo en ${otherLabel}`, `Fila en ${otherLabel}`, 'Detalle'];
    const header = ws.addRow([...list.headers, ...extra]);
    styleHeader(header);
    const width = list.headers.length + extra.length;
    const otherList = otherLabel === 'Lista 1' ? state.A : state.B;

    dataRows(list).forEach((row, i) => {
      const values = list.headers.map((_, c) => (row[c] === '' ? null : row[c]));
      const pair = pairOf(i);
      let type = null;
      let tail = ['', '', '', '', ''];
      if (pair) {
        const other = otherOf(pair);
        type = pair.type;
        tail = [TYPE_LABEL[pair.type], other.name, other.rawEmail, otherList.headerRow + 2 + other.index, pair.reason];
      } else if (unmatched.has(i)) {
        type = 'none';
        tail = [TYPE_LABEL.none, '', '', '', ''];
      }
      const added = ws.addRow([...values, ...tail]);
      added.eachCell((cell) => {
        if (cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy';
      });
      if (type) paintRow(added, width, type);
    });

    ws.columns.forEach((col, i) => {
      col.width = i >= list.headers.length ? [20, 30, 32, 12, 46][i - list.headers.length] : Math.min(Math.max(String(list.headers[i]).length + 2, 12), 40);
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: width } };
  }

  function styleHeader(row) {
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEFF4' } };
    });
  }

  function paintRow(row, width, type) {
    for (let c = 1; c <= width; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[type] } };
    }
  }
})();
