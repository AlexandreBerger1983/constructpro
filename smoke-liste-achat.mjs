// Vérifie la liste d'achat d'une soumission acceptée.
//
// Deux points commandent tout :
//   • elle n'apparaît QU'UNE FOIS la soumission acceptée. Commander sur une
//     offre en attente est la meilleure façon de payer du matériel pour un
//     chantier qui ne se fera pas ;
//   • son budget est exactement la part matériaux du devis. S'ils divergeaient,
//     on commanderait pour un montant que le client n'a pas accepté.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))
const lire = (cle) => page.evaluate(c => (JSON.parse(localStorage.getItem('cp-donnees-v1') || '{}')[c] ?? []), cle)

// ─── Un devis avec des matériaux ET de la main-d'œuvre seule ────────────────
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Nouveau devis', { timeout: 8000 })
await page.click('text=Nouveau devis')
await page.waitForSelector('text=Pour qui est ce devis ?', { timeout: 5000 })
await page.click('text=Nouveau client')
await page.fill('input[placeholder="ex: Jean Tremblay"]', 'Client Liste Achat')
await page.locator('button[aria-pressed]').filter({ hasText: 'Peinture' }).first().click()
await page.click('text=Continuer')
await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 5000 })
await page.locator('button:has-text("Salon")').last().click()
await page.waitForSelector('text=Surface de plancher', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 5000 })

// De la peinture (des matériaux) et de la démolition (main-d'œuvre seule)
await page.locator('button').filter({ has: page.locator('p:text-is("Peinture")') }).first().click()
await page.waitForTimeout(400)
await page.click('text=Peinture murs — 2 couches (apprêt + finition)')
await page.waitForTimeout(500)
await page.locator('button').filter({ has: page.locator('p:text-is("Démolition")') }).first().click()
await page.waitForTimeout(400)
await page.click('text=Démolition — cloisons intérieures')
await page.waitForTimeout(500)

await page.click('text=Continuer')
await page.waitForSelector('button:has-text("Enregistrer")', { timeout: 8000 })
await page.click('button:has-text("Enregistrer")')
await page.waitForSelector('text=Devis enregistré', { timeout: 8000 })
await page.waitForTimeout(2400)

const devis = (await page.evaluate(() =>
  JSON.parse(localStorage.getItem('cp-devis-enregistres') || '[]'))).at(-1)
console.log(`Devis ${devis.number} : ${devis.items.length} lignes`)

// La part matériaux attendue, calculée depuis le devis lui-même
const attendu = devis.items.reduce((s, it) => {
  const q = parseFloat(it.qty) || 0
  return s + q * (parseFloat(it.unitMat) || 0)
}, 0)
console.log(`Part matériaux du devis : ${attendu.toFixed(2)} $`)
if (attendu <= 0) throw new Error('le devis d’essai n’a aucune part matériaux')

// ─── Avant acceptation : AUCUNE liste d'achat ───────────────────────────────
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tr', { hasText: devis.number }).first().click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(900)

