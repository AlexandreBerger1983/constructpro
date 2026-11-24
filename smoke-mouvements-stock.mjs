// Vérifie le journal des mouvements de stock.
//
// Ce qui est réellement en jeu : un prix figé doit rester figé. Un chantier de
// mars doit continuer à coûter le prix de mars, même si le matériau a doublé
// depuis. C'est tout l'intérêt d'inscrire les mouvements plutôt que de laisser
// un nombre monter et descendre sans trace.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))
const lire = (cle) => page.evaluate(c => (JSON.parse(localStorage.getItem('cp-donnees-v1') || '{}')[c] ?? []), cle)

// ─── Un article propre, à un prix connu ──────────────────────────────────────
await page.goto(base + '/materiaux')
await page.waitForSelector('table', { timeout: 10000 })
await page.evaluate(() => {
  const cle = 'cp-donnees-v1'
  const d = JSON.parse(localStorage.getItem(cle) || '{}')
  d.materials = [{
    id: 9001, name: 'Feuille d’essai', category: 'Cloisons', unit: 'feuille',
    stock: 10, minStock: 2, unitCost: 18, coutMoyen: 18, supplier: 'Fournisseur A',
    location: 'Entrepôt', prixMaj: new Date().toISOString().slice(0, 10),
    prixHistorique: [{ date: new Date().toISOString().slice(0, 10), prix: 18 }],
  }]
  d.mouvements = []
  localStorage.setItem(cle, JSON.stringify(d))
})
await page.reload()
await page.waitForTimeout(1600)

const ligne = page.locator('table tbody tr', { hasText: 'Feuille d’essai' }).first()
const lireStock = async () => num(await ligne.locator('td').nth(5).locator('span').first().textContent())
const lireCoutMoyen = async () => num(await ligne.locator('td').nth(4).locator('p').first().textContent())
const lireValeur = async () => num(await ligne.locator('td').nth(6).textContent())

console.log(`Départ : stock ${await lireStock()}, coût moyen ${await lireCoutMoyen()} $`)

const ouvrirMouvement = async () => {
  await ligne.locator('button:has-text("Mouvement")').click()
  await page.waitForSelector('text=Nature du mouvement', { timeout: 5000 })
  await page.waitForTimeout(300)
}
const choisirType = async (label) => {
  await page.locator('.fixed button[aria-pressed]').filter({ hasText: new RegExp(`^${label}$`) }).first().click()
  await page.waitForTimeout(300)
}
const enregistrer = async () => {
  await page.click('button:has-text("Enregistrer le mouvement")')
  await page.waitForTimeout(800)
}

// ─── Un achat à 24 $ fait monter le coût moyen à 21 $ ────────────────────────
await ouvrirMouvement()
await choisirType('Achat')
await page.locator('.fixed input[aria-label="Quantité reçue"]').fill('10')
await page.locator('.fixed input[aria-label="Prix payé"]').fill('24')
await page.waitForTimeout(500)

// L'aperçu doit annoncer l'effet AVANT d'enregistrer
const apercu = await page.locator('form').first().textContent()
if (!/10\s*→\s*20/.test(apercu.replace(/\s+/g, ' ')))
  throw new Error('l’aperçu n’annonce pas le stock résultant')
if (!/21,00/.test(apercu))
  throw new Error(`l’aperçu n’annonce pas le coût moyen de 21,00 $ : ${apercu.slice(-300)}`)
console.log('OK: l’aperçu annonce le stock et le coût moyen résultants')

await enregistrer()
if (await lireStock() !== 20) throw new Error(`stock ${await lireStock()} au lieu de 20`)
if (await lireCoutMoyen() !== 21) throw new Error(`coût moyen ${await lireCoutMoyen()} au lieu de 21`)
console.log('OK: 10 à 18 $ + 10 à 24 $ donne un coût moyen de 21 $')

// La valeur du stock suit le coût moyen, pas le prix de référence
if (await lireValeur() !== 420) throw new Error(`valeur ${await lireValeur()} au lieu de 420 (20 × 21)`)
console.log('OK: la valeur du stock est au coût moyen (420 $), pas au prix de référence')

