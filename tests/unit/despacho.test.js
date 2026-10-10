/* Pruebas de despacho, fechas de entrega y formato CLP (web/js/data.js) — 7 pruebas
   Casos CP-U08 a CP-U11 del Plan de Pruebas. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cargar } = require("../helpers/cargar");

const { Befine } = cargar(["data.js"]);

// Misma forma que devuelve Befine.getCobertura() (datos reales del schema)
const cobertura = {
  envioGratisDesde: 7000,
  comunas: [
    { comuna: "Quilicura", costo: 0 },
    { comuna: "Huechuraba", costo: 2500 },
    { comuna: "Recoleta", costo: 2500 },
  ],
};

test("CP-U11 formato de pesos chilenos", () => {
  assert.equal(Befine.clp(2500), "$2.500");
  assert.equal(Befine.clp(1234567), "$1.234.567");
  assert.equal(Befine.clp(0), "$0");
});

test("CP-U08a Quilicura tiene despacho gratis con cualquier monto", () => {
  assert.equal(Befine.costoDespacho(cobertura, "Quilicura", 2500), 0);
});

test("CP-U08b comuna con tarifa paga despacho bajo el mínimo", () => {
  assert.equal(Befine.costoDespacho(cobertura, "Huechuraba", 5000), 2500);
  assert.equal(Befine.costoDespacho(cobertura, "Huechuraba", 6999), 2500);
});

test("CP-U08c envío gratis desde $7.000 (límite incluido)", () => {
  assert.equal(Befine.costoDespacho(cobertura, "Huechuraba", 7000), 0);
  assert.equal(Befine.costoDespacho(cobertura, "Recoleta", 12000), 0);
});

test("CP-U09 comuna sin cobertura devuelve null (no permite continuar)", () => {
  assert.equal(Befine.costoDespacho(cobertura, "Las Condes", 10000), null);
  assert.equal(Befine.costoDespacho(cobertura, "", 10000), null);
});

test("CP-U10a entrega estándar al siguiente día hábil", () => {
  assert.equal(Befine.isoFecha(Befine.diasEntrega(new Date(2026, 9, 9, 15)).estandar), "2026-10-12");  // viernes -> lunes
  assert.equal(Befine.isoFecha(Befine.diasEntrega(new Date(2026, 9, 6, 10)).estandar), "2026-10-07");  // martes -> miércoles
  assert.equal(Befine.isoFecha(Befine.diasEntrega(new Date(2026, 9, 10, 10)).estandar), "2026-10-12"); // sábado -> lunes
});

test("CP-U10b 20 fechas agendables, en orden, sin sábados ni domingos y sin repetir", () => {
  const { agendables } = Befine.diasEntrega(new Date(2026, 9, 9));
  const isos = Array.from(agendables, Befine.isoFecha);   // Array de Node (el original viene del contexto aislado)
  assert.equal(isos.length, 20);
  assert.ok(Array.from(agendables).every((d) => d.getDay() !== 0 && d.getDay() !== 6));
  assert.equal(new Set(isos).size, 20);
  assert.deepEqual([...isos].sort(), isos);
});