const statut = await page.locator('.badge').first().textContent()
console.log('Statut au départ :', statut.trim())
if (/Liste d'achat/.test(await page.textContent('body')))
  throw new Error('la liste d’achat ne doit pas apparaître avant l’acceptation')
console.log('OK: rien à acheter tant que la soumission n’est pas acceptée')

// ─── Une fois acceptée, la liste apparaît ───────────────────────────────────
await page.click('button:has-text("Marquer acceptée")')
await page.waitForTimeout(1200)

const corps = await page.textContent('body')
if (!/Liste d'achat/.test(corps)) throw new Error('la liste d’achat n’apparaît pas après acceptation')
console.log('OK: la liste d’achat apparaît dès que la soumission est acceptée')

const budgetAffiche = num((await page.locator('text=/Liste d\'achat — budget matériaux/').first().textContent()))
console.log(`Budget annoncé : ${budgetAffiche} $`)
// Affiché en mode compact (« 1 k$ ») au-delà de 1 000 $ : on compare donc avec
// la tolérance de l'arrondi d'affichage.
const tolerance = attendu >= 1000 ? 50 : 1
if (Math.abs(budgetAffiche - attendu) > tolerance)
  throw new Error(`le budget annoncé (${budgetAffiche}) n’est pas la part matériaux du devis (${attendu.toFixed(2)})`)
console.log('OK: le budget annoncé est exactement la part matériaux du devis')

// ─── Le détail ───────────────────────────────────────────────────────────────
await page.locator('button').filter({ hasText: /Liste d'achat — budget matériaux/ }).first().click()
await page.waitForTimeout(700)

// On lit la liste elle-même (#liste-achat) et pas la page : le devis imprimé
// qui suit mentionne légitimement la démolition, et un simple découpage du
// texte de la page faisait croire à une fuite.
const detail = await page.textContent('#liste-achat')
if (!/Peinture/.test(detail)) throw new Error('la catégorie Peinture devrait être listée')
// La démolition est de la main-d'œuvre seule : rien à y acheter
if (/Démolition/.test(detail))
  throw new Error('une ligne de main-d’œuvre seule ne doit pas figurer dans la liste d’achat')
if (!/main-d'œuvre seule ne sont pas listées/.test(detail))
  throw new Error('les lignes de main-d’œuvre seule devraient être comptées à part, pas passées sous silence')
console.log('OK: les lignes de main-d’œuvre seule sont écartées, et c’est dit')

if (!/la conversion reste au métier/.test(detail))
  throw new Error('la liste devrait dire qu’elle ne donne pas un nombre de feuilles')
console.log('OK: elle annonce ce qu’elle est — des quantités et un budget, pas une nomenclature')

// La somme des catégories annoncées fait bien le budget total
{
  const montants = (await page.locator('#liste-achat .bg-slate-50 .font-bold').allTextContents())
    .map(num).filter(Number.isFinite)
  const somme = montants.reduce((s, v) => s + v, 0)
  console.log(`Catégories : ${montants.length}, somme ${somme.toFixed(2)} $`)
  if (Math.abs(somme - attendu) > 1)
    throw new Error(`la somme des catégories (${somme}) n’est pas le budget (${attendu.toFixed(2)})`)
  console.log('OK: la somme des catégories est bien le budget total')
}

// ─── La liste ne part PAS chez le client ────────────────────────────────────
const imprime = await page.evaluate(() => {
  const el = [...document.querySelectorAll('span')]
    .find(s => /Liste d'achat — budget matériaux/.test(s.textContent))
  if (!el) return 'absent'
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.classList?.contains('no-print')) return 'masqué'
  }
  return 'imprimé'
})
if (imprime === 'imprimé')
  throw new Error('la liste d’achat apparaîtrait sur le devis envoyé au client')
console.log(`OK: la liste reste interne (${imprime})`)

// ─── Budget contre réel, une fois le chantier rattaché ──────────────────────
await page.click('button:has-text("Créer le chantier")')
await page.waitForTimeout(1300)
const projet = (await lire('projects')).at(-1)
console.log(`Chantier créé : ${projet.code}`)

// On inscrit une consommation sur ce chantier
await page.goto(base + '/materiaux')
await page.waitForSelector('table', { timeout: 10000 })
await page.evaluate(({ pid }) => {
  const cle = 'cp-donnees-v1'
  const d = JSON.parse(localStorage.getItem(cle) || '{}')
  d.materials = [{ id: 9100, name: 'Peinture d’essai', category: 'Peinture', unit: 'gallon',
    stock: 20, minStock: 0, unitCost: 48, coutMoyen: 48, supplier: 'B', location: 'E',
    prixMaj: new Date().toISOString().slice(0, 10), prixHistorique: [] }]
  d.mouvements = [{
    id: 90001, type: 'consommation', materialId: 9100, qty: -4, prixUnitaire: 48,
    projectId: pid, note: 'essai', fournisseur: '', par: '',
    date: new Date().toISOString().slice(0, 10),
  }]
  localStorage.setItem(cle, JSON.stringify(d))
}, { pid: projet.id })
await page.reload()
await page.waitForTimeout(1500)

await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tr', { hasText: devis.number }).first().click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(900)
await page.locator('button').filter({ hasText: /Liste d'achat — budget matériaux/ }).first().click()
await page.waitForTimeout(700)

const avecEcart = await page.textContent('body')
if (!new RegExp(`Consommé sur ${projet.code}`).test(avecEcart))
  throw new Error('l’écart budget / consommé n’apparaît pas')
if (!/Sorti du stock \(1 mouvement\(s\)\)/.test(avecEcart))
  throw new Error('le nombre de mouvements comptés n’est pas annoncé')
if (!/192/.test(avecEcart)) throw new Error('la consommation devrait valoir 4 × 48 = 192 $')
console.log('OK: l’écart compare le budget au réel (192 $ consommés)')
if (!/encore en entrepôt n'y est pas/.test(avecEcart))
  throw new Error('il faut dire que le matériel acheté mais non sorti n’est pas compté')
console.log('OK: et il dit ce qu’il ne compte pas')

// ─── Une soumission sans devis derrière le dit ──────────────────────────────
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
{
  // Une soumission d'exemple, acceptée, sans devis d'estimateur
  const autre = (await lire('quotes')).find(q => q.number !== devis.number)
  await page.evaluate(({ id }) => {
    const cle = 'cp-donnees-v1'
    const d = JSON.parse(localStorage.getItem(cle) || '{}')
    d.quotes = d.quotes.map(q => (q.id === id ? { ...q, status: 'Acceptée' } : q))
    localStorage.setItem(cle, JSON.stringify(d))
  }, { id: autre.id })
  await page.goto(base + `/soumissions/${autre.id}`)
  await page.waitForTimeout(1500)
  const sansDevis = await page.textContent('body')
  if (!/n'a pas de devis d'estimateur derrière elle/.test(sansDevis))
    throw new Error('une soumission sans devis devrait l’expliquer au lieu d’inventer une liste')
  console.log('OK: sans devis derrière, la liste explique pourquoi plutôt que d’inventer')
}

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ La liste d’achat suit l’acceptation et le budget du devis')
await browser.close()
