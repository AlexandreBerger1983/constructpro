// Vérifie les trois niveaux de présentation d'une soumission : détaillée,
// groupée, sommaire. Le point qui commande tout : le TOTAL ne change jamais.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))

// ─── Un devis à deux pièces, pour avoir de quoi regrouper ────────────────────
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Nouveau devis', { timeout: 8000 })
await page.click('text=Nouveau devis')
await page.waitForSelector('text=Pour qui est ce devis ?', { timeout: 5000 })
await page.click('text=Nouveau client')
await page.fill('input[placeholder="ex: Jean Tremblay"]', 'Client Présentation')
await page.locator('button[aria-pressed]').filter({ hasText: 'Peinture' }).first().click()
await page.click('text=Continuer')
await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 5000 })
await page.locator('button:has-text("Salon")').last().click()
await page.waitForTimeout(500)
await page.click('button:has-text("Ajouter une autre pièce")')
await page.waitForTimeout(400)
await page.locator('button:has-text("Chambre")').last().click()
await page.waitForSelector('text=Surface de plancher', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 5000 })

// DEUX travaux par pièce : avec un seul, le regroupement ne réduirait rien et
// le test ne prouverait pas grand-chose.
const ajouterPeinture = async () => {
  await page.locator('button').filter({ has: page.locator('p:text-is("Peinture")') }).first().click()
  await page.waitForTimeout(400)
  await page.click('text=Peinture murs — 2 couches (apprêt + finition)')
  await page.waitForTimeout(400)
  await page.click('text=Peinture plafond — 2 couches')
  await page.waitForTimeout(500)
}
await page.locator('button').filter({ hasText: 'Salon' }).first().click()
await page.waitForTimeout(400); await ajouterPeinture()
await page.locator('button').filter({ hasText: 'Chambre' }).first().click()
await page.waitForTimeout(400); await ajouterPeinture()

await page.click('text=Continuer')
await page.waitForSelector('button:has-text("Enregistrer")', { timeout: 8000 })
await page.click('button:has-text("Enregistrer")')
await page.waitForSelector('text=Devis enregistré', { timeout: 8000 })
await page.waitForTimeout(2400)

const devis = (await page.evaluate(() =>
  JSON.parse(localStorage.getItem('cp-devis-enregistres') || '[]'))).at(-1)

// ─── Ouvrir la soumission ────────────────────────────────────────────────────
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tr', { hasText: devis.number }).first().click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(800)

const totalAffiche = async () => num(await page.locator('span:text-is("TOTAL")').first()
  .locator('xpath=following-sibling::span[1]').textContent())
