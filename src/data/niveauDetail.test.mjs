// Tests des trois niveaux de détail d'une soumission.
// L'exigence qui commande tout : le TOTAL ne change jamais. Seule la
// présentation change, jamais le prix.
import {
  DETAILLEE, GROUPEE, SOMMAIRE, NIVEAUX, niveauValide,
  groupeDe, regrouper, lignesAAfficher, totalDesLignes, GROUPE_AUTRES,
} from './niveauDetail.js'

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

// Une soumission à cinq lignes : deux pièces, un travail général, une marge.
const lignes = [
  { id: 1, groupe: 'Cuisine',       description: 'Cuisine — Démolition',    unit: 'pi²',     qty: 170, unitPrice: 1 },
  { id: 2, groupe: 'Cuisine',       description: 'Cuisine — Armoires',      unit: 'm lin.',  qty: 1,   unitPrice: 1550 },
  { id: 3, groupe: 'Salle de bain', description: 'Salle de bain — Céramique', unit: 'pi²',   qty: 60,  unitPrice: 12 },
  { id: 4, groupe: 'Travaux généraux', description: 'Peinture murs',        unit: 'pi²',     qty: 400, unitPrice: 2 },
  { id: 5, groupe: '',              description: 'Administration et profit (20 %)', unit: 'forfait', qty: 1, unitPrice: 668 },
]
const TOTAL = totalDesLignes(lignes)   // 170 + 1550 + 720 + 800 + 668 = 3 908
console.log(`Total de la soumission : ${TOTAL} $`)
eq('total de référence', TOTAL, 3908)

// ─── Les trois niveaux existent et se valident ──────────────────────────────
eq('trois niveaux', NIVEAUX.length, 3)
vrai('chaque niveau a une clé, un libellé et une explication',
  NIVEAUX.every(n => n.cle && n.label && n.desc))
eq('un niveau inconnu retombe sur Détaillée', niveauValide('fantaisie'), DETAILLEE)
eq('rien retombe sur Détaillée', niveauValide(undefined), DETAILLEE)
eq('un niveau valide est conservé', niveauValide(SOMMAIRE), SOMMAIRE)

// ─── LE point : le total est le même dans les trois niveaux ─────────────────
for (const niveau of [DETAILLEE, GROUPEE, SOMMAIRE]) {
  const affichees = lignesAAfficher(lignes, niveau, 'Rénovation')
  eq(`${niveau} : le total affiché vaut le total réel`, totalDesLignes(affichees), TOTAL, 0.02)
}
console.log('→ Le niveau de détail ne change jamais le montant')

// ─── Détaillée : tout passe ─────────────────────────────────────────────────
const detail = lignesAAfficher(lignes, DETAILLEE)
eq('détaillée : autant de lignes qu’à l’origine', detail.length, lignes.length)
vrai('détaillée : les quantités et unités sont conservées',
  detail[0].qty === 170 && detail[0].unit === 'pi²')
vrai('détaillée : les descriptions sont intactes',
  detail.every((l, i) => l.description === lignes[i].description))

// ─── Groupée : un montant par pièce ─────────────────────────────────────────
const groupe = lignesAAfficher(lignes, GROUPEE)
eq('groupée : quatre groupes', groupe.length, 4)
eq('groupée : les noms de groupe',
  groupe.map(g => g.description), ['Cuisine', 'Salle de bain', 'Travaux généraux', GROUPE_AUTRES])
eq('groupée : la cuisine cumule ses deux lignes', groupe[0].unitPrice, 1720)
eq('groupée : la salle de bain', groupe[1].unitPrice, 720)
vrai('groupée : aucune quantité ni unité ne subsiste',
  groupe.every(g => g.unit === '' && g.qty === 1))
vrai('groupée : chaque groupe sait combien de lignes il cache',
  groupe[0]._nbLignes === 2 && groupe[1]._nbLignes === 1)
vrai('groupée : l’ordre du devis est respecté', groupe[0].description === 'Cuisine')

// ─── Sommaire : une seule ligne ─────────────────────────────────────────────
const sommaire = lignesAAfficher(lignes, SOMMAIRE, 'Rénovation cuisine et salle de bain')
eq('sommaire : une seule ligne', sommaire.length, 1)
eq('sommaire : elle porte le titre de la soumission',
  sommaire[0].description, 'Rénovation cuisine et salle de bain')
eq('sommaire : elle porte le total', sommaire[0].unitPrice, TOTAL)
eq('sommaire : elle sait combien de lignes elle résume', sommaire[0]._nbLignes, 5)
eq('sommaire sans titre : un libellé de repli',
  lignesAAfficher(lignes, SOMMAIRE, '')[0].description, 'Travaux')

// ─── Retrouver le groupe d'une ligne ────────────────────────────────────────
eq('le groupe inscrit sur la ligne prime',
  groupeDe({ groupe: 'Cuisine', description: 'Salon — Peinture' }), 'Cuisine')
eq('sans groupe, le préfixe de la description sert',
  groupeDe({ description: 'Salon — Peinture murs' }), 'Salon')
eq('une description sans préfixe tombe dans le groupe générique',
  groupeDe({ description: 'Peinture murs' }), GROUPE_AUTRES)
eq('une ligne vide ne plante pas', groupeDe({}), GROUPE_AUTRES)
eq('aucune ligne ne plante', groupeDe(undefined), GROUPE_AUTRES)
eq('un groupe fait d’espaces est ignoré',
  groupeDe({ groupe: '   ', description: 'Cuisine — X' }), 'Cuisine')
// Un tiret simple dans une description ne doit pas être pris pour un préfixe :
// seul le tiret cadratin entouré d'espaces sépare la pièce du travail.
eq('un trait d’union ordinaire n’est pas un séparateur',
  groupeDe({ description: 'Porte coupe-feu 45 min' }), GROUPE_AUTRES)

// ─── Soumission ancienne, sans champ « groupe » ─────────────────────────────
const anciennes = lignes.map(({ groupe, ...reste }) => reste)
const groupeAncien = lignesAAfficher(anciennes, GROUPEE)
eq('une ancienne soumission se regroupe par le préfixe',
  groupeAncien.map(g => g.description), ['Cuisine', 'Salle de bain', GROUPE_AUTRES])
eq('et son total reste le même', totalDesLignes(groupeAncien), TOTAL, 0.02)

// ─── Cas limites ────────────────────────────────────────────────────────────
eq('aucune ligne, détaillée', lignesAAfficher([], DETAILLEE).length, 0)
eq('aucune ligne, groupée', lignesAAfficher([], GROUPEE).length, 0)
eq('aucune ligne, sommaire : une ligne à zéro', lignesAAfficher([], SOMMAIRE)[0].unitPrice, 0)
eq('lignes absentes ne plantent pas', lignesAAfficher(undefined, GROUPEE).length, 0)
const abimees = [{ qty: 'abc', unitPrice: null, description: 'X' }, { qty: 2, unitPrice: 10, description: 'Y' }]
eq('des montants abîmés comptent pour zéro', totalDesLignes(abimees), 20)
vrai('aucun NaN ne sort du regroupement',
  regrouper(abimees).every(g => Number.isFinite(g.total)))

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ Trois niveaux de détail, un seul et même total')
