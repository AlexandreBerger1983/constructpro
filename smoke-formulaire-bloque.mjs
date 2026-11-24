// Vérifie qu'un formulaire ne devient jamais un cul-de-sac.
//
// Le cas réel qui a motivé ce parcours : une entreprise qui démarre avait
// 22 employés et aucun projet. Le champ « Projet » d'une feuille de temps est
// obligatoire et sa liste vient des projets : le formulaire refusait
// d'enregistrer, sans jamais dire pourquoi. On pouvait y passer un moment.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const vider = () => page.evaluate(() => {
  localStorage.setItem('cp-donnees-v1', JSON.stringify({
    clients: [], projects: [], timesheets: [], materials: [],
    subcontractors: [], documents: [], quotes: [], invoices: [], employees: [],
  }))
})

// ─── Base entièrement vide : DEUX listes manquent d'un coup ─────────────────
// La formulation au pluriel est un cas à part dans le code ; sans ce passage
// elle ne serait jamais exercée.
await page.goto(base + '/')
await page.waitForTimeout(1500)
await vider()
await page.reload()
await page.waitForTimeout(1600)
await page.goto(base + '/feuilles-de-temps')
await page.waitForTimeout(1300)
await page.locator('button').filter({ hasText: /Saisir|Nouve|Ajouter/ }).first().click()
await page.waitForTimeout(900)

const deuxVides = await page.textContent('body')
if (!/employé et projet/.test(deuxVides))
  throw new Error('les deux champs manquants devraient être nommés tous les deux')
if (!/ces listes sont vides/.test(deuxVides))
  throw new Error('le pluriel devrait être employé quand deux listes manquent')
if (!/un employé actif dans l’écran Employés et un projet dans l’écran Projets/.test(deuxVides))
  throw new Error('les deux prérequis devraient être énoncés')
console.log('OK: deux listes vides sont annoncées ensemble, au pluriel')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// ─── Base d'une entreprise qui démarre : des employés, rien d'autre ──────────
await page.evaluate(() => {
  localStorage.setItem('cp-donnees-v1', JSON.stringify({
    clients: [], projects: [], timesheets: [], materials: [],
    subcontractors: [], documents: [], quotes: [], invoices: [],
    employees: Array.from({ length: 22 }, (_, i) => ({
      id: i + 1, name: `Employé ${i + 1}`, role: 'Charpentier',
      hourlyRate: 30, status: 'Actif', phone: '', email: '', hiredAt: '2026-01-15',
    })),
  }))
})
await page.reload()
await page.waitForTimeout(1800)

// ─── Saisir des heures sans aucun projet ─────────────────────────────────────
await page.goto(base + '/feuilles-de-temps')
await page.waitForTimeout(1300)
await page.locator('button').filter({ hasText: /Saisir|Nouve|Ajouter/ }).first().click()
await page.waitForTimeout(900)

const corps = await page.textContent('body')
if (!/Impossible d'enregistrer/.test(corps))
  throw new Error('rien n’annonce que l’enregistrement est impossible')
console.log('OK: le formulaire annonce d’emblée qu’il ne peut pas enregistrer')

if (!/créez d'abord un projet/i.test(corps))
  throw new Error('le message ne dit pas quoi faire — il devrait nommer le prérequis')
console.log('OK: il nomme le prérequis, et où le créer')

// Le menu vide est remplacé par une explication, pas laissé vide
if (!/Aucun choix disponible/.test(corps))
  throw new Error('le menu vide ne s’explique pas')
console.log('OK: le menu sans choix s’explique au lieu d’être vide')

// Le bouton est désactivé : on ne laisse pas cliquer pour rien
const bouton = page.locator('button[type="submit"]')
if (!(await bouton.isDisabled()))
  throw new Error('le bouton d’enregistrement devrait être désactivé')
console.log('OK: le bouton d’enregistrement est désactivé')

// Le champ « Employé », lui, a bien ses 22 choix : seul le projet bloque.
// On reste dans la fenêtre (`.fixed`) : l'écran porte aussi des filtres, et
// celui des employés n'offre que « Tous » quand aucune heure n'est saisie.
const employes = await page.locator('.fixed select').first().locator('option').count()
console.log(`Choix d’employés proposés : ${employes}`)
if (employes < 20) throw new Error('la liste des employés devrait être remplie')
console.log('OK: seul le champ réellement vide est bloqué, pas le formulaire entier')

await page.keyboard.press('Escape')
await page.waitForTimeout(600)

// ─── Une fois le prérequis créé, la saisie passe ─────────────────────────────
await page.goto(base + '/clients')
await page.waitForTimeout(1100)
await page.click('button:has-text("Nouveau client")')
await page.waitForSelector('text=Nom du client', { timeout: 5000 })
await page.fill('input[placeholder="ex: Constructions Untel Inc."]', 'Premier client')
await page.click('button[type="submit"]:has-text("Enregistrer")')
await page.waitForTimeout(1100)

await page.goto(base + '/projets')
await page.waitForTimeout(1100)
await page.locator('button').filter({ hasText: /Nouveau projet/ }).first().click()
await page.waitForTimeout(900)
// Le client existe maintenant : plus aucun blocage sur ce formulaire
if (/Impossible d'enregistrer/.test(await page.textContent('body')))
  throw new Error('le formulaire de projet bloque alors qu’un client existe')
console.log('OK: dès qu’un client existe, le formulaire de projet se débloque')

await page.fill('input[placeholder*="Rénovation"], input[name="name"]', 'Premier chantier').catch(() => {})
const champs = page.locator('.fixed input[type="text"], .fixed input:not([type])')
await champs.first().fill('Premier chantier')
await page.locator('.fixed select').first().selectOption({ index: 1 })
await page.click('button[type="submit"]')
await page.waitForTimeout(1300)

const projets = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('cp-donnees-v1') || '{}').projects ?? []))
if (projets.length !== 1) throw new Error(`${projets.length} projets créés au lieu d’un`)
console.log(`OK: le projet « ${projets[0].name} » est créé (${projets[0].code})`)

// ─── La saisie d'heures fonctionne enfin ─────────────────────────────────────
await page.goto(base + '/feuilles-de-temps')
await page.waitForTimeout(1300)
await page.locator('button').filter({ hasText: /Saisir|Nouve|Ajouter/ }).first().click()
await page.waitForTimeout(900)

const corpsApres = await page.textContent('body')
if (/Impossible d'enregistrer/.test(corpsApres))
  throw new Error('la saisie d’heures bloque encore alors qu’un projet existe')
if (await page.locator('button[type="submit"]').isDisabled())
  throw new Error('le bouton est encore désactivé')
console.log('OK: avec un projet, la saisie d’heures se débloque')

const choixProjet = await page.locator('.fixed select').nth(1).locator('option').count()
if (choixProjet < 2) throw new Error('le menu des projets est encore vide')
console.log('OK: le projet créé apparaît dans la liste')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Aucun formulaire ne reste un cul-de-sac silencieux')
await browser.close()
