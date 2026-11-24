// Tests de la tarification d'une ligne : surface, forfaits, prix minimum.
import {
  MODE_SURFACE, MODES_FORFAIT, MODES, estForfait, forfaitDe,
  montantLigne, repartitionLigne, modesDisponibles, explicationMode,
} from './tarification.js'
import { lineTotal } from '../components/estimator/estimatorUtils.js'
import { lineAmount } from './quoteCosting.js'

let ok = 0, fail = 0
const eq = (label, got, want, tol = 0) => {
  if (typeof got === 'number' && Math.abs(got - want) <= tol) { ok++; console.log(`OK   ${label} = ${got}`) }
  else if (JSON.stringify(got) === JSON.stringify(want)) { ok++; console.log(`OK   ${label} = ${JSON.stringify(got)}`) }
  else { fail++; console.log(`ÉCHEC ${label} : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`) }
}
const vrai = (label, cond) => {
  if (cond) { ok++; console.log(`OK   ${label}`) }
  else { fail++; console.log(`ÉCHEC ${label}`) }
}

// Une ligne de peinture : 180 pi² à 5,11 $ de main-d'œuvre et 1,20 $ de
// matériaux, avec les trois forfaits et un plancher renseignés.
const peinture = {
  qty: 180, unitMat: 1.2, unitLabor: 5.11,
  forfaitPetit: 350, forfaitMoyen: 650, forfaitGros: 1200, min: 250,
}
const SURFACE = +(180 * (1.2 + 5.11)).toFixed(2)   // 1 135,80

// ─── Mode à la surface : le comportement d'origine, inchangé ────────────────
eq('à la surface', montantLigne({ ...peinture, mode: MODE_SURFACE }), SURFACE, 0.01)
eq('sans mode, c’est la surface', montantLigne(peinture), SURFACE, 0.01)
eq('un mode inconnu retombe sur la surface',
  montantLigne({ ...peinture, mode: 'fantaisie' }), SURFACE, 0.01)

// Le plancher s'applique toujours en mode surface
eq('le plancher s’applique à une petite quantité',
  montantLigne({ ...peinture, qty: 1, mode: MODE_SURFACE }), 250, 0.01)
eq('le plancher ne s’applique pas à une grande quantité',
  montantLigne({ ...peinture, mode: MODE_SURFACE }), SURFACE, 0.01)

// ─── Forfaits : le montant fixe remplace tout ───────────────────────────────
eq('petit travail', montantLigne({ ...peinture, mode: 'petit' }), 350)
eq('travail moyen', montantLigne({ ...peinture, mode: 'moyen' }), 650)
eq('gros travail', montantLigne({ ...peinture, mode: 'gros' }), 1200)
eq('prix minimum choisi', montantLigne({ ...peinture, mode: 'minimum' }), 250)
vrai('un forfait ignore la superficie',
  montantLigne({ ...peinture, mode: 'moyen', qty: 9999 }) === 650)
vrai('un forfait ignore une quantité nulle',
  montantLigne({ ...peinture, mode: 'moyen', qty: 0 }) === 650)

// ─── Le garde-fou : un forfait non renseigné ne donne jamais zéro ───────────
// Choisir « Gros travail » sur un article dont le forfait est vide donnerait
// une ligne gratuite, et la soumission part chez un client.
const sansForfait = { qty: 180, unitMat: 1.2, unitLabor: 5.11 }
eq('un forfait absent retombe sur la surface',
  montantLigne({ ...sansForfait, mode: 'gros' }), SURFACE, 0.01)
eq('un forfait à zéro retombe sur la surface',
  montantLigne({ ...sansForfait, mode: 'gros', forfaitGros: 0 }), SURFACE, 0.01)
vrai('aucune ligne ne devient gratuite par choix de mode',
  MODES.every(m => montantLigne({ ...sansForfait, mode: m.cle }) > 0))
vrai('forfaitDe rend null quand le montant manque',
  forfaitDe({ ...sansForfait, mode: 'gros' }) === null)
vrai('forfaitDe rend null en mode surface', forfaitDe({ ...peinture, mode: MODE_SURFACE }) === null)

// ─── Reconnaissance des modes ───────────────────────────────────────────────
vrai('« petit » est un forfait', estForfait('petit'))
vrai('« minimum » est un forfait', estForfait('minimum'))
vrai('« surface » n’est pas un forfait', !estForfait(MODE_SURFACE))
vrai('rien n’est pas un forfait', !estForfait(undefined) && !estForfait(null) && !estForfait(''))
eq('cinq modes au total', MODES.length, 5)
vrai('chaque forfait a un champ et un libellé',
  Object.values(MODES_FORFAIT).every(m => m.champ && m.label && m.court))