// ─── Une consommation sort au coût moyen, pas au prix du jour ───────────────
await ouvrirMouvement()
await choisirType('Consommation')
await page.locator('.fixed input[aria-label="Quantité sortie"]').fill('8')
await page.waitForTimeout(400)
const projets = await page.locator('.fixed select[aria-label="Chantier qui consomme"] option').count()
if (projets < 2) throw new Error('aucun chantier proposé pour la consommation')
const valeurProjet = await page.locator('.fixed select[aria-label="Chantier qui consomme"] option').nth(1).getAttribute('value')
await page.locator('.fixed select[aria-label="Chantier qui consomme"]').selectOption(valeurProjet)
await page.waitForTimeout(400)
const apercuConso = await page.locator('form').first().textContent()
if (!/168,00/.test(apercuConso)) throw new Error('la valeur sortie devrait être 8 × 21 = 168,00 $')
console.log('OK: la sortie est valorisée au coût moyen (168 $), pas au prix de référence')
await enregistrer()

if (await lireStock() !== 12) throw new Error(`stock ${await lireStock()} au lieu de 12`)
if (await lireCoutMoyen() !== 21) throw new Error('une sortie ne doit pas déplacer le coût moyen')
console.log('OK: le stock baisse, le coût moyen reste à 21 $')

// ─── Un retour de chantier : quantité qui REMONTE le stock ──────────────────
await ouvrirMouvement()
await choisirType('Consommation')
await page.locator('.fixed input[type="checkbox"]').first().check()
await page.waitForTimeout(300)
await page.locator('.fixed input[aria-label="Quantité remise en stock"]').fill('3')
// Rattaché au MÊME chantier que la sortie : c'est ce qui permet de vérifier
// plus bas que le retour vient en déduction de ce que le chantier a consommé.
await page.locator('.fixed select[aria-label="Chantier qui consomme"]').selectOption(valeurProjet)
await page.waitForTimeout(400)
await enregistrer()
if (await lireStock() !== 15) throw new Error(`stock ${await lireStock()} au lieu de 15 après le retour`)
console.log('OK: un retour de chantier remonte le stock (12 → 15)')

// Le retour crédite le chantier : sa consommation retombe à 5 × 21 = 105 $
{
  const journal = await lire('mouvements')
  const retour = journal.find(m => m.type === 'consommation' && m.qty > 0)
  if (!retour) throw new Error('le retour n’est pas inscrit au journal')
  if (retour.qty !== 3) throw new Error(`le retour est inscrit ${retour.qty} au lieu de +3`)
  console.log('OK: le retour est inscrit en positif, pas comme une seconde sortie')
}

// ─── Le stock peut passer sous zéro, et le dit ──────────────────────────────
await ouvrirMouvement()
await choisirType('Consommation')
await page.locator('.fixed input[aria-label="Quantité sortie"]').fill('20')
await page.waitForTimeout(500)
const avertissement = await page.locator('form').first().textContent()
if (!/sous zéro/.test(avertissement))
  throw new Error('rien n’avertit que le stock va passer sous zéro')
console.log('OK: le passage sous zéro est annoncé avant d’enregistrer')
await enregistrer()
if (await lireStock() !== -5) throw new Error(`stock ${await lireStock()} au lieu de -5`)
console.log('OK: la saisie est acceptée et le stock affiche -5 — le décompte est à refaire')

// ─── LE POINT CRUCIAL : le prix de mars reste le prix de mars ───────────────
// On double le prix de référence, puis on vérifie que les mouvements déjà
// inscrits n'ont pas changé de valeur.
const avant = await lire('mouvements')
const valeursAvant = avant.map(m => `${m.id}:${m.prixUnitaire}`).sort().join('|')

await ligne.locator('button:has-text("Modifier")').click()
await page.waitForSelector('text=Prix de référence', { timeout: 5000 })
await page.fill('input[aria-label="Prix de référence ($ / unité)"], .fixed input[type="number"] >> nth=1', '36')
  .catch(async () => {
    // Le champ est repéré par son libellé plutôt que par sa position
    const champs = page.locator('.fixed input[type="number"]')
    const n = await champs.count()
    for (let i = 0; i < n; i++) {
      const v = await champs.nth(i).inputValue()
      if (v === '18') { await champs.nth(i).fill('36'); return }
    }
    throw new Error('champ du prix de référence introuvable')
  })
await page.click('.fixed button[type="submit"]')
await page.waitForTimeout(900)

const apres = await lire('mouvements')
const valeursApres = apres.map(m => `${m.id}:${m.prixUnitaire}`).sort().join('|')
if (valeursApres !== valeursAvant)
  throw new Error(`un changement de prix a réécrit les mouvements passés :\n${valeursAvant}\n${valeursApres}`)
console.log('OK: doubler le prix de référence ne change AUCUN mouvement déjà inscrit')

// Et le coût moyen du stock n'est pas touché non plus par le prix de référence
if (await lireCoutMoyen() !== 21)
  throw new Error(`le coût moyen est passé à ${await lireCoutMoyen()} alors que seul le prix de référence a changé`)
