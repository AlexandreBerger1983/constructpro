// Tests du lien entre soumissions et projets.
import {
  soumissionsDuProjet, projetDeLaSoumission, totauxDesSoumissions,
  projetsProposables, prochainCodeProjet, projetDepuisSoumission,
} from './lienProjets.js'

let ok = 0, fail = 0
const eq = (label, got, want, tol = 0.001) => {
  const bon = typeof got === 'number' && typeof want === 'number'
    ? Math.abs(got - want) <= tol
    : JSON.stringify(got) === JSON.stringify(want)
  if (bon) { ok++; console.log(`OK   ${label} = ${JSON.stringify(got)}`) }
  else { fail++; console.log(`ÉCHEC ${label} : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`) }
}
const vrai = (label, cond) => {
  if (cond) { ok++; console.log(`OK   ${label}`) }
  else { fail++; console.log(`ÉCHEC ${label}`) }
}

const projets = [
  { id: 1, code: 'PRJ-2026-001', name: 'Centre Trépanier', client: 'Trépanier Inc.', clientId: 10 },
  { id: 2, code: 'PRJ-2026-002', name: 'Chalet Fortin',    client: 'Luca Fortin',   clientId: 20 },
  { id: 3, code: 'PRJ-2025-007', name: 'Ancien chantier',  client: 'Autre',          clientId: 30 },
]
const soumissions = [
  { id: 101, number: 'SOU-001', client: 'Luca Fortin', clientId: 20, projectId: 2, total: 12000, status: 'Acceptée', date: '2026-03-01' },
  { id: 102, number: 'SOU-002', client: 'Luca Fortin', clientId: 20, projectId: 2, total: 3500,  status: 'Envoyée',  date: '2026-05-10' },
  { id: 103, number: 'SOU-003', client: 'Luca Fortin', clientId: 20, projectId: 2, total: 9000,  status: 'Refusée',  date: '2026-02-01' },
  { id: 104, number: 'SOU-004', client: 'Trépanier Inc.', clientId: 10, projectId: 1, total: 50000, status: 'Acceptée', date: '2026-01-15' },
  { id: 105, number: 'SOU-005', client: 'Luca Fortin', clientId: 20, projectId: null, total: 800, status: 'Brouillon', date: '2026-06-01' },
]

// ─── Retrouver les soumissions d'un projet ──────────────────────────────────
const duChalet = soumissionsDuProjet(soumissions, 2)
eq('trois soumissions sur le chalet', duChalet.length, 3)
eq('la plus récente en tête', duChalet[0].number, 'SOU-002')
eq('la plus ancienne en queue', duChalet.at(-1).number, 'SOU-003')
vrai('aucune soumission d’un autre projet', duChalet.every(q => q.projectId === 2))
eq('un projet sans soumission', soumissionsDuProjet(soumissions, 3).length, 0)
eq('un identifiant absent ne ramène rien', soumissionsDuProjet(soumissions, null).length, 0)
eq('une liste absente ne plante pas', soumissionsDuProjet(undefined, 2).length, 0)
// Les identifiants peuvent arriver en texte depuis un <select>
eq('un identifiant en texte retrouve quand même', soumissionsDuProjet(soumissions, '2').length, 3)

// ─── Retrouver le projet d'une soumission ───────────────────────────────────
eq('le projet de SOU-001', projetDeLaSoumission(projets, soumissions[0]).name, 'Chalet Fortin')
vrai('une soumission non rattachée n’a pas de projet',
  projetDeLaSoumission(projets, soumissions[4]) === null)
vrai('un projet supprimé ne plante pas',
  projetDeLaSoumission(projets, { projectId: 999 }) === null)
vrai('aucune soumission ne plante', projetDeLaSoumission(projets, undefined) === null)

// ─── Totaux : une soumission refusée n'engage rien ──────────────────────────
const t = totauxDesSoumissions(duChalet)
console.log(`Chalet : ${t.nombre} soumissions retenues, ${t.total} $ dont ${t.totalAccepte} $ acceptés`)
eq('la refusée est écartée du compte', t.nombre, 2)
eq('et de la somme', t.total, 15500)
eq('une seule acceptée', t.nombreAcceptees, 1)
eq('le montant accepté', t.totalAccepte, 12000)
vrai('le montant accepté ne dépasse jamais le total', t.totalAccepte <= t.total)
eq('aucune soumission : tout à zéro', totauxDesSoumissions([]), { nombre: 0, nombreAcceptees: 0, total: 0, totalAccepte: 0 })
eq('des montants abîmés comptent pour zéro',
  totauxDesSoumissions([{ total: 'abc' }, { total: 100 }]).total, 100)

// ─── Les projets proposés : ceux du client d'abord ──────────────────────────
const proposes = projetsProposables(projets, soumissions[0])
eq('tous les projets restent proposables', proposes.length, 3)
eq('celui du client vient en tête', proposes[0].name, 'Chalet Fortin')
vrai('les autres suivent', proposes.slice(1).every(p => p.clientId !== 20))
// Rattachement par nom quand l'identifiant manque (soumissions anciennes)
eq('le nom du client sert à défaut d’identifiant',
  projetsProposables(projets, { client: 'Trépanier Inc.' })[0].name, 'Centre Trépanier')
eq('une soumission sans client ne plante pas', projetsProposables(projets, {}).length, 3)
eq('aucun projet ne plante', projetsProposables(undefined, soumissions[0]).length, 0)

// ─── Code du prochain projet ────────────────────────────────────────────────
eq('suit la numérotation de l’année', prochainCodeProjet(projets, 2026), 'PRJ-2026-003')
eq('une année sans projet repart à 001', prochainCodeProjet(projets, 2027), 'PRJ-2027-001')
eq('aucun projet : premier code', prochainCodeProjet([], 2026), 'PRJ-2026-001')

// ─── Créer un projet depuis une soumission ──────────────────────────────────
const nouveau = projetDepuisSoumission(
  { number: 'SOU-009', title: 'Rénovation cuisine', client: 'Luca Fortin', clientId: 20, total: 24500 },
  projets)
eq('le titre de la soumission devient le nom du projet', nouveau.name, 'Rénovation cuisine')
eq('le client suit', nouveau.client, 'Luca Fortin')
eq('l’identifiant du client aussi', nouveau.clientId, 20)
eq('le budget part du total de la soumission', nouveau.budgetTotal, 24500)
eq('rien n’est encore dépensé', nouveau.budgetSpent, 0)
eq('le projet démarre en préparation', nouveau.status, 'En préparation')
eq('le code suit la numérotation', nouveau.code, 'PRJ-2026-003')
vrai('la soumission d’origine est citée', /SOU-009/.test(nouveau.description))
vrai('aucune date n’est inventée', nouveau.startDate === '' && nouveau.endDate === '')
vrai('les listes de phases et de tâches existent',
  Array.isArray(nouveau.phases) && Array.isArray(nouveau.tasks))

// Une soumission sans titre ne donne pas un projet sans nom
const sansTitre = projetDepuisSoumission({ client: 'Luca Fortin', total: 100 }, projets)
vrai('un projet sans titre reçoit quand même un nom', sansTitre.name.length > 0)
vrai('et il nomme le client', /Luca Fortin/.test(sansTitre.name))
const vide = projetDepuisSoumission(undefined, [])
vrai('aucune soumission ne plante', vide.name.length > 0 && vide.budgetTotal === 0)

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ Lien soumission ↔ projet correct')
