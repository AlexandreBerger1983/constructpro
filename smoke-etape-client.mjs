// Vérifie l'étape « client » du devis rapide : les coordonnées complètes des
// clients existants, le choix MULTIPLE des genres de travaux, et le fait que
// chaque pastille affiche bien son icône plutôt qu'un carré vide.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const ADRESSE = '88 rue des Pins, Saint-Jérôme, QC J7Z 5T4'
const COURRIEL = 'fortin@exemple.ca'
const TEL = '581-309-3695'
const devisEnregistres = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('cp-devis-enregistres') || '[]'))

// ─── Un client complet, et un sans coordonnées ───────────────────────────────
await page.goto(base + '/clients')
await page.waitForSelector('text=Nouveau client', { timeout: 10000 })
const creerClient = async (nom, avecCoordonnees) => {
  await page.click('button:has-text("Nouveau client")')
  await page.waitForSelector('text=Nom du client', { timeout: 5000 })
  await page.fill('input[placeholder="ex: Constructions Untel Inc."]', nom)
  if (avecCoordonnees) {
    await page.fill('input[placeholder="ex: 514-555-1234"]', TEL)
    await page.fill('input[placeholder="ex: info@client.ca"]', COURRIEL)
    await page.fill('input[placeholder="ex: 123 rue Principale, Montréal, QC"]', ADRESSE)
  }
  await page.click('button[type="submit"]:has-text("Enregistrer")')
  await page.waitForTimeout(1000)
}
await creerClient('Luca Fortin', true)
await creerClient('Client Sans Coordonnées', false)

// ─── La liste du devis montre les coordonnées ────────────────────────────────
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Nouveau devis', { timeout: 8000 })
await page.click('text=Nouveau devis')
await page.waitForSelector('text=Pour qui est ce devis ?', { timeout: 5000 })
// Cibler le BOUTON et non le texte : « text=… » atteint le <p> intérieur
// sans toujours déclencher le bouton qui le contient.
await page.locator('button').filter({ hasText: 'Client existant' }).first().click()
await page.waitForTimeout(700)

const corps = await page.textContent('body')
for (const [quoi, valeur] of [['le téléphone', TEL], ['le courriel', COURRIEL], ['l’adresse', ADRESSE]]) {
  if (!corps.includes(valeur)) throw new Error(`${quoi} n’apparaît pas dans la liste des clients du devis`)
  console.log(`OK: ${quoi} s’affiche dans la liste du devis`)
}

// Un client sans coordonnées ne doit pas afficher un « · » orphelin
const orphelin = await page.evaluate(() => {
  const titre = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Client Sans Coordonnées')
  if (!titre) return null
  return [...titre.parentElement.querySelectorAll('p')]
    .some(p => /^[·\s]+$/.test(p.textContent))
})
if (orphelin === null) throw new Error('le client sans coordonnées est introuvable')
if (orphelin) throw new Error('un séparateur « · » orphelin s’affiche sous un client sans coordonnées')
console.log('OK: aucun séparateur orphelin sous un client sans coordonnées')

// ─── Les pastilles de genre affichent toutes leur icône ──────────────────────
await page.locator('button', { hasText: 'Luca Fortin' }).first().click()
await page.waitForSelector('text=Quel genre de travaux ?', { timeout: 5000 })

// Un caractère que la police ne connaît pas se rend en « tofu ». On ne peut
// pas le voir depuis le DOM, mais on peut refuser tout emoji trop récent :
// c'est la cause réelle du carré vide sur « Planchers ».
const recents = await page.evaluate(() => {
  const risque = /[\u{1FA70}-\u{1FAFF}\u{1F9D0}-\u{1F9FF}\u{1F7E0}-\u{1F7EB}\u{1F6D5}-\u{1F6DF}]/u
  return [...document.querySelectorAll('button span')]
    .map(s => s.textContent.trim())
    .filter(t => risque.test(t))
})
console.log('Icônes trop récentes pour une police ancienne :', recents.length ? recents : 'aucune')
if (recents.length) throw new Error(`icône(s) à risque de carré vide : ${recents.join(' ')}`)
console.log('OK: toutes les icônes datent d’avant 2018 — aucun carré vide possible')