const nbLignes = () => page.locator('#devis tbody tr').count()
const choisir = async (label) => {
  await page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${label}$`) }).first().click()
  await page.waitForTimeout(700)
}

// ─── Détaillée, le niveau par défaut ─────────────────────────────────────────
const actif = await page.locator('button[aria-pressed="true"]').filter({ hasText: /Détaillée|Groupée|Sommaire/ }).first().textContent()
if (!/Détaillée/.test(actif)) throw new Error(`le niveau par défaut est « ${actif.trim()} » au lieu de « Détaillée »`)
console.log('OK: une soumission s’ouvre en présentation détaillée')

const totalReference = await totalAffiche()
const lignesDetaillees = await nbLignes()
console.log(`Détaillée : ${lignesDetaillees} lignes, total ${totalReference} $`)
if (lignesDetaillees < 3) throw new Error('pas assez de lignes pour exercer le regroupement')

const corpsDetaille = await page.textContent('#devis')
if (!/Salon — Peinture murs/.test(corpsDetaille) || !/Chambre — Peinture murs/.test(corpsDetaille))
  throw new Error('le détail ne montre pas les lignes par pièce')
console.log('OK: le détail montre chaque ligne avec sa pièce')

// ─── Groupée : un montant par pièce ──────────────────────────────────────────
await choisir('Groupée')
const lignesGroupees = await nbLignes()
const totalGroupe = await totalAffiche()
console.log(`Groupée : ${lignesGroupees} lignes, total ${totalGroupe} $`)
if (!(lignesGroupees < lignesDetaillees))
  throw new Error('le regroupement ne réduit pas le nombre de lignes')
if (Math.abs(totalGroupe - totalReference) > 0.5)
  throw new Error(`le total a changé : ${totalGroupe} au lieu de ${totalReference}`)
console.log('OK: moins de lignes, et le total est inchangé')

const corpsGroupe = await page.textContent('#devis')
if (!/Salon/.test(corpsGroupe) || !/Chambre/.test(corpsGroupe))
  throw new Error('les groupes ne portent pas le nom des pièces')
if (/Salon — Peinture murs/.test(corpsGroupe))
  throw new Error('le détail des lignes est encore visible en présentation groupée')
console.log('OK: les pièces sont nommées, leur détail est caché')

// Aucune quantité ni prix unitaire ne subsiste sur une ligne groupée
const cellulesGroupe = await page.locator('#devis tbody tr').first().locator('td').allTextContents()
console.log('Ligne groupée :', JSON.stringify(cellulesGroupe.map(c => c.trim())))
for (const [i, quoi] of [[2, 'l’unité'], [3, 'la quantité'], [4, 'le prix unitaire']]) {
  if (cellulesGroupe[i].trim() !== '')
    throw new Error(`${quoi} apparaît encore sur une ligne groupée : « ${cellulesGroupe[i]} »`)
}
console.log('OK: une ligne groupée ne montre ni unité, ni quantité, ni prix unitaire')

// ─── Sommaire : une seule ligne ──────────────────────────────────────────────
await choisir('Sommaire')
const lignesSommaire = await nbLignes()
const totalSommaire = await totalAffiche()
console.log(`Sommaire : ${lignesSommaire} ligne, total ${totalSommaire} $`)
if (lignesSommaire !== 1) throw new Error(`${lignesSommaire} lignes en sommaire au lieu d’une seule`)
if (Math.abs(totalSommaire - totalReference) > 0.5)
  throw new Error(`le total a changé : ${totalSommaire} au lieu de ${totalReference}`)
console.log('OK: une seule ligne, et le total est toujours le même')

const corpsSommaire = await page.textContent('#devis')
if (/Salon|Chambre/.test(corpsSommaire))
  throw new Error('les pièces apparaissent encore en présentation sommaire')
if (!/TPS|TVQ/.test(corpsSommaire))
  throw new Error('les taxes doivent rester visibles même en sommaire')
console.log('OK: aucune pièce nommée, mais les taxes restent affichées')

// ─── Le choix est conservé ───────────────────────────────────────────────────
await page.reload()
await page.waitForTimeout(1600)
const apres = await page.locator('button[aria-pressed="true"]').filter({ hasText: /Détaillée|Groupée|Sommaire/ }).first().textContent()
if (!/Sommaire/.test(apres)) throw new Error('le niveau choisi n’est pas conservé')
if (await nbLignes() !== 1) throw new Error('la présentation sommaire n’est pas rétablie')
console.log('OK: le niveau choisi est conservé d’une visite à l’autre')

// ─── La modification montre toujours tout ────────────────────────────────────
await page.click('button:has-text("Modifier")')
await page.waitForTimeout(800)
const enModif = await nbLignes()
console.log(`En modification : ${enModif} lignes`)
if (enModif !== lignesDetaillees)
  throw new Error('la modification devrait montrer toutes les lignes, pas la vue sommaire')
if (await page.locator('button[aria-pressed]').filter({ hasText: /^Sommaire$/ }).count() !== 0)
  throw new Error('le sélecteur de présentation ne devrait pas s’afficher en modification')
console.log('OK: on corrige toujours sur le détail complet, sans sélecteur')
await page.click('button:has-text("Annuler")').catch(() => page.keyboard.press('Escape'))
await page.waitForTimeout(800)

// ─── Le sélecteur ne s'imprime pas ───────────────────────────────────────────
const imprimeSelecteur = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Sommaire')
  if (!b) return 'absent'
  for (let n = b; n && n !== document.body; n = n.parentElement) {
    if (n.classList?.contains('no-print')) return 'masqué'
  }
  return 'imprimé'
})
if (imprimeSelecteur === 'imprimé')
  throw new Error('le sélecteur de présentation apparaîtrait sur le document imprimé')
console.log(`OK: le sélecteur ne part pas chez le client (${imprimeSelecteur})`)

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Trois présentations, un seul et même total')
await browser.close()
