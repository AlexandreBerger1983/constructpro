// Vérifie le lien entre une soumission et un chantier : le rattachement dans
// les deux sens, la création d'un projet depuis une soumission, et le fait
// qu'une soumission refusée n'entre pas dans le montant du chantier.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))
const lire = (cle) => page.evaluate(c => (JSON.parse(localStorage.getItem('cp-donnees-v1') || '{}')[c] ?? []), cle)

// ─── Une soumission d'exemple, sans chantier ─────────────────────────────────
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tbody tr').first().click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(800)

const numero = (await page.locator('#devis').textContent()).match(/SOM-\d{4}-\d+|DEV-\d{4}-\d+/)?.[0]
console.log('Soumission ouverte :', numero)

const selecteur = page.locator('select[aria-label="Projet rattaché à cette soumission"]')
if (await selecteur.count() === 0) throw new Error('aucun sélecteur de projet sur la soumission')
console.log('OK: la soumission propose de se rattacher à un chantier')

// Les projets du même client arrivent en tête de liste
const options = await selecteur.locator('option').allTextContents()
console.log('Chantiers proposés :', options.slice(0, 3))
if (options.length < 2) throw new Error('aucun chantier proposé')
if (!/Aucun chantier rattaché/.test(options[0]))
  throw new Error('la liste ne permet pas de ne rattacher aucun chantier')
console.log('OK: « aucun chantier » reste possible')

// ─── Rattacher à un chantier existant ────────────────────────────────────────
const valeur = await selecteur.locator('option').nth(1).getAttribute('value')
const libelle = (await selecteur.locator('option').nth(1).textContent()).trim()
await selecteur.selectOption(valeur)
await page.waitForTimeout(1000)

const soumissions = await lire('quotes')
const rattachee = soumissions.find(q => q.number === numero)
console.log(`Rattachée au projet ${rattachee.projectId} (${libelle})`)
if (!rattachee.projectId) throw new Error('le rattachement n’a pas été enregistré')
console.log('OK: le rattachement est enregistré sur la soumission')

if (await page.locator('a:has-text("Ouvrir le chantier")').count() === 0)
  throw new Error('aucun lien vers le chantier une fois rattaché')
console.log('OK: un lien mène au chantier')

// ─── Le chantier montre sa soumission ────────────────────────────────────────
await page.click('a:has-text("Ouvrir le chantier")')
await page.waitForTimeout(1400)
const surProjet = await page.textContent('body')
if (!/Soumissions de ce chantier/.test(surProjet))
  throw new Error('le chantier ne montre pas ses soumissions')
if (!surProjet.includes(numero))
  throw new Error('la soumission rattachée n’apparaît pas sur le chantier')
console.log('OK: le chantier liste la soumission, dans les deux sens')

// Le montant accepté est annoncé
if (!/Accepté/.test(surProjet)) throw new Error('le montant accepté n’est pas annoncé')
console.log('OK: le chantier annonce le montant accepté')

// ─── Une soumission refusée ne gonfle pas le chantier ────────────────────────
const montantAccepte = async () => {
  const bloc = await page.locator('h3:has-text("Soumissions de ce chantier")')
    .locator('xpath=../..').textContent()
  return num(bloc.match(/Accepté\s*:\s*([^A-Za-z]+)/)?.[1] ?? '0')
}
const avant = await montantAccepte()
console.log(`Montant accepté avant : ${avant} $`)

// On rattache une seconde soumission, puis on la marque refusée
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tbody tr').nth(1).click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(800)
const numero2 = (await page.locator('#devis').textContent()).match(/SOM-\d{4}-\d+|DEV-\d{4}-\d+/)?.[0]
await page.locator('select[aria-label="Projet rattaché à cette soumission"]').selectOption(valeur)
await page.waitForTimeout(900)
await page.evaluate(({ n }) => {
  const cle = 'cp-donnees-v1'
  const d = JSON.parse(localStorage.getItem(cle) || '{}')
  d.quotes = d.quotes.map(q => q.number === n ? { ...q, status: 'Refusée' } : q)
  localStorage.setItem(cle, JSON.stringify(d))
}, { n: numero2 })
await page.goto(base + '/projets')
await page.waitForTimeout(600)
await page.reload()
await page.waitForTimeout(1500)
await page.goto(base + `/projets/${rattachee.projectId}`)
await page.waitForTimeout(1500)

