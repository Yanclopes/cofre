// Teste de ponta a ponta no navegador real (modo local, sem AWS).
// Pré-requisitos: API rodando em AUTH_MODE=local servindo o build do front, e psql instalado.
//   cd e2e && npm install && npx playwright install chromium && node e2e.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const DB = process.env.DATABASE_URL ?? 'postgres://cofre:cofre@localhost:5432/cofre';
const sql = (q) => execSync(`psql "${DB}" -tAc "${q}"`).toString();
const EMAIL = `ana${Date.now()}@exemplo.com`;
const PW = 'cavalo correto bateria grampo 42';
const NEW_PW = 'nova frase mestra bem comprida 2026';
const SECRET = 'SenhaDoBanco#9876';
const shots = process.argv[2] ?? 'screenshots';
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(e.message));

const step = (s) => console.log('✓', s);

await page.goto(BASE);
await page.getByRole('button', { name: 'Criar conta' }).first().click();
await page.getByLabel('E-mail').fill(EMAIL);
await page.getByLabel('Senha mestra', { exact: true }).fill(PW);
await page.getByLabel('Confirme a senha mestra').fill(PW);
await page.screenshot({ path: `${shots}/01-cadastro.png` });
await page.locator('form').getByRole('button', { name: 'Criar conta' }).click();
await page.getByText('Seu kit de recuperação').waitFor({ timeout: 20000 });
const code = (await page.locator('pre.code').textContent()).trim();
await page.screenshot({ path: `${shots}/02-kit.png` });
step(`cadastro e kit (${code.slice(0, 9)}…)`);

await page.getByLabel('Guardei o código').check();
await page.getByRole('button', { name: 'Abrir o cofre' }).click();
await page.getByRole('button', { name: '+ Novo acesso' }).click();
await page.getByLabel('Nome').fill('Banco Exemplo');
await page.getByLabel('Endereço (URL)').fill('https://banco.exemplo');
await page.getByLabel('Usuário / e-mail').fill('ana.silva');
await page.getByLabel('Senha', { exact: true }).fill(SECRET);
await page.screenshot({ path: `${shots}/03-novo-acesso.png` });
await page.getByRole('button', { name: 'Salvar' }).click();
await page.getByText('Banco Exemplo').waitFor();

// segundo item com senha gerada
await page.getByRole('button', { name: '+ Novo acesso' }).click();
await page.getByLabel('Nome').fill('E-mail do trabalho');
await page.getByLabel('Usuário / e-mail').fill('ana@empresa.com');
await page.getByRole('button', { name: 'Gerar' }).click();
const generated = await page.getByLabel('Senha', { exact: true }).inputValue();
await page.getByRole('button', { name: 'Salvar' }).click();
await page.getByText('E-mail do trabalho').waitFor();
await page.getByRole('button', { name: 'Copiar senha' }).first().click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
await page.screenshot({ path: `${shots}/04-cofre.png` });
step(`itens salvos; senha gerada com ${generated.length} caracteres; cópia ok=${clip === SECRET}`);

// O banco só tem texto cifrado.
const dump = sql("select data from vault_items");
if (dump.includes(SECRET) || dump.includes('Banco Exemplo') || dump.includes(generated)) throw new Error('VAZOU texto puro no banco!');
const keysRow = sql("select protected_user_key from user_keys");
step(`banco só tem cifrado: ${dump.split('\n')[0].slice(0, 50)}…`);
if (keysRow.includes(PW)) throw new Error('senha mestra no banco');

// Bloquear e abrir de novo
await page.getByRole('button', { name: 'Bloquear' }).click();
await page.getByLabel('E-mail').fill(EMAIL);
await page.getByLabel('Senha mestra').fill(PW);
await page.getByRole('button', { name: 'Entrar e abrir o cofre' }).click();
await page.getByText('Banco Exemplo').waitFor({ timeout: 20000 });
step('bloquear e desbloquear com a senha mestra');

// Senha errada
await page.getByRole('button', { name: 'Bloquear' }).click();
await page.getByLabel('E-mail').fill(EMAIL);
await page.getByLabel('Senha mestra').fill('senha errada qualquer');
await page.getByRole('button', { name: 'Entrar e abrir o cofre' }).click();
await page.getByRole('alert').waitFor({ timeout: 20000 });
step(`senha errada recusada: "${await page.getByRole('alert').textContent()}"`);

// Esqueci a senha mestra -> redefine login -> pede kit
await page.getByRole('button', { name: 'Esqueci a senha' }).click();
await page.getByLabel('E-mail').fill(EMAIL);
await page.getByRole('button', { name: 'Continuar' }).click();
await page.getByLabel('Nova senha mestra', { exact: true }).fill(NEW_PW);
await page.getByLabel('Confirme a nova senha mestra').fill(NEW_PW);
await page.getByRole('button', { name: 'Redefinir' }).click();
await page.getByRole('button', { name: 'Ir para o login' }).click();
await page.getByLabel('E-mail').fill(EMAIL);
await page.getByLabel('Senha mestra').fill(NEW_PW);
await page.getByRole('button', { name: 'Entrar e abrir o cofre' }).click();
await page.getByText('Recuperar o cofre').waitFor({ timeout: 20000 });
await page.screenshot({ path: `${shots}/05-recuperar.png` });
step('nova senha de login NÃO abre o cofre sozinha: pede o kit');

await page.getByLabel('Código de recuperação').fill('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH-AAAA-BBBB-CCCC-DDDD-EEEE');
await page.getByRole('button', { name: 'Recuperar' }).click();
await page.getByRole('alert').waitFor();
step(`kit errado recusado: "${await page.getByRole('alert').textContent()}"`);

await page.getByLabel('Código de recuperação').fill(code.toLowerCase());
await page.getByRole('button', { name: 'Recuperar' }).click();
await page.getByText('Seu kit de recuperação').waitFor({ timeout: 20000 });
const code2 = (await page.locator('pre.code').textContent()).trim();
if (code2 === code) throw new Error('kit não foi trocado');
await page.getByLabel('Guardei o código').check();
await page.getByRole('button', { name: 'Abrir o cofre' }).click();
await page.getByText('Banco Exemplo').waitFor();
await page.getByRole('button', { name: 'Ver' }).first().click();
const shown = await page.locator('code.reveal').first().textContent();
step(`recuperado com o kit; item antigo decifrado ok=${shown === SECRET}; kit novo emitido`);

await page.getByRole('button', { name: 'Atividade' }).click();
await page.getByText('Cofre criado').waitFor();
await page.screenshot({ path: `${shots}/06-atividade.png` });
step('trilha de auditoria');

// Auditoria é somente inclusão
try {
  execSync(`psql "${DB}" -c "delete from audit_events"`, { stdio: 'pipe' });
  throw new Error('DELETE na auditoria deveria falhar');
} catch (e) {
  if (String(e.message).includes('deveria')) throw e;
  step('DELETE em audit_events bloqueado pelo banco');
}

await browser.close();
console.log(problems.length ? `PROBLEMAS NO CONSOLE:\n${problems.join('\n')}` : 'Sem erros no console (CSP ok)');
