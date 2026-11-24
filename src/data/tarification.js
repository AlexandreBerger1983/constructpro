// Tarification d'une ligne de devis : comment son montant est décidé.
//
// Jusqu'ici une ligne se chiffrait d'une seule façon — la quantité multipliée
// par les prix unitaires, avec un plancher éventuel. Tous les travaux ne se
// vendent pourtant pas au pied carré : repeindre une porte, reprendre un
// joint, poser une tablette se chiffrent au forfait, et un déplacement a un
// prix minimum en dessous duquel l'entreprise ne se déplace pas.
//
// Cinq modes, donc. Un seul s'applique à une ligne donnée :
//
//   • surface  — quantité × (matériaux + main-d'œuvre), avec plancher minimum.
//                C'est le mode d'origine, et celui par défaut ;
//   • petit / moyen / gros — un montant fixe, décidé d'avance par l'entreprise
//                et saisi dans les Paramètres. La superficie n'entre plus en
//                compte : c'est le prix du travail, point ;
//   • minimum  — le prix plancher facturé tel quel.
//
// CE MODULE EST LA SEULE SOURCE DU MONTANT D'UNE LIGNE. Deux fonctions le
// calculaient auparavant, dans deux fichiers (estimatorUtils.lineTotal et
// quoteCosting.lineAmount) : deux copies de la même règle qui devaient rester
// d'accord sans que rien ne le garantisse. Elles délèguent désormais ici.

export const MODE_SURFACE = 'surface'

// Les modes à montant fixe, et le champ de l'article où ce montant est rangé.
export const MODES_FORFAIT = {
  petit:   { label: 'Petit travail',  court: 'Petit',   champ: 'forfaitPetit' },
  moyen:   { label: 'Travail moyen',  court: 'Moyen',   champ: 'forfaitMoyen' },
  gros:    { label: 'Gros travail',   court: 'Gros',    champ: 'forfaitGros' },
  minimum: { label: 'Prix minimum',   court: 'Minimum', champ: 'min' },
}

export const MODES = [
  { cle: MODE_SURFACE, label: 'À la surface', court: 'Surface' },
  ...Object.entries(MODES_FORFAIT).map(([cle, m]) => ({ cle, label: m.label, court: m.court })),
]

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export const estForfait = (mode) => Object.hasOwn(MODES_FORFAIT, String(mode ?? ''))

// Montant fixe applicable à une ligne, ou null si elle se chiffre à la surface.
//
// Un mode fixe dont le montant n'a pas été renseigné (0 ou absent) retombe sur
// la surface. C'est délibéré : choisir « Gros travail » sur un article dont le
// forfait n'a jamais été rempli donnerait sinon une ligne à zéro dollar, et
// une soumission part chez un client.
export function forfaitDe(ligne) {
  if (!ligne || !estForfait(ligne.mode)) return null
  const montant = num(ligne[MODES_FORFAIT[ligne.mode].champ])
  return montant > 0 ? montant : null
}

// Le montant de la ligne.
export function montantLigne(ligne) {
  const forfait = forfaitDe(ligne)
  if (forfait != null) return +forfait.toFixed(2)
  const brut = num(ligne?.qty) * (num(ligne?.unitMat) + num(ligne?.unitLabor))
  return +Math.max(brut, num(ligne?.min)).toFixed(2)
}

// Part de matériaux et part de main-d'œuvre d'une ligne.
//
// Nécessaire parce que le devis les totalise séparément et que la feuille
// « Calcul des coûts » les ventile par corps de métier. Un montant fixe n'en
// dit rien par lui-même : on le répartit au prorata des prix unitaires de
// l'article, qui expriment justement la proportion habituelle entre les deux.
// Sans prix unitaires pour servir de guide, tout va en main-d'œuvre — c'est
// l'hypothèse prudente pour un forfait de service.
export function repartitionLigne(ligne) {
  const total = montantLigne(ligne)
  if (total === 0) return { materiel: 0, mo: 0 }

  const qty = num(ligne?.qty)
  const mat = qty * num(ligne?.unitMat)
  const mo = qty * num(ligne?.unitLabor)
  const brut = mat + mo

  if (brut <= 0) return { materiel: 0, mo: total }
  const partMateriel = +(total * mat / brut).toFixed(2)
  // La main-d'œuvre absorbe l'arrondi : les deux parts font exactement le
  // total, sans quoi la feuille de coûts afficherait « ERREUR ».
  return { materiel: partMateriel, mo: +(total - partMateriel).toFixed(2) }
}

// Modes réellement proposables pour un article : ceux dont le montant est
// renseigné. Inutile d'offrir « Gros travail » sur un article qui n'en a pas.
export function modesDisponibles(article = {}) {
  return MODES.filter(m => m.cle === MODE_SURFACE || num(article[MODES_FORFAIT[m.cle].champ]) > 0)
}

// Comment la ligne est chiffrée, en une ligne de texte lisible.
export function explicationMode(ligne, uniteAffichee = '') {
  const forfait = forfaitDe(ligne)
  if (forfait != null) return `${MODES_FORFAIT[ligne.mode].label} — montant fixe`
  const q = num(ligne?.qty)
  const unitaire = num(ligne?.unitMat) + num(ligne?.unitLabor)
  const plancher = num(ligne?.min)
  if (plancher > 0 && q * unitaire < plancher) return `Montant minimum appliqué`
  return `${q} ${uniteAffichee || ligne?.unit || ''} × prix unitaire`.trim()
}
