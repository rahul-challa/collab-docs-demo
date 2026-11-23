// Browser end-to-end smoke test against a running server (uses your installed Chrome via playwright-core).
// Usage: npm run test:e2e   (or: node e2e/smoke.cjs <baseUrl>)
// Run against a fresh database: it asserts on exact list contents.
const { chromium } = require('playwright-core');
const path = require('path');
const assert = require('assert');

const BASE = process.argv[2] || 'http://localhost:3001';
const PROJECT = path.resolve(__dirname, '..');
const shots = path.join(PROJECT, 'docs', 'screenshots');
const TITLE = 'Launch Plan';
const step = (m) => console.log('✓', m);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const newUser = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    page.on('response', (r) => r.status() >= 400 && console.log('  [http]', name, r.status(), r.request().method(), r.url()));
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !/(404|409)/.test(m.text()) && errors.push(`${name} console: ${m.text()}`));
    await page.goto(BASE);
    return page;
  };
  const login = async (page, who) => {
    await page.getByRole('button', { name: new RegExp(who) }).click();
    await page.getByRole('heading', { name: 'Documents', exact: true }).waitFor();
  };
  const saved = (page) => page.getByText('All changes saved').waitFor({ timeout: 10000 });

  try {
    // ---- Alice: login, see seeded doc ----
    const alice = await newUser('alice');
    await page_shot(alice, '01-login.png');
    await login(alice, 'Alice');
    step('Alice logged in');

    // ---- create + rename + format ----
    await alice.getByRole('button', { name: '+ New document' }).click();
    await alice.locator('.tiptap').waitFor();
    const title = alice.getByLabel('Document title');
    await title.fill(TITLE);
    await title.press('Enter');
    const ed = alice.locator('.tiptap');
    await ed.click();
    await alice.getByLabel('Text style').selectOption('2');
    await alice.keyboard.type('Launch Plan Overview');
    await alice.keyboard.press('Enter');
    await alice.keyboard.type('This is ');
    await alice.getByRole('button', { name: 'Bold (Ctrl+B)' }).click();
    await alice.keyboard.type('important');
    await alice.getByRole('button', { name: 'Bold (Ctrl+B)' }).click();
    await alice.keyboard.type(' and ');
    await alice.getByRole('button', { name: 'Italic (Ctrl+I)' }).click();
    await alice.keyboard.type('subtle');
    await alice.getByRole('button', { name: 'Italic (Ctrl+I)' }).click();
    await alice.keyboard.type(' and ');
    await alice.getByRole('button', { name: 'Underline (Ctrl+U)' }).click();
    await alice.keyboard.type('underlined');
    await alice.getByRole('button', { name: 'Underline (Ctrl+U)' }).click();
    await alice.keyboard.press('Enter');
    await alice.getByRole('button', { name: 'Bulleted list' }).click();
    await alice.keyboard.type('First bullet');
    await alice.keyboard.press('Enter');
    await alice.keyboard.type('Second bullet');
    await alice.keyboard.press('Enter');
    await alice.keyboard.press('Enter');
    await alice.getByRole('button', { name: 'Numbered list' }).click();
    await alice.keyboard.type('Step one');
    await saved(alice);
    step('Created, renamed and formatted a document; autosave reports saved');
    await page_shot(alice, '03-editor.png');

    // ---- reload: persistence ----
    const docUrl = alice.url();
    await alice.reload();
    await alice.locator('.tiptap').waitFor();
    const html = await alice.locator('.tiptap').innerHTML();
    assert.equal(await alice.getByLabel('Document title').inputValue(), TITLE);
    for (const needle of ['<h2>Launch Plan Overview</h2>', '<strong>important</strong>', '<em>subtle</em>', '<u>underlined</u>', '<ul>', '<ol>'])
      assert.ok(html.includes(needle), `persisted html contains ${needle}: ${html}`);
    step('Reload preserves title and formatting (h2, bold, italic, underline, ul, ol)');

    // ---- share with Bob as viewer ----
    await alice.getByRole('button', { name: /^Share/ }).click();
    await alice.getByLabel('Email address').fill('bob@collabdocs.test');
    await alice.getByLabel('Access level').selectOption('viewer');
    await alice.getByRole('dialog').getByRole('button', { name: 'Share', exact: true }).click();
    await alice.getByText('Bob Collaborator').waitFor();
    await page_shot(alice, '04-share-dialog.png');
    // invalid email shows an error
    await alice.getByLabel('Email address').fill('nobody@collabdocs.test');
    await alice.getByRole('dialog').getByRole('button', { name: 'Share', exact: true }).click();
    await alice.getByText('No user with email nobody@collabdocs.test').waitFor();
    await alice.getByRole('button', { name: 'Done' }).click();
    step('Shared with Bob as viewer; unknown email shows validation error');

    // ---- import docx from list ----
    await alice.goto(BASE);
    await alice.locator('main input[type=file]').first().setInputFiles(path.join(PROJECT, 'samples', 'quarterly-review.docx'));
    await alice.locator('.tiptap').waitFor();
    const imported = await alice.locator('.tiptap').innerHTML();
    assert.equal(await alice.getByLabel('Document title').inputValue(), 'quarterly-review');
    assert.ok(imported.includes('<strong>Microsoft Word</strong>') && imported.includes('<li>'), imported);
    step('.docx import creates a new document with bold + list preserved');

    // ---- insert .md into the open doc ----
    await alice.locator('.tiptap').click();
    await alice.keyboard.press('Control+End');
    await alice.locator('.toolbar input[type=file]').setInputFiles(path.join(PROJECT, 'samples', 'project-brief.md'));
    await alice.getByText('Project Brief: Shared Docs Pilot').waitFor();
    await saved(alice);
    step('.md "Insert file" adds content into the open draft and saves');

    await alice.goto(BASE);
    await alice.getByText('Shared with 1').first().waitFor();
    await page_shot(alice, '02-document-list.png');

    // ---- Bob: sees shared doc, read-only ----
    const bob = await newUser('bob');
    await login(bob, 'Bob');
    const sharedSection = bob.locator('section', { hasText: 'Shared with me' });
    await sharedSection.getByText(TITLE).waitFor();
    await sharedSection.getByRole('link', { name: new RegExp(TITLE + ' View only') }).waitFor();
    assert.equal(await bob.locator('section', { hasText: 'My documents' }).getByText(TITLE).count(), 0);
    await page_shot(bob, '05-shared-with-me.png');
    await bob.goto(docUrl);
    await bob.locator('.tiptap').waitFor();
    assert.equal(await bob.locator('.tiptap').getAttribute('contenteditable'), 'false');
    assert.equal(await bob.locator('.toolbar').count(), 0);
    await bob.getByText('View only. Ask the owner').waitFor();
    await page_shot(bob, '06-view-only.png');
    step('Bob sees doc under "Shared with me" with View only badge; editor is read-only');

    // ---- Carol: no access ----
    const carol = await newUser('carol');
    await login(carol, 'Carol');
    await carol.goto(docUrl);
    await carol.getByText('does not exist or you do not have access').waitFor();
    step('Carol (not shared) gets a not-found message');

    // ---- upgrade Bob to editor, Bob edits, Alice's stale tab gets a conflict ----
    await alice.goto(docUrl);
    await alice.locator('.tiptap').waitFor();
    await alice.getByRole('button', { name: /^Share/ }).click();
    await alice.getByLabel('Access for Bob Collaborator').selectOption('editor');
    await alice.getByRole('button', { name: 'Done' }).click();
    await bob.goto(docUrl);
    await bob.locator('.toolbar').waitFor();
    await bob.locator('.tiptap').click();
    await bob.keyboard.press('Control+End');
    await bob.keyboard.type(' (Bob edit)');
    await saved(bob);
    step('Bob upgraded to editor and saves an edit');

    await alice.locator('.tiptap').click();
    await alice.keyboard.press('Control+End');
    await alice.keyboard.type(' stale edit');
    await alice.getByText('Someone else saved a newer version').waitFor({ timeout: 10000 });
    assert.equal(await alice.locator('.tiptap').getAttribute('contenteditable'), 'false', 'editing paused on conflict');
    await page_shot(alice, '07-conflict.png');
    await alice.getByRole('button', { name: 'Load latest version' }).click();
    await alice.getByText('(Bob edit)').waitFor();
    step('Alice\'s stale tab gets a conflict banner instead of overwriting; "Load latest" recovers');

    if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n'));
    console.log('\nALL E2E CHECKS PASSED');
  } catch (e) {
    console.error('E2E FAILED:', e.message);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }

  async function page_shot(page, name) {
    await page.screenshot({ path: path.join(shots, name) });
  }
})();