console.log('OK: le coût moyen du stock ignore le prix de référence')

// Le nouveau prix est daté et historisé
{
  const art = (await lire('materials')).find(m => m.id === 9001)
  if (art.unitCost !== 36) throw new Error('le prix de référence n’a pas été enregistré')
  if (art.prixHistorique.length < 2) throw new Error('le changement de prix n’est pas historisé')
  if (art.prixHistorique.at(-1).prix !== 36) throw new Error('le dernier relevé n’est pas 36 $')
  console.log(`OK: le prix est daté et historisé (${art.prixHistorique.length} relevés)`)
}

// ─── Un achat au nouveau prix part du coût moyen RÉEL ───────────────────────
// Stock -5 : la moyenne ne doit pas être tirée par un stock négatif.
await ouvrirMouvement()
await choisirType('Achat')
await page.locator('.fixed input[aria-label="Quantité reçue"]').fill('10')
await page.locator('.fixed input[aria-label="Prix payé"]').fill('36')
await page.waitForTimeout(500)
await enregistrer()
if (await lireStock() !== 5) throw new Error(`stock ${await lireStock()} au lieu de 5`)
if (await lireCoutMoyen() !== 36)
  throw new Error(`coût moyen ${await lireCoutMoyen()} : un stock négatif ne doit pas peser dans la moyenne`)
console.log('OK: avec un stock négatif, la moyenne repart du prix payé (36 $)')

// ─── Le journal ──────────────────────────────────────────────────────────────
await page.locator('button:has-text("Journal")').first().click()
await page.waitForTimeout(900)
const corpsJournal = await page.textContent('body')
if (!/Journal des mouvements/.test(corpsJournal)) throw new Error('le journal ne s’ouvre pas')
for (const mot of ['Achat', 'Consommation']) {
  if (!new RegExp(mot).test(corpsJournal)) throw new Error(`le journal ne montre pas « ${mot} »`)
}
const lignesJournal = await page.locator('table').nth(0).locator('tbody tr').count()
const journalFinal = await lire('mouvements')
console.log(`Journal : ${journalFinal.length} mouvements inscrits, ${lignesJournal} affichés`)
if (journalFinal.length !== 5) throw new Error(`${journalFinal.length} mouvements au lieu de 5`)
console.log('OK: les cinq mouvements sont au journal, chacun avec son prix figé')

// Chaque mouvement porte bien un prix et une date
for (const m of journalFinal) {
  if (!Number.isFinite(m.prixUnitaire) || m.prixUnitaire <= 0)
    throw new Error(`mouvement ${m.id} sans prix figé`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) throw new Error(`mouvement ${m.id} sans date correcte`)
  if (m.qty === 0) throw new Error(`mouvement ${m.id} de quantité nulle`)
}
console.log('OK: chaque mouvement porte un prix figé, une date et une quantité non nulle')

// ─── La consommation remonte sur la fiche du chantier ───────────────────────
{
  const conso = journalFinal.filter(m => m.type === 'consommation' && m.projectId)
  const projectId = conso[0].projectId
  // 8 sortis puis 3 revenus, au coût moyen de 21 $ : 5 × 21 = 105 $
  const attendu = +conso.reduce((s, m) => s - m.qty * m.prixUnitaire, 0).toFixed(2)
  await page.goto(base + `/projets/${projectId}`)
  await page.waitForTimeout(1600)
  const corpsProjet = await page.textContent('body')
  if (!/Matériaux sortis pour ce chantier/.test(corpsProjet))
    throw new Error('la fiche du chantier ne montre pas les matériaux sortis')
  // Jusqu'au symbole du dollar seulement : sans borne, la capture débordait
  // sur le montant du budget affiché juste après.
  const montant = num(corpsProjet.match(/Consommé\s*:\s*([\d\s\u202f\u00a0,.]+)\$/)?.[1] ?? '0')
  console.log(`Consommé sur le chantier : ${montant} $ (attendu ${attendu} $)`)
  if (Math.abs(montant - attendu) > 1)
    throw new Error(`la fiche annonce ${montant} $ au lieu de ${attendu} $`)
  console.log('OK: le chantier annonce exactement la somme des sorties, retour déduit')
  if (!/retour au stock/.test(corpsProjet))
    throw new Error('le retour n’est pas signalé comme tel sur la fiche du chantier')
  console.log('OK: le retour y est signalé, pas confondu avec une sortie')
}

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Les mouvements de stock gardent leur prix, négatifs compris')
await browser.close()
