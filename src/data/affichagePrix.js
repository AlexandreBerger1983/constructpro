// Affichage des prix du catalogue en pieds ou en mètres.
//
// Le catalogue est chiffré au mètre carré, parce que c'est l'unité dans
// laquelle le moteur de calcul travaille et dans laquelle les devis déjà
// enregistrés ont figé leurs prix. Mais personne sur un chantier au Québec ne
// pense en mètres carrés : on parle en pieds.
//
// D'où ce module : il ne change RIEN au stockage, qui reste métrique. Il
// traduit seulement dans les deux sens, à l'affichage et à la saisie. Changer
// d'unité ne modifie donc aucun prix — c'est la même valeur, écrite autrement.

import { M2_PAR_PI2, M_PAR_PI } from '../components/estimator/estimatorUtils.js'

export const UNITE_PIEDS_KEY = 'cp-prix-en-pieds'

// Unités convertibles, et par quoi diviser le prix métrique pour l'obtenir
// dans l'unité impériale. Un prix au mètre carré couvre 10,76 pieds carrés :
// le prix du pied carré est donc dix fois plus petit, pas plus grand.
const CONVERSIONS = {
  'm²':     { facteur: M2_PAR_PI2, label: 'pi²' },
  'm lin.': { facteur: M_PAR_PI,   label: 'pi lin.' },
}

// Les articles à l'unité, au forfait, au point, à la marche ou à l'heure n'ont
// pas d'équivalent impérial : ils s'affichent tels quels dans les deux modes.
export const estConvertible = (unite) => Object.hasOwn(CONVERSIONS, unite)

export const uniteAffichee = (unite, enPieds) =>
  (enPieds && estConvertible(unite)) ? CONVERSIONS[unite].label : unite

const facteur = (unite, enPieds) =>
  (enPieds && estConvertible(unite)) ? CONVERSIONS[unite].facteur : 1

const nombre = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// Métrique → ce qu'on montre dans la case. Deux décimales : c'est de l'argent,
// et un prix au pied carré est dix fois plus petit qu'au mètre carré, donc la
// deuxième décimale compte.
export const versAffichage = (valeurMetrique, unite, enPieds) =>
  +(nombre(valeurMetrique) / facteur(unite, enPieds)).toFixed(2)

// Ce qui a été tapé → métrique, pour l'enregistrement. Quatre décimales :
// assez pour qu'un aller-retour affichage → saisie → affichage redonne
// exactement le même nombre, sans dérive à chaque passage.
export const versMetrique = (valeurSaisie, unite, enPieds) =>
  +(nombre(valeurSaisie) * facteur(unite, enPieds)).toFixed(4)

// Pas du sélecteur numérique : 0,50 $ au mètre carré, 0,05 $ au pied carré.
// Un même pas dans les deux unités rendrait la saisie impraticable d'un côté
// ou de l'autre.
export const pasDeSaisie = (unite, enPieds) =>
  (enPieds && estConvertible(unite)) ? 0.05 : 0.5

// Deux prix métriques sont-ils le même prix ?
//
// On compare ce que la case AFFICHE, pas les nombres stockés. Saisir en pieds
// le prix affiché ne redonne pas le centième exact au mètre carré : 45 $/m²
// s'affiche 4,18 $/pi², qui revient à 44,993 $/m². Comparer les valeurs
// métriques marquerait l'article comme « modifié » alors que l'utilisateur
// n'a rien changé — et une tolérance fixe ne tiendrait pas, l'écart d'arrondi
// grandissant avec le montant : un centième de pied carré vaut dix centièmes
// de mètre carré.
//
// Le critère retenu est celui que l'utilisateur voit : si les deux nombres
// s'écrivent pareil dans la case, c'est le même prix.
export const memePrix = (a, b, unite, enPieds) =>
  versAffichage(a, unite, enPieds) === versAffichage(b, unite, enPieds)

// Écriture d'un prix unitaire. formatCurrency arrondit au dollar, ce qui
// convient à un total de devis mais pas ici : au pied carré, les montants
// tiennent dans quelques dollars et « 4 $ » perdrait l'essentiel du prix.
export const formatPrixUnitaire = (valeur) =>
  nombre(valeur).toLocaleString('fr-CA', {
    style: 'currency', currency: 'CAD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
