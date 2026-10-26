// Pruebas de la lógica de cruce. Correr con: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../matcher.js');

const list = (rows, nameColumns, emailColumn) => ({ rows, nameColumns, emailColumn });

test('correo oculto de Meet: cada * es una letra en la parte local y el dominio solo cuenta lo visible', () => {
  const masked = M.parseEmail('ju.p*********@***.com');
  assert.equal(M.compareEmails(masked, M.parseEmail('ju.perezgomez@gmail.com')), 'compatible');
  // mismo inicio pero otro largo -> solo prefijo
  assert.equal(M.compareEmails(masked, M.parseEmail('ju.perez@gmail.com')), 'prefijo');
  // otro final de dominio
  assert.equal(M.compareEmails(masked, M.parseEmail('ju.perezgomez@empresa.co')), 'prefijo');
  assert.equal(M.compareEmails(M.parseEmail('Ana@X.com'), M.parseEmail('ana@x.com')), 'exacto');
  assert.equal(M.compareEmails(null, M.parseEmail('ana@x.com')), null);
});

test('nombres: ignora tildes, mayúsculas, orden y pequeños errores', () => {
  const n = M.compareNames(M.nameTokens('JOSÉ  Rodríguez, '), M.nameTokens('jose andres rodriguez'));
  assert.equal(n.matched, 2);
  assert.ok(n.strong);
  assert.ok(M.compareNames(M.nameTokens('Catalina Gomes'), M.nameTokens('Catalina Gómez')).strong);
  assert.ok(!M.compareNames(M.nameTokens('Carlos Ruiz'), M.nameTokens('Carlos Pardo')).strong);
});

test('clasifica en total, solo correo, solo nombre y sin coincidencia, emparejando una sola vez', () => {
  const meet = list(
    [
      ['Juan', 'Perez', 'ju.p*********@***.com'], // total: correo compatible + nombre
      ['Pepa', '', 'mp.d*******@***.com'], // solo correo
      ['Laura', 'Martinez', 'lmar*****@***.co'], // solo nombre (correo distinto)
      ['Cuenta', 'Sala', 'sala@empresa.com'], // sin coincidencia
      ['Juan', 'Perez', ''], // segunda conexión: Juan ya fue emparejado
    ],
    [0, 1],
    2
  );
  const seguimiento = list(
    [
      ['Juan Perez Gomez', 'ju.perezgomez@gmail.com'],
      ['Maria Pilar Diaz', 'mp.diaz1990@gmail.com'],
      ['Laura Martinez Rojas', 'lauram@gmail.com'],
      ['Pedro Gil', 'pgil@gmail.com'],
    ],
    [0],
    1
  );
  const r = M.matchLists(meet, seguimiento);
  assert.deepEqual(r.total.map((p) => [p.a.index, p.b.index]), [[0, 0]]);
  assert.deepEqual(r.parcial.map((p) => [p.type, p.a.index, p.b.index]), [['correo', 1, 1], ['nombre', 2, 2]]);
  assert.deepEqual(r.sinCoincidenciaA.map((p) => p.index), [3, 4]);
  assert.deepEqual(r.sinCoincidenciaB.map((p) => p.index), [3]);
});

test('al 100% exige correo Y nombre: con una sola palabra del nombre, o el correo igual y otro nombre, es parcial', () => {
  const meet = list([['German Rojas', 'vicg******@***.com'], ['Sala Juntas', 'ana@x.com']], [0], 1);
  const seg = list([['Victor Rojas', 'vicger3108@gmail.com'], ['Ana Ruiz', 'ana@x.com']], [0], 1);
  const r = M.matchLists(meet, seg);
  assert.equal(r.total.length, 0);
  assert.deepEqual(r.parcial.map((p) => p.type), ['correo', 'correo']);
});

test('modo "solo correo" y "solo nombre"', () => {
  const a = list([['Ana Ruiz', 'ana@x.com']], [0], 1);
  const b = list([['Otra Persona', 'ana@x.com'], ['Ana Ruiz', 'otra@x.com']], [0], 1);
  assert.equal(M.matchLists(a, b, 'correo').total[0].b.index, 0);
  assert.equal(M.matchLists(a, b, 'nombre').total[0].b.index, 1);
});

test('detecta el encabezado aunque haya filas de título antes y sugiere columnas', () => {
  const rows = [['REPORTE DE ASISTENCIA', '', ''], ['', '', ''], ['Nombre', 'Apellido', 'Correo electrónico', 'Duración']];
  const header = M.detectHeaderRow(rows);
  assert.equal(header, 2);
  assert.deepEqual(M.guessColumns(rows[header]), { nameColumns: [0, 1], emailColumn: 2 });
  assert.deepEqual(M.guessColumns(['Nombre de usuario', 'Email', 'Nombre completo']), { nameColumns: [2], emailColumn: 1 });
});
