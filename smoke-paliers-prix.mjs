// Vérifie les paliers de prix : trois forfaits et un prix minimum saisis dans
// les Paramètres, choisis ligne par ligne dans le devis, et répercutés jusqu'au
// total de la soumission.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))
const TRAVAIL = 'Peinture murs — 2 couches (apprêt + finition)'
const FORFAITS = { Petit: 350, Moyen: 650, Gros: 1200, Minimum: 250 }

// ─── Saisir les quatre montants dans les Paramètres ──────────────────────────
await page.goto(base + '/parametres')
await page.waitForSelector('text=Prix du devis rapide', { timeout: 10000 })
await page.click('text=Prix du devis rapide')
await page.waitForSelector('text=Afficher les prix en', { timeout: 8000 })
await page.fill('input[placeholder="Rechercher un travail…"]', 'Peinture murs')
await page.waitForTimeout(500)

for (const [label, montant] of Object.entries(FORFAITS)) {
  const champ = page.locator(`input[aria-label="${label} — ${TRAVAIL}"]`)
  if (await champ.count() === 0) throw new Error(`le champ « ${label} » n’existe pas dans les Paramètres`)
  await champ.fill(String(montant))
  await page.waitForTimeout(250)
}
console.log('OK: les quatre montants fixes sont saisissables dans les Paramètres')

// Un montant fixe ne doit JAMAIS se convertir en pieds carrés : 350 $ reste
// 350 $, que l'affichage soit en pieds ou en mètres.
const lireForfait = async () => num(await page.locator(`input[aria-label="Moyen — ${TRAVAIL}"]`).inputValue())
const enPieds = await lireForfait()
await page.click('button:has-text("Mètres carrés")')
await page.waitForTimeout(600)
const enMetres = await lireForfait()
console.log(`Forfait « Moyen » : ${enPieds} $ en pieds, ${enMetres} $ en mètres`)
if (enPieds !== 650 || enMetres !== 650)
  throw new Error(`un montant fixe a été converti : ${enPieds} puis ${enMetres}`)
console.log('OK: un montant fixe ne se convertit jamais — il reste 650 $ dans les deux unités')

// Et le prix unitaire, lui, se convertit toujours
const mo = num(await page.locator(`input[aria-label="Main-d'œuvre — ${TRAVAIL}"]`).inputValue())
await page.click('button:has-text("Pieds carrés")')
await page.waitForTimeout(600)
const moPieds = num(await page.locator(`input[aria-label="Main-d'œuvre — ${TRAVAIL}"]`).inputValue())
if (!(moPieds < mo)) throw new Error('le prix unitaire ne se convertit plus')
console.log(`OK: le prix unitaire se convertit toujours (${mo} $/m² → ${moPieds} $/pi²)`)

// ─── Monter un devis et choisir les modes ────────────────────────────────────
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Nouveau devis', { timeout: 8000 })
await page.click('text=Nouveau devis')
await page.waitForSelector('text=Pour qui est ce devis ?', { timeout: 5000 })
await page.click('text=Nouveau client')
await page.fill('input[placeholder="ex: Jean Tremblay"]', 'Client Paliers')
await page.locator('button[aria-pressed]').filter({ hasText: 'Peinture' }).first().click()
await page.click('text=Continuer')
await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 5000 })
await page.locator('button:has-text("Chambre")').last().click()
await page.waitForSelector('text=Surface de plancher', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 5000 })
await page.locator('button').filter({ has: page.locator('p:text-is("Peinture")') }).first().click()
await page.waitForTimeout(400)
await page.click(`text=${TRAVAIL}`)
await page.waitForSelector('text=Travaux choisis', { timeout: 5000 })
await page.waitForTimeout(600)

// Le montant à la surface, avant tout changement de mode
const montantLigne = async () => {
  const txt = await page.locator('p.font-bold.text-slate-800.w-20').first().textContent()
  return num(txt)
}
const aLaSurface = await montantLigne()
console.log(`Montant à la surface : ${aLaSurface} $`)
if (!(aLaSurface > 0)) throw new Error('la ligne n’a aucun montant à la surface')

