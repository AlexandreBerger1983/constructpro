// Niveau de détail d'une soumission.
//
// Une soumission ne se montre pas toujours de la même façon. Un client qui
// compare trois entrepreneurs veut le détail ; un client de longue date, à qui
// l'on a déjà tout expliqué de vive voix, n'a besoin que du montant. Et entre
// les deux, un découpage par pièce suffit souvent.
//
// Trois niveaux, choisis soumission par soumission :
//
//   • détaillée — chaque ligne avec sa quantité, son prix unitaire, son total ;
//   • groupée   — un montant par pièce ou par section, sans le détail ;
//   • sommaire  — un seul montant pour l'ensemble des travaux.
//
// Dans les trois cas le TOTAL est le même : c'est la présentation qui change,
// jamais le prix. Les taxes et le total général restent toujours affichés —
// un client doit savoir ce qu'il paie, même sans le détail.

export const DETAILLEE = 'detaillee'
export const GROUPEE = 'groupee'
export const SOMMAIRE = 'sommaire'

export const NIVEAUX = [
  { cle: DETAILLEE, label: 'Détaillée', desc: 'Chaque ligne avec sa quantité et son prix' },
  { cle: GROUPEE,   label: 'Groupée',   desc: 'Un montant par pièce, sans le détail des lignes' },
  { cle: SOMMAIRE,  label: 'Sommaire',  desc: 'Un seul montant pour l’ensemble des travaux' },
]

export const niveauValide = (niveau) =>
  NIVEAUX.some(n => n.cle === niveau) ? niveau : DETAILLEE

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const montant = (ligne) => +(num(ligne?.qty) * num(ligne?.unitPrice)).toFixed(2)

// À quel groupe appartient une ligne.
//
// L'estimateur inscrit le groupe sur la ligne au moment de produire la
// soumission. Les soumissions antérieures ne l'ont pas : on le retrouve alors
// dans la description, dont le préfixe est le nom de la pièce
// (« Cuisine — Peinture murs »). Faute des deux, la ligne tombe dans un groupe
// générique plutôt que de disparaître.
export const GROUPE_AUTRES = 'Travaux'

export function groupeDe(ligne) {
  const explicite = String(ligne?.groupe ?? '').trim()
  if (explicite) return explicite
  const description = String(ligne?.description ?? '')
  const [avant, ...reste] = description.split(' — ')
  return reste.length > 0 && avant.trim() ? avant.trim() : GROUPE_AUTRES
}

// Les lignes rassemblées par groupe, dans l'ordre d'apparition — l'ordre du
// devis, qui suit celui des pièces visitées.
export function regrouper(lignes = []) {
  const groupes = new Map()
  for (const ligne of lignes) {
    const nom = groupeDe(ligne)
    if (!groupes.has(nom)) groupes.set(nom, { nom, lignes: [], total: 0 })
    const g = groupes.get(nom)
    g.lignes.push(ligne)
    g.total = +(g.total + montant(ligne)).toFixed(2)
  }
  return [...groupes.values()]
}

// Ce qu'il faut afficher, selon le niveau. Une seule fonction décide, pour que
// l'écran, l'impression et un éventuel export ne divergent jamais.
export function lignesAAfficher(lignes = [], niveau = DETAILLEE, titre = 'Travaux') {
  const n = niveauValide(niveau)
  if (n === DETAILLEE) return lignes.map(l => ({ ...l, _detail: true }))

  if (n === GROUPEE) {
    return regrouper(lignes).map(g => ({
      id: `groupe-${g.nom}`,
      description: g.nom,
      unit: '',
      qty: 1,
      unitPrice: g.total,
      _detail: false,
      _groupe: true,
      _nbLignes: g.lignes.length,
    }))
  }

  const total = lignes.reduce((s, l) => s + montant(l), 0)
  return [{
    id: 'sommaire',
    description: titre || 'Travaux',
    unit: '',
    qty: 1,
    unitPrice: +total.toFixed(2),
    _detail: false,
    _sommaire: true,
    _nbLignes: lignes.length,
  }]
}

// Le total affiché ne doit JAMAIS dépendre du niveau : c'est la présentation
// qui change, pas le prix. Cette fonction sert aux tests à le prouver.
export const totalDesLignes = (lignes = []) =>
  +lignes.reduce((s, l) => s + montant(l), 0).toFixed(2)