// ─── Modes proposés selon ce qui est renseigné ──────────────────────────────
eq('tous les modes sur un article complet', modesDisponibles(peinture).length, 5)
eq('un article sans forfait n’offre que la surface', modesDisponibles(sansForfait).length, 1)
eq('un article avec le seul minimum en offre deux',
  modesDisponibles({ min: 250 }).map(m => m.cle), [MODE_SURFACE, 'minimum'])
eq('un article sans rien offre quand même la surface',
  modesDisponibles({}).map(m => m.cle), [MODE_SURFACE])
eq('aucun article ne plante', modesDisponibles(undefined).length, 1)

// ─── Répartition matériaux / main-d'œuvre ───────────────────────────────────
// Le devis totalise les deux séparément et la feuille de coûts les ventile :
// un forfait doit donc se répartir, et les deux parts faire exactement le
// total, sinon la feuille affiche « ERREUR ».
for (const mode of [MODE_SURFACE, 'petit', 'moyen', 'gros', 'minimum']) {
  const ligne = { ...peinture, mode }
  const { materiel, mo } = repartitionLigne(ligne)
  const total = montantLigne(ligne)
  eq(`${mode} : les deux parts font le total`, +(materiel + mo).toFixed(2), total, 0.001)
  vrai(`${mode} : aucune part négative`, materiel >= 0 && mo >= 0)
}
// Le prorata suit les prix unitaires : ici la main-d'œuvre pèse 81 %
const r = repartitionLigne({ ...peinture, mode: 'moyen' })
console.log(`Forfait de 650 $ réparti : ${r.materiel} $ de matériaux, ${r.mo} $ de main-d’œuvre`)
eq('matériaux au prorata (1,20 / 6,31)', r.materiel, +(650 * 1.2 / 6.31).toFixed(2), 0.01)
vrai('la main-d’œuvre est la part la plus grande', r.mo > r.materiel)

// Sans prix unitaires, tout va en main-d'œuvre : hypothèse prudente
const service = { qty: 1, forfaitMoyen: 400, mode: 'moyen' }
eq('un forfait sans prix unitaires est de la main-d’œuvre',
  repartitionLigne(service), { materiel: 0, mo: 400 })
eq('une ligne nulle ne répartit rien', repartitionLigne({}), { materiel: 0, mo: 0 })

// ─── Les deux anciennes fonctions restent d'accord ──────────────────────────
// Elles calculaient chacune la même règle dans leur coin ; elles délèguent
// maintenant ici, et ce test le prouve plutôt que de l'espérer.
const cas = [
  peinture,
  { ...peinture, mode: 'petit' },
  { ...peinture, mode: 'moyen' },
  { ...peinture, mode: 'gros' },
  { ...peinture, mode: 'minimum' },
  { ...peinture, qty: 1 },
  sansForfait,
  { ...sansForfait, mode: 'gros' },
  {},
  { qty: 'abc', unitMat: null, unitLabor: undefined },
]
for (const [i, ligne] of cas.entries()) {
  const attendu = montantLigne(ligne)
  eq(`cas ${i} — estimatorUtils.lineTotal d’accord`, lineTotal(ligne), attendu, 0.001)
  eq(`cas ${i} — quoteCosting.lineAmount d’accord`, lineAmount(ligne), attendu, 0.001)
}

// ─── Valeurs abîmées ────────────────────────────────────────────────────────
for (const mauvaise of [{}, undefined, null, { qty: 'abc' }, { mode: 'moyen' }]) {
  const m = montantLigne(mauvaise)
  vrai(`${JSON.stringify(mauvaise)} → nombre fini`, Number.isFinite(m) && m >= 0)
}

// ─── Explication affichée ───────────────────────────────────────────────────
vrai('un forfait s’annonce comme montant fixe',
  /montant fixe/.test(explicationMode({ ...peinture, mode: 'moyen' })))
vrai('le plancher atteint est signalé',
  /minimum/i.test(explicationMode({ ...peinture, qty: 1, mode: MODE_SURFACE })))
vrai('la surface annonce sa quantité',
  /180/.test(explicationMode({ ...peinture, mode: MODE_SURFACE }, 'pi²')))

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ Cinq modes de tarification, une seule règle pour tout le calcul')