const corpsFinal = await page.textContent('body')
if (!corpsFinal.includes(numero2))
  throw new Error('la soumission refusée devrait rester listée, barrée')
const apres = await montantAccepte()
console.log(`Montant accepté après la refusée : ${apres} $`)
if (Math.abs(apres - avant) > 1)
  throw new Error(`une soumission refusée a changé le montant accepté : ${avant} → ${apres}`)
console.log('OK: la refusée reste visible mais n’entre pas dans le montant accepté')

// ─── Créer un chantier depuis une soumission ─────────────────────────────────
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tbody tr').nth(2).click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(800)
const numero3 = (await page.locator('#devis').textContent()).match(/SOM-\d{4}-\d+|DEV-\d{4}-\d+/)?.[0]
const totalSoumission = (await lire('quotes')).find(q => q.number === numero3).total

const projetsAvant = (await lire('projects')).length
const bouton = page.locator('button:has-text("Créer le chantier")')
if (await bouton.count() === 0) throw new Error('aucun bouton pour créer le chantier')
await bouton.click()
await page.waitForTimeout(1400)

const projets = await lire('projects')
if (projets.length !== projetsAvant + 1)
  throw new Error(`${projets.length - projetsAvant} chantiers créés au lieu d’un`)
const cree = projets.at(-1)
console.log(`Chantier créé : ${cree.code} — ${cree.name} — budget ${cree.budgetTotal} $`)
if (Math.abs(cree.budgetTotal - totalSoumission) > 0.5)
  throw new Error(`le budget (${cree.budgetTotal}) ne vient pas du total de la soumission (${totalSoumission})`)
if (!/PRJ-\d{4}-\d{3}/.test(cree.code)) throw new Error(`code de chantier inattendu : ${cree.code}`)
if (cree.budgetSpent !== 0) throw new Error('un chantier neuf ne doit rien avoir de dépensé')
if (!new RegExp(numero3).test(cree.description))
  throw new Error('le chantier ne cite pas la soumission dont il vient')
console.log('OK: le chantier reprend le budget, le code et cite sa soumission')

const soumissionLiee = (await lire('quotes')).find(q => q.number === numero3)
if (soumissionLiee.projectId !== cree.id)
  throw new Error('la soumission n’a pas été rattachée au chantier qu’elle vient de créer')
console.log('OK: la soumission est rattachée au chantier d’un seul geste')

// ─── Détacher ────────────────────────────────────────────────────────────────
await page.locator('select[aria-label="Projet rattaché à cette soumission"]').selectOption('')
await page.waitForTimeout(1000)
if ((await lire('quotes')).find(q => q.number === numero3).projectId !== null)
  throw new Error('le détachement n’a pas été enregistré')
if (await page.locator('button:has-text("Créer le chantier")').count() === 0)
  throw new Error('le bouton de création ne revient pas après détachement')
console.log('OK: on peut détacher une soumission de son chantier')

// ─── Le rattachement ne part pas chez le client ──────────────────────────────
const imprime = await page.evaluate(() => {
  const label = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Projet :')
  if (!label) return 'absent'
  for (let n = label; n && n !== document.body; n = n.parentElement) {
    if (n.classList?.contains('no-print')) return 'masqué'
  }
  return 'imprimé'
})
if (imprime === 'imprimé')
  throw new Error('le rattachement au chantier apparaîtrait sur le devis du client')
console.log(`OK: le rattachement reste interne (${imprime})`)

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Soumissions et chantiers reliés dans les deux sens')
await browser.close()
