// Vérifie qu'on peut masquer le prix de certaines lignes d'une soumission :
// la ligne reste annoncée au client, ses chiffres cèdent la place à « Inclus »,
// et son montant continue de compter dans le total.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))

// ─── Ouvrir une soumission d'exemple ─────────────────────────────────────────
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tbody tr').first().click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(700)

const totalAffiche = async () => num(await page.locator('span:text-is("TOTAL")').first()
  .locator('xpath=following-sibling::span[1]').textContent())
const lignes = () => page.locator('tbody tr')

// Enregistrer une modification recalcule le total depuis les lignes. Sur une
// soumission d'exemple, le sous-total stocké ne correspond pas toujours au
// centime près à la somme de ses lignes : un premier enregistrement À VIDE
// aligne les deux, pour que la comparaison qui suit ne mesure QUE l'effet du
// masquage.
await page.click('button:has-text("Modifier")')
await page.waitForTimeout(700)
await page.click('button:has-text("Enregistrer")')
await page.waitForTimeout(1200)

const totalAvant = await totalAffiche()
const nbLignes = await lignes().count()
console.log(`Soumission : ${nbLignes} lignes, total ${totalAvant} $`)
if (nbLignes < 2) throw new Error('il faut au moins deux lignes pour ce test')

// La description de la première ligne, pour la retrouver ensuite
const description = (await lignes().first().locator('td').nth(1).textContent()).trim()
console.log(`Première ligne : « ${description} »`)

// ─── Masquer le prix de la première ligne ────────────────────────────────────
await page.click('button:has-text("Modifier")')
await page.waitForTimeout(700)

const bouton = page.locator('button[aria-label^="Masquer le prix"]').first()
if (await bouton.count() === 0) throw new Error('aucun bouton pour masquer le prix d’une ligne')
console.log('OK: chaque ligne propose de masquer son prix')
await bouton.click()
await page.waitForTimeout(400)
if (await page.locator('button[aria-label^="Afficher le prix"]').count() === 0)
  throw new Error('le bouton ne propose pas de remontrer le prix une fois masqué')
console.log('OK: le bouton bascule et propose de remontrer le prix')

await page.click('button:has-text("Enregistrer")')
await page.waitForTimeout(1200)

// ─── La ligne reste, sans ses chiffres ───────────────────────────────────────
const premiere = lignes().first()
const cellules = await premiere.locator('td').allTextContents()
console.log('Cellules de la ligne masquée :', JSON.stringify(cellules.map(c => c.trim())))

if (!cellules[1].includes(description.slice(0, 20)))
  throw new Error('la description a disparu alors qu’elle doit rester')
console.log('OK: la description reste affichée')

for (const [i, quoi] of [[2, 'l’unité'], [3, 'la quantité'], [4, 'le prix unitaire']]) {
  if (cellules[i].trim() !== '')
    throw new Error(`${quoi} est encore affiché : « ${cellules[i]} »`)
}
console.log('OK: unité, quantité et prix unitaire sont effacés')

if (!/Inclus/i.test(cellules[5]))
  throw new Error(`la colonne Total devrait afficher « Inclus », elle montre « ${cellules[5]} »`)
console.log('OK: la colonne Total affiche « Inclus »')

// ─── Le montant compte toujours dans le total ────────────────────────────────
const totalApres = await totalAffiche()
console.log(`Total après masquage : ${totalApres} $ (avant : ${totalAvant} $)`)
if (Math.abs(totalApres - totalAvant) > 1)
  throw new Error('masquer un prix a changé le total — le montant doit continuer de compter')
console.log('OK: le total est inchangé — masquer un prix ne retire pas son montant')

// ─── Les autres lignes gardent leurs chiffres ────────────────────────────────
const deuxieme = await lignes().nth(1).locator('td').allTextContents()
if (deuxieme[5].trim() === '' || /Inclus/i.test(deuxieme[5]))
  throw new Error('les autres lignes ont perdu leur prix')
console.log('OK: les autres lignes gardent leur chiffrage')

// ─── Le masquage survit au rechargement ──────────────────────────────────────
await page.reload()
await page.waitForTimeout(1500)
if (!/Inclus/i.test(await page.textContent('body')))
  throw new Error('le masquage est perdu au rechargement')
console.log('OK: le choix est conservé d’une visite à l’autre')

// ─── Il fait partie de ce qui s'imprime — c'est le PDF du client ────────────
const imprime = await page.evaluate(() => {
  const cel = [...document.querySelectorAll('td span')].find(s => /Inclus/i.test(s.textContent))
  if (!cel) return 'absent'
  for (let n = cel; n && n !== document.body; n = n.parentElement) {
    if (n.classList?.contains('no-print')) return 'masqué'
  }
  return 'imprimé'
})
if (imprime !== 'imprimé') throw new Error(`la mention « Inclus » est ${imprime} à l’impression`)
console.log('OK: la mention « Inclus » fait partie du PDF remis au client')

// ─── Remontrer le prix ───────────────────────────────────────────────────────
await page.click('button:has-text("Modifier")')
await page.waitForTimeout(700)
await page.locator('button[aria-label^="Afficher le prix"]').first().click()
await page.waitForTimeout(300)
await page.click('button:has-text("Enregistrer")')
await page.waitForTimeout(1200)
if (/Inclus/i.test(await page.textContent('body')))
  throw new Error('le prix n’est pas revenu')
if (Math.abs(await totalAffiche() - totalAvant) > 1)
  throw new Error('le total a bougé en remontrant le prix')
console.log('OK: remontrer le prix rétablit la ligne, total inchangé')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Le prix d’une ligne se masque sans changer le total')
await browser.close()