// Chaque pastille a bien une icône non vide
const sansIcone = await page.evaluate(() => {
  const pastilles = [...document.querySelectorAll('button[aria-pressed]')]
  return pastilles.filter(b => !b.querySelector('span')?.textContent.trim()).length
})
if (sansIcone > 0) throw new Error(`${sansIcone} pastille(s) sans icône`)
console.log('OK: chaque pastille porte une icône')

// ─── Choix MULTIPLE des genres ───────────────────────────────────────────────
const pastille = (nom) => page.locator(`button[aria-pressed]`).filter({ hasText: nom }).first()
const choisis = () => page.locator('button[aria-pressed="true"]').count()

await pastille('Peinture').click()
await page.waitForTimeout(300)
if (await choisis() !== 1) throw new Error('le premier genre ne s’est pas sélectionné')

await pastille('Planchers').click()
await page.waitForTimeout(300)
const apresDeux = await choisis()
console.log(`Genres sélectionnés après deux clics : ${apresDeux}`)
if (apresDeux !== 2)
  throw new Error(`le second clic devrait ajouter un genre, pas remplacer (${apresDeux} sélectionné)`)
console.log('OK: un second genre s’ajoute au lieu de remplacer le premier')

await pastille('Toiture').click()
await page.waitForTimeout(300)
if (await choisis() !== 3) throw new Error('le troisième genre ne s’ajoute pas')

// Le récapitulatif annonce le compte
const recap = await page.textContent('body')
if (!/3 genres choisis/.test(recap))
  throw new Error('le nombre de genres choisis n’est pas annoncé')
if (!/Peinture · Planchers · Toiture/.test(recap))
  throw new Error('les genres choisis ne sont pas listés dans l’ordre de sélection')
console.log('OK: le récapitulatif liste les trois genres dans l’ordre choisi')

// Recliquer retire
await pastille('Planchers').click()
await page.waitForTimeout(300)
if (await choisis() !== 2) throw new Error('recliquer une pastille ne la désélectionne pas')
console.log('OK: recliquer une pastille la retire')

// ─── Les genres suivent jusqu'au devis enregistré ────────────────────────────
await page.click('text=Continuer')
await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 5000 })
await page.locator('button:has-text("Salle de bain")').last().click()
await page.waitForSelector('text=Surface de plancher', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 5000 })
await page.locator('button').filter({ has: page.locator('p:text-is("Peinture")') }).first().click()
await page.waitForTimeout(400)
await page.click('text=Peinture murs — 2 couches (apprêt + finition)')
await page.waitForSelector('text=Travaux choisis', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('button:has-text("Enregistrer")', { timeout: 8000 })

const surDevis = await page.textContent('body')
if (!/Travaux : Peinture · Toiture/.test(surDevis))
  throw new Error('le devis n’affiche pas les deux genres retenus')
console.log('OK: le devis affiche les genres retenus')

await page.click('button:has-text("Enregistrer")')
await page.waitForSelector('text=Devis enregistré', { timeout: 8000 })
await page.waitForTimeout(2400)

const devis = (await devisEnregistres()).at(-1)
console.log('projectType enregistré :', JSON.stringify(devis.projectType))
if (typeof devis.projectType !== 'string')
  throw new Error('le genre doit rester enregistré en texte, pour les écrans qui le lisent')
if (devis.projectType !== 'Peinture · Toiture')
  throw new Error(`genres enregistrés : « ${devis.projectType} »`)
console.log('OK: les genres sont enregistrés en texte, lisibles par les écrans existants')

// La liste des devis enregistrés les affiche
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Mes devis enregistrés', { timeout: 8000 })
if (!(await page.textContent('body')).includes('Peinture · Toiture'))
  throw new Error('la liste des devis n’affiche pas les genres')
console.log('OK: la liste des devis enregistrés affiche les genres')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Coordonnées complètes, choix multiple des genres, icônes sûres')
await browser.close()
