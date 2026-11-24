// Vérifie la section « Générale » : des travaux qui traversent plusieurs
// pièces, dont la superficie est le cumul du devis, et qui se retrouvent
// jusque dans la soumission sans être rattachés à une pièce.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))
const TRAVAIL = 'Peinture murs — 2 couches (apprêt + finition)'

// ─── Un devis à deux pièces ──────────────────────────────────────────────────
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Nouveau devis', { timeout: 8000 })
await page.click('text=Nouveau devis')
await page.waitForSelector('text=Pour qui est ce devis ?', { timeout: 5000 })
await page.click('text=Nouveau client')
await page.fill('input[placeholder="ex: Jean Tremblay"]', 'Client Générale')
await page.locator('button[aria-pressed]').filter({ hasText: 'Peinture' }).first().click()
await page.click('text=Continuer')
await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 5000 })
await page.locator('button:has-text("Salon")').last().click()
await page.waitForTimeout(500)
// Une fois une pièce ajoutée, la liste des gabarits se referme : il faut la
// rouvrir pour en ajouter une seconde.
await page.click('button:has-text("Ajouter une autre pièce")')
await page.waitForTimeout(400)
await page.locator('button:has-text("Chambre")').last().click()
await page.waitForSelector('text=Surface de plancher', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 5000 })
await page.waitForTimeout(600)

// ─── L'onglet Générale existe, après les pièces ──────────────────────────────
const onglets = await page.locator('button').filter({ hasText: /^(🛋️ Salon|🛏️ Chambre|🏠 Générale)/ }).allTextContents()
console.log('Onglets :', onglets.map(t => t.trim()))
const onglet = page.locator('button').filter({ hasText: 'Générale' }).first()
if (await onglet.count() === 0) throw new Error('aucun onglet « Générale »')
console.log('OK: l’onglet Générale est proposé')

// ─── La superficie y est le cumul des pièces ─────────────────────────────────
// Même travail ajouté dans chaque pièce, puis dans la Générale : la quantité
// de la Générale doit valoir la somme des deux.
const ajouterPeinture = async () => {
  await page.locator('button').filter({ has: page.locator('p:text-is("Peinture")') }).first().click()
  await page.waitForTimeout(400)
  await page.click(`text=${TRAVAIL}`)
  await page.waitForTimeout(600)
}
const quantiteLigne = async () => num(await page.locator('input[type="number"]').first().inputValue())

await page.locator('button').filter({ hasText: 'Salon' }).first().click()
await page.waitForTimeout(400)
await ajouterPeinture()
const qSalon = await quantiteLigne()

await page.locator('button').filter({ hasText: 'Chambre' }).first().click()
await page.waitForTimeout(400)
await ajouterPeinture()
const qChambre = await quantiteLigne()

await onglet.click()
await page.waitForTimeout(500)
await ajouterPeinture()
const qGenerale = await quantiteLigne()

console.log(`Salon ${qSalon} + Chambre ${qChambre} = ${(qSalon + qChambre).toFixed(2)} · Générale ${qGenerale}`)
if (Math.abs(qGenerale - (qSalon + qChambre)) > 1)
  throw new Error(`la Générale donne ${qGenerale} au lieu du cumul ${(qSalon + qChambre).toFixed(2)}`)
console.log('OK: la superficie de la Générale est bien le cumul des deux pièces')

// ─── Elle s'explique, et ne propose pas le questionnaire d'une pièce ─────────
const surGenerale = await page.textContent('body')
if (!/Travaux sur plusieurs pièces/.test(surGenerale))
  throw new Error('rien n’explique ce qu’est la section Générale')
if (!/total de vos 2 pièces/.test(surGenerale))
  throw new Error('la note n’annonce pas que la superficie est le total des pièces')
console.log('OK: la section s’explique et annonce d’où vient la superficie')
if (/Questionnaire détaillé/.test(surGenerale))
  throw new Error('le questionnaire d’une pièce est proposé sur la Générale')
console.log('OK: le questionnaire propre à une pièce n’y est pas proposé')

// Sur une vraie pièce, il revient
await page.locator('button').filter({ hasText: 'Salon' }).first().click()
await page.waitForTimeout(500)
if (!/Questionnaire détaillé/.test(await page.textContent('body')))
  throw new Error('le questionnaire a disparu des vraies pièces')
console.log('OK: le questionnaire reste proposé sur les vraies pièces')

// ─── Le devis montre la Générale comme une section à part ────────────────────
await page.click('text=Continuer')
await page.waitForSelector('button:has-text("Enregistrer")', { timeout: 8000 })
const devis = await page.textContent('body')
if (!/Générale/.test(devis)) throw new Error('la Générale n’apparaît pas sur le devis')
if (/undefined/.test(devis)) throw new Error('le devis affiche « undefined » quelque part')
if (!/travaux sur l'ensemble des 2 pièces/.test(devis))
  throw new Error('la Générale n’annonce pas sa portée sur le devis')
console.log('OK: le devis présente la Générale, sans dimensions inventées')

// ─── Jusqu'à la soumission, sans préfixe de pièce ────────────────────────────
await page.click('button:has-text("Enregistrer")')
await page.waitForSelector('text=Devis enregistré', { timeout: 8000 })
await page.waitForTimeout(2400)

const enregistre = (await page.evaluate(() =>
  JSON.parse(localStorage.getItem('cp-devis-enregistres') || '[]'))).at(-1)
const soumission = (await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('cp-donnees-v1') || '{}').quotes ?? []))).find(q => q.number === enregistre.number)

const lignes = soumission.items.map(l => l.description)
console.log('Lignes de la soumission :', lignes)
const generales = lignes.filter(d => /^Peinture murs/.test(d))
const parPiece = lignes.filter(d => /^(Salon|Chambre) — Peinture murs/.test(d))
if (parPiece.length !== 2)
  throw new Error(`${parPiece.length} lignes préfixées par leur pièce au lieu de 2`)
if (generales.length !== 1)
  throw new Error(`${generales.length} ligne générale sans préfixe au lieu de 1`)
console.log('OK: la ligne générale n’est pas préfixée d’un nom de pièce, les autres le sont')

const sommeLignes = soumission.items.reduce((s, l) => s + l.qty * l.unitPrice, 0)
if (Math.abs(sommeLignes - soumission.subtotal) > 0.02)
  throw new Error(`la somme des lignes (${sommeLignes.toFixed(2)}) ne fait pas le sous-total (${soumission.subtotal})`)
console.log('OK: la soumission reste cohérente')

// ─── Supprimer une pièce ne supprime pas les travaux généraux ───────────────
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Mes devis enregistrés', { timeout: 8000 })
await page.locator('button:has-text("Modifier")').first().click()
await page.waitForSelector('text=Modification du devis', { timeout: 8000 })
await page.locator('button[aria-label="Les pièces"]').first().click()
await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 8000 })
await page.locator('button[aria-label="Retirer cette pièce"]').first().click()
await page.waitForTimeout(900)
await page.click('text=Continuer')
await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 8000 })
await page.locator('button').filter({ hasText: 'Générale' }).first().click()
await page.waitForTimeout(600)
if (!(await page.textContent('body')).includes('Peinture murs'))
  throw new Error('supprimer une pièce a emporté les travaux généraux')
console.log('OK: supprimer une pièce laisse les travaux généraux intacts')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Section Générale : travaux sur plusieurs pièces, superficie cumulée')
await browser.close()
