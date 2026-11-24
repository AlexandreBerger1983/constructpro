// Vérifie que la fiche d'un client montre toutes ses coordonnées : personne
// contact, téléphone, courriel ET adresse. L'adresse manquait, alors que
// c'est l'information qu'on cherche en partant sur un chantier.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const ADRESSE = '1450 boulevard Curé-Labelle, bureau 210, Sainte-Rose, Laval, QC H7P 4N5'
const COURRIEL = 'luca.fortin@exemple.ca'
const TEL = '581-309-3695'

await page.goto(base + '/clients')
await page.waitForSelector('text=Nouveau client', { timeout: 10000 })

// ─── Créer un client avec toutes ses coordonnées ─────────────────────────────
await page.click('button:has-text("Nouveau client")')
await page.waitForSelector('text=Nom du client', { timeout: 5000 })
await page.fill('input[placeholder="ex: Constructions Untel Inc."]', 'Client Coordonnées')
await page.fill('input[placeholder="ex: Jean Tremblay"]', 'Luca Fortin')
await page.fill('input[placeholder="ex: 514-555-1234"]', TEL)
await page.fill('input[placeholder="ex: info@client.ca"]', COURRIEL)
await page.fill('input[placeholder="ex: 123 rue Principale, Montréal, QC"]', ADRESSE)
await page.click('button[type="submit"]:has-text("Enregistrer")')
await page.waitForTimeout(1200)

// ─── La carte montre les quatre ─────────────────────────────────────────────
const carte = page.locator('div').filter({ hasText: /^Client Coordonnées/ }).last()
await page.waitForSelector('text=Client Coordonnées', { timeout: 8000 })
const texte = await page.textContent('body')

for (const [quoi, valeur] of [
  ['la personne contact', 'Luca Fortin'],
  ['le téléphone', TEL],
  ['le courriel', COURRIEL],
  ['l’adresse', ADRESSE],
]) {
  if (!texte.includes(valeur)) throw new Error(`${quoi} n’apparaît pas sur la fiche`)
  console.log(`OK: ${quoi} s’affiche`)
}

// ─── L'adresse n'est pas tronquée visuellement ───────────────────────────────
// Une adresse coupée à mi-rue ne sert à rien : elle doit passer à la ligne,
// pas disparaître derrière des points de suspension.
const mesure = await page.evaluate((adresse) => {
  const el = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === adresse)
  if (!el) return null
  const style = getComputedStyle(el)
  return {
    tronque: style.textOverflow === 'ellipsis' || style.whiteSpace === 'nowrap',
    debordeHorizontalement: el.scrollWidth > el.clientWidth + 1,
    hauteur: el.getBoundingClientRect().height,
    visible: el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().width > 0,
  }
}, ADRESSE)
console.log('Mesure de l’adresse :', JSON.stringify(mesure))
if (!mesure) throw new Error('l’adresse n’est pas rendue dans son propre élément')
if (!mesure.visible) throw new Error('l’adresse occupe une surface nulle à l’écran')
if (mesure.tronque) throw new Error('l’adresse est tronquée au lieu de passer à la ligne')
if (mesure.debordeHorizontalement) throw new Error('l’adresse déborde de sa carte')
if (mesure.hauteur < 20) throw new Error('une adresse aussi longue devrait occuper plusieurs lignes')
console.log(`OK: l’adresse passe à la ligne sans être coupée (${Math.round(mesure.hauteur)} px de haut)`)

// ─── Un client sans adresse n'affiche pas de ligne vide ─────────────────────
await page.click('button:has-text("Nouveau client")')
await page.waitForSelector('text=Nom du client', { timeout: 5000 })
await page.fill('input[placeholder="ex: Constructions Untel Inc."]', 'Client Sans Adresse')
await page.click('button[type="submit"]:has-text("Enregistrer")')
await page.waitForTimeout(1200)

const lignesVides = await page.evaluate(() => {
  const titre = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Client Sans Adresse')
  if (!titre) return null
  const carte = titre.closest('.card')
  // Un bloc d'icône sans texte à côté : c'est la ligne vide qu'on ne veut pas.
  return [...carte.querySelectorAll('div.flex.items-start, div.flex.items-center')]
    .filter(d => d.querySelector('svg') && d.textContent.trim() === '').length
})
console.log('Lignes de coordonnées vides :', lignesVides)
if (lignesVides === null) throw new Error('le client sans adresse est introuvable')
if (lignesVides > 0) throw new Error('une ligne de coordonnée vide s’affiche pour un champ absent')
console.log('OK: aucun champ absent ne laisse de ligne vide')

// ─── Sur téléphone, la carte reste lisible ───────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(600)
const debordement = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
if (debordement) throw new Error('la page déborde horizontalement sur un écran de téléphone')
if (!(await page.textContent('body')).includes(ADRESSE))
  throw new Error('l’adresse disparaît sur un écran de téléphone')
console.log('OK: sur téléphone, l’adresse reste affichée sans déborder')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ La fiche client affiche téléphone, courriel et adresse')
await browser.close()