// Les cinq modes sont proposés
const modes = await page.locator('button[aria-pressed]').filter({ hasText: /^(Surface|Petit|Moyen|Gros|Minimum)$/ }).count()
console.log(`Modes proposés sur la ligne : ${modes}`)
if (modes !== 5) throw new Error(`${modes} modes proposés au lieu de 5`)
console.log('OK: les cinq modes sont proposés sur la ligne')

// Chaque forfait donne exactement son montant, quelle que soit la superficie
const choisirMode = async (court) => {
  await page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${court}$`) }).first().click()
  await page.waitForTimeout(500)
}
for (const [label, attendu] of Object.entries(FORFAITS)) {
  await choisirMode(label)
  const obtenu = await montantLigne()
  console.log(`  ${label.padEnd(8)} → ${obtenu} $ (attendu ${attendu} $)`)
  if (Math.abs(obtenu - attendu) > 1)
    throw new Error(`le mode « ${label} » donne ${obtenu} $ au lieu de ${attendu} $`)
}
console.log('OK: chaque montant fixe s’applique tel quel, sans tenir compte de la superficie')

// En mode forfait, la quantité n'est plus modifiable — elle n'entre plus en jeu
if (!(await page.textContent('body')).includes('Montant fixe'))
  throw new Error('rien n’indique que la quantité ne compte plus')
console.log('OK: la quantité est remplacée par « Montant fixe »')

// Revenir à la surface redonne le montant d'origine
await choisirMode('Surface')
const retour = await montantLigne()
if (Math.abs(retour - aLaSurface) > 1)
  throw new Error(`le retour à la surface donne ${retour} $ au lieu de ${aLaSurface} $`)
console.log('OK: revenir à la surface redonne le montant d’origine')

// ─── Le mode suit jusqu'au devis et à la soumission ──────────────────────────
await choisirMode('Moyen')
await page.click('text=Continuer')
await page.waitForSelector('button:has-text("Enregistrer")', { timeout: 8000 })

// Le montant des travaux avant marge : le forfait de 650 $ et rien d'autre
const sousTotal = num(await page.locator('span:text-is("Travaux (matériaux + main-d\'œuvre)")').first()
  .locator('xpath=following-sibling::span[1]').textContent())
console.log(`Travaux avant marge : ${sousTotal} $`)
if (Math.abs(sousTotal - 650) > 1)
  throw new Error(`le devis totalise ${sousTotal} $ au lieu du forfait de 650 $`)
console.log('OK: le devis totalise le montant fixe, pas la surface')

await page.click('button:has-text("Enregistrer")')
await page.waitForSelector('text=Devis enregistré', { timeout: 8000 })
await page.waitForTimeout(2400)

const devis = (await page.evaluate(() =>
  JSON.parse(localStorage.getItem('cp-devis-enregistres') || '[]'))).at(-1)
const ligne = devis.items[0]
console.log(`Ligne enregistrée : mode « ${ligne.mode} », forfait moyen ${ligne.forfaitMoyen} $`)
if (ligne.mode !== 'moyen') throw new Error('le mode n’est pas enregistré avec le devis')
if (Number(ligne.forfaitMoyen) !== 650)
  throw new Error('le montant du forfait n’est pas figé dans le devis enregistré')
console.log('OK: le mode ET le montant sont figés dans le devis — les Paramètres peuvent changer après')

const soumission = (await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('cp-donnees-v1') || '{}').quotes ?? []))).find(q => q.number === devis.number)
if (!soumission) throw new Error('aucune soumission créée')
const sommeLignes = soumission.items.reduce((s, l) => s + l.qty * l.unitPrice, 0)
if (Math.abs(sommeLignes - soumission.subtotal) > 0.02)
  throw new Error(`la somme des lignes (${sommeLignes.toFixed(2)}) ne fait pas le sous-total (${soumission.subtotal})`)
console.log('OK: la soumission reste cohérente — la somme des lignes fait le sous-total')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Paliers petit / moyen / gros et prix minimum fonctionnels')
await browser.close()
