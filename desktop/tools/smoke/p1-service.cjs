// Real Wails bindings -> Go runtime -> SQLite smoke test. Only an isolated local server is allowed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const desktop = path.resolve(__dirname, '../..');
const origin = new URL(process.argv[2] || 'http://127.0.0.1:9246');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Smoke test only permits loopback origins');
const verifyOnly = process.argv.includes('--verify');
const clientID = crypto.randomUUID();
let runtime;

async function rpc(object, method, args) {
  const response = await fetch(new URL('/wails/runtime', origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wails-client-id': clientID, Origin: origin.origin },
    body: JSON.stringify({ object, method, args }), signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : undefined; } catch { result = text; }
  if (!response.ok) throw new Error(typeof result === 'object' ? result.message : String(result));
  return result;
}

async function binding(service, name, ...args) {
  const file = path.join(desktop, 'frontend/bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge', service + '.ts');
  const source = fs.readFileSync(file, 'utf8');
  const body = source.slice(source.indexOf(`export function ${name}(`));
  const match = body.match(/\$Call\.ByID\((\d+)/);
  if (!match) throw new Error(`Missing generated method ${service}.${name}`);
  return runtime.Call.ByID(Number(match[1]), ...args);
}

async function main() {
  runtime = await import(pathToFileURL(path.join(desktop, 'frontend/node_modules/@wailsio/runtime/dist/index.js')).href);
  runtime.setTransport({ call: (object, method, _window, args) => rpc(object, method, args) });
  const before = await binding('appservice', 'GetBootstrap');
  const expectedDirectory = path.join(desktop, '.task/p1-smoke/data');
  assert.equal(path.resolve(before.data_directory).toLowerCase(), expectedDirectory.toLowerCase(), 'refuse to modify non-smoke data');
  if (!verifyOnly) {
    const input = { theme_mode: 3, max_concurrent_notes: 2, output_directory: '', expected_revision: before.settings.revision };
    const saved = await binding('settingsservice', 'UpdateGeneral', input);
    assert.equal(saved.revision, before.settings.revision + 1);
    assert.ok(Number.isSafeInteger(saved.updated_at_ms) && saved.updated_at_ms > 1_000_000_000_000);
    await assert.rejects(binding('settingsservice', 'UpdateGeneral', input), /changed|reload/);
  }
  const after = await binding('appservice', 'GetBootstrap');
  assert.equal(after.settings.theme_mode, 3);
  assert.equal(after.settings.max_concurrent_notes, 2);
  const html = await (await fetch(origin, { signal: AbortSignal.timeout(10_000) })).text();
  assert.ok(html.includes('XHS Desktop'));
  console.log(JSON.stringify({ passed: true, verify_persisted_values: verifyOnly, schema_version: after.schema_version, revision: after.settings.revision, updated_at_ms: after.settings.updated_at_ms }, null, 2));
  await runtime.Application.Quit(); // Real npm runtime -> Wails service shutdown, not process kill.
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
