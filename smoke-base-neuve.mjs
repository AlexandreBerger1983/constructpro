// Audit de l'application telle qu'elle sera au PREMIER usage réel.
//
// Les autres parcours s'exécutent sur les données d'exemple, bien remplies et
// cohérentes. Une entreprise qui démarre n'a pas ça : quelques employés
// saisis, et rien d'autre. C'est précisément là que les applications
// déraillent — divisions par zéro, moyennes sur une liste vide, écrans sans
// message quand il n'y a rien à montrer.
//
// Ce parcours reconstitue la forme réelle de la base de l'entreprise
// (22 employés, aucune feuille de temps, presque rien d'autre), visite chaque
// écran et signale tout ce qui n'a pas de sens à lire : NaN, undefined,
// Infinity, pourcentages absurdes, ainsi que les erreurs JavaScript.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE || 'http://localhost:4173/constructpro/') + '#'

const ECRANS = [
  ['/', 'Tableau de bord'],
  ['/projets', 'Projets'],
  ['/estimateur', 'Estimateur'],
  ['/soumissions', 'Soumissions'],
  ['/facturation', 'Facturation'],
  ['/clients', 'Clients'],
  ['/employes', 'Employés'],
  ['/feuilles-de-temps', 'Feuilles de temps'],
  ['/paie', 'Paie & Heures'],
  ['/materiaux', 'Matériaux'],
  ['/sous-traitants', 'Sous-traitants'],
  ['/calendrier', 'Calendrier'],
  ['/documents', 'Documents'],
  ['/rapports', 'Rapports'],
  ['/parametres', 'Paramètres'],
]

// Ce qu'un utilisateur ne doit jamais lire à l'écran.
const ABERRATIONS = [
  { motif: /NaN/,                    quoi: 'NaN' },
  { motif: /\bundefined\b/,          quoi: 'undefined' },
  { motif: /\bInfinity\b/,           quoi: 'Infinity' },
  { motif: /\[object Object\]/,      quoi: '[object Object]' },
  { motif: /Invalid Date/,           quoi: 'Invalid Date' },
  { motif: /\bnull\b(?!e)/,          quoi: 'null' },
]

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })

const erreursJs = []
page.on('pageerror', e => erreursJs.push(`${page.url().split('#')[1] ?? '/'} — ${e.message}`))
page.on('console', m => { if (m.type() === 'error') erreursJs.push(`${page.url().split('#')[1] ?? '/'} — console: ${m.text()}`) })

// ─── Reconstituer la base d'une entreprise qui démarre ───────────────────────
await page.goto(base + '/')
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const employes = Array.from({ length: 22 }, (_, i) => ({
    id: i + 1,
    name: `Employé ${i + 1}`,
    role: ['Charpentier', 'Manœuvre', 'Contremaître', 'Électricien'][i % 4],
    hourlyRate: 28 + (i % 5) * 2,
    status: 'Actif',
    phone: '', email: '', hiredAt: '2026-01-15',
  }))
  localStorage.setItem('cp-donnees-v1', JSON.stringify({
    clients: [{ id: 1, name: 'Premier client', type: 'Particulier', status: 'Actif',
                phone: '', email: '', address: '', contact: '', neq: '', ca: 0,
                since: '2026-11-01', notes: '' }],
    projects: [],
    employees: employes,
    timesheets: [],
    materials: [],
    subcontractors: [],
    documents: [],
    quotes: [],
    invoices: [],
  }))
  // Ni paramètres d'entreprise, ni prix personnalisés : tout est neuf.
  localStorage.removeItem('cp-devis-enregistres')
  localStorage.removeItem('cp-catalogue-prix')
})
await page.reload()
await page.waitForTimeout(2000)
console.log('Base reconstituée : 22 employés, 1 client, rien d’autre\n')

// ─── Visiter chaque écran ────────────────────────────────────────────────────
const trouvailles = []
for (const [route, nom] of ECRANS) {
  await page.goto(base + route)
  await page.waitForTimeout(1300)

  const corps = await page.textContent('body')
  const vues = ABERRATIONS.filter(a => a.motif.test(corps)).map(a => a.quoi)

  // Un écran vide doit DIRE qu'il est vide, pas rester muet.
  const contenu = corps.replace(/\s+/g, ' ').trim()
  const muet = contenu.length < 400

  const etat = vues.length ? `⚠ ${vues.join(', ')}` : (muet ? '⚠ écran presque muet' : 'ok')
  console.log(`${nom.padEnd(22)} ${etat}`)
  if (vues.length) trouvailles.push({ nom, route, quoi: vues.join(', ') })
  if (muet) trouvailles.push({ nom, route, quoi: 'écran presque muet' })
}

// ─── Les écrans vides proposent-ils quelque chose ? ─────────────────────────
console.log('\n── Écrans sans données : disent-ils quoi faire ? ──')
for (const [route, nom] of [['/projets', 'Projets'], ['/soumissions', 'Soumissions'],
                            ['/materiaux', 'Matériaux'], ['/feuilles-de-temps', 'Feuilles de temps'],
                            ['/facturation', 'Facturation'], ['/documents', 'Documents'],
                            ['/sous-traitants', 'Sous-traitants']]) {
  await page.goto(base + route)
  await page.waitForTimeout(1100)
  const corps = await page.textContent('body')
  const diteVide = /[Aa]ucun|[Vv]ide|[Pp]as encore|[Cc]ommencez|premier/.test(corps)
  // « Téléverser » compte aussi : l'écran Documents ajoute par là, et ma
  // première liste de mots l'ignorait — un faux positif, pas un défaut.
  const boutonAjout = await page.locator('button, a').filter({ hasText: /Nouve|Ajouter|Créer|Saisir|Téléverser|Estimateur/ }).count()
  console.log(`${nom.padEnd(22)} message: ${diteVide ? 'oui' : 'NON'} · bouton d’ajout: ${boutonAjout > 0 ? 'oui' : 'NON'}`)
  if (!diteVide) trouvailles.push({ nom, route, quoi: 'aucun message quand il n’y a rien' })
  if (boutonAjout === 0) trouvailles.push({ nom, route, quoi: 'aucun moyen d’ajouter' })
}

// ─── Bilan ───────────────────────────────────────────────────────────────────
console.log(`\n── Bilan ──`)
console.log(`Erreurs JavaScript : ${erreursJs.length}`)
for (const e of [...new Set(erreursJs)].slice(0, 15)) console.log(`  • ${e}`)
console.log(`\nAnomalies d’affichage : ${trouvailles.length}`)
for (const t of trouvailles) console.log(`  • ${t.nom} (${t.route}) — ${t.quoi}`)

await browser.close()
if (erreursJs.length || trouvailles.length) process.exit(1)
console.log('\n✅ Aucune anomalie sur une base neuve')
