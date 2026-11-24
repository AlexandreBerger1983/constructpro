// Vérifie que les coordonnées complètes du client et la signature de
// l'entreprise figurent partout où la soumission est remise au client :
// à l'écran, à l'impression, et dans les fichiers Excel et Word.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const DOSSIER = '/tmp/export-coordonnees'
const errors = []

const CLIENT = {
  nom: 'Gestion Fortin Inc.',
  contact: 'Luca Fortin',
  tel: '581-309-3695',
  courriel: 'luca.fortin@exemple.ca',
  adresse: '88 rue des Pins, Saint-Jérôme, QC J7Z 5T4',
}
const SIGNATAIRE = 'Alexandre Berger'

rmSync(DOSSIER, { recursive: true, force: true })
mkdirSync(DOSSIER, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

// ─── Renseigner le signataire ────────────────────────────────────────────────
await page.goto(base + '/parametres')
await page.waitForSelector('text=Signataire des soumissions', { timeout: 10000 })
await page.fill('input[placeholder="ex: Alexandre Berger"]', SIGNATAIRE)
await page.waitForTimeout(500)

// L'aperçu doit s'afficher dans la police d'écriture, pas dans celle du reste
const policeApercu = await page.evaluate(() => {
  const el = document.querySelector('.signature-manuscrite')
  return el ? getComputedStyle(el).fontFamily : null
})
console.log('Police de l’aperçu :', policeApercu)
if (!policeApercu) throw new Error('aucun aperçu de signature dans les Paramètres')
if (!/script|hand|cursive|chancery|comic/i.test(policeApercu))
  throw new Error(`la police d’aperçu n’est pas une écriture manuscrite : ${policeApercu}`)
console.log('OK: l’aperçu du signataire utilise une police d’écriture')
await page.click('button:has-text("Enregistrer")')
await page.waitForTimeout(800)

// ─── Un client avec toutes ses coordonnées ───────────────────────────────────
await page.goto(base + '/clients')
await page.waitForSelector('text=Nouveau client', { timeout: 10000 })
await page.click('button:has-text("Nouveau client")')
await page.waitForSelector('text=Nom du client', { timeout: 5000 })
await page.fill('input[placeholder="ex: Constructions Untel Inc."]', CLIENT.nom)
await page.fill('input[placeholder="ex: Jean Tremblay"]', CLIENT.contact)
await page.fill('input[placeholder="ex: 514-555-1234"]', CLIENT.tel)
await page.fill('input[placeholder="ex: info@client.ca"]', CLIENT.courriel)
await page.fill('input[placeholder="ex: 123 rue Principale, Montréal, QC"]', CLIENT.adresse)
await page.click('button[type="submit"]:has-text("Enregistrer")')
await page.waitForTimeout(1000)

// ─── Un devis pour ce client ─────────────────────────────────────────────────
await page.goto(base + '/estimateur')
await page.waitForSelector('text=Nouveau devis', { timeout: 8000 })
await page.click('text=Nouveau devis')
await page.waitForSelector('text=Pour qui est ce devis ?', { timeout: 5000 })
await page.locator('button').filter({ hasText: 'Client existant' }).first().click()
await page.waitForTimeout(600)
await page.locator('button').filter({ hasText: CLIENT.nom }).first().click()
await page.waitForTimeout(400)
await page.locator('button[aria-pressed]').filter({ hasText: 'Cuisine' }).first().click()
await page.click('text=Continuer')
await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 5000 })
await page.locator('button:has-text("Cuisine")').last().click()
await page.waitForSelector('text=Surface de plancher', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 5000 })
await page.locator('button').filter({ has: page.locator('p:text-is("Peinture")') }).first().click()
await page.waitForTimeout(400)
await page.click('text=Peinture murs — 2 couches (apprêt + finition)')
await page.waitForSelector('text=Travaux choisis', { timeout: 5000 })
await page.click('text=Continuer')
await page.waitForSelector('button:has-text("Enregistrer")', { timeout: 8000 })

// La signature figure sur le devis de l'estimateur
const surDevis = await page.textContent('body')
if (!surDevis.includes(SIGNATAIRE))
  throw new Error('le signataire n’apparaît pas sur le devis de l’estimateur')
console.log('OK: le devis de l’estimateur porte la signature')

await page.click('button:has-text("Enregistrer")')
await page.waitForSelector('text=Devis enregistré', { timeout: 8000 })
await page.waitForTimeout(2400)

// ─── La soumission affiche toutes les coordonnées ────────────────────────────
await page.goto(base + '/soumissions')
await page.waitForSelector('table', { timeout: 10000 })
await page.locator('tr', { hasText: CLIENT.nom }).first().click()
await page.waitForSelector('text=Retour aux soumissions', { timeout: 10000 })
await page.waitForTimeout(800)

const fiche = await page.textContent('body')
for (const [quoi, valeur] of [
  ['le nom', CLIENT.nom], ['la personne contact', CLIENT.contact],
  ['l’adresse', CLIENT.adresse], ['le téléphone', CLIENT.tel], ['le courriel', CLIENT.courriel],
]) {
  if (!fiche.includes(valeur)) throw new Error(`${quoi} n’apparaît pas sur la soumission`)
  console.log(`OK: la soumission affiche ${quoi}`)
}
if (!fiche.includes(SIGNATAIRE)) throw new Error('la signature n’apparaît pas sur la soumission')
console.log('OK: la soumission porte la signature')

// Elle doit rester visible à l'impression — c'est le PDF du client
const masqueALImpression = await page.evaluate((nom) => {
  const el = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === nom)
  if (!el) return 'introuvable'
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.classList?.contains('no-print')) return 'masqué'
  }
  return 'imprimé'
}, SIGNATAIRE)
if (masqueALImpression !== 'imprimé')
  throw new Error(`la signature est ${masqueALImpression} à l’impression`)
console.log('OK: la signature fait partie de ce qui s’imprime (le PDF du client)')

// ─── Excel et Word ───────────────────────────────────────────────────────────
for (const [bouton, extension] of [['Excel', 'xlsx'], ['Word', 'docx']]) {
  const attente = page.waitForEvent('download', { timeout: 45000 })
  await page.click(`button:has-text("${bouton}")`)
  const fichier = await attente
  const chemin = `${DOSSIER}/soumission.${extension}`
  await fichier.saveAs(chemin)
  if (!existsSync(chemin)) throw new Error(`${bouton} : aucun fichier produit`)
  console.log(`OK: ${bouton} téléchargé → ${fichier.suggestedFilename()}`)
}

const texte = execFileSync('python3', ['-I', 'verif-coordonnees.py', DOSSIER, SIGNATAIRE,
  CLIENT.nom, CLIENT.contact, CLIENT.adresse, CLIENT.tel, CLIENT.courriel], { encoding: 'utf-8' })
console.log(texte.trim())

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Coordonnées du client et signature présentes à l’écran, en Excel et en Word')
await browser.close()
