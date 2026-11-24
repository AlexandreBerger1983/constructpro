// La liste d'achat d'une soumission acceptée.
//
// Une soumission acceptée dit ce qu'il faut faire et pour combien. Elle ne dit
// pas quoi acheter : il fallait reprendre le devis ligne à ligne, à la main,
// pour savoir ce qu'il y avait à commander et combien on avait prévu d'y
// mettre. Deux fois le même travail, et un risque d'oubli à chaque fois.
//
// CE QUE CETTE LISTE EST — et ce qu'elle n'est pas
// ------------------------------------------------
// Les prix du catalogue sont au mètre carré, pas à la feuille : « gypse 5/8 —
// 12,80 $/m² ». Il n'existe nulle part de nomenclature disant qu'un mur de
// 48 m² demande 16 feuilles de 4×8. Cette liste donne donc, par poste :
//
//   • la QUANTITÉ de travail à couvrir, dans son unité (48 m²) ;
//   • le BUDGET matériaux prévu pour cette quantité (310 $).
//
// C'est exactement ce qu'on présente au comptoir chez un fournisseur : « j'ai
// 48 m² de gypse 5/8 à couvrir ». La conversion en feuilles, en seaux ou en
// boîtes reste au métier — et personne qui pose du gypse n'a besoin qu'on la
// lui fasse. Inventer un nombre de feuilles à partir d'un prix au mètre carré
// donnerait un chiffre faux présenté comme exact : c'est pire que pas de
// chiffre du tout.
//
// Les quantités portent déjà le facteur de perte du catalogue (+5 %, +10 %
// selon l'article) : le surplus de coupe est compris, il ne faut pas le
// rajouter.
//
// Les lignes prises dans l'inventaire sont un cas à part : on sait de quel
// article il s'agit, puisqu'il vient de la fiche Matériaux. Celles-là portent
// leur `materialId` et peuvent devenir une entrée de stock d'un seul geste.

import { CATALOG } from './estimatorCatalog.js'
import { repartitionLigne } from './tarification.js'
import { normaliserNom } from './clientsAuto.js'

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export const CATEGORIE_AUTRE = 'Autre'

const categorieDe = (ligne) => {
  const article = CATALOG.find(c => c.id === ligne?.catalogId)
  return article?.category ?? CATEGORIE_AUTRE
}

// L'article d'inventaire correspondant à une ligne, s'il y en a un.
//
// Par identifiant d'abord — une ligne récente le porte. Par nom ensuite, aux
// mêmes règles que le rapprochement des clients (accents et casse ignorés),
// pour les devis montés avant que l'identifiant soit inscrit.
function articleDe(ligne, materials = []) {
  const liste = Array.isArray(materials) ? materials.filter(Boolean) : []
  if (ligne?.materialId != null) {
    const parId = liste.find(m => String(m.id) === String(ligne.materialId))
    if (parId) return parId
  }
  if (ligne?.catalogId) return null // une ligne de catalogue n'est pas un article
  const cible = normaliserNom(ligne?.description ?? '')
  if (!cible) return null
  return liste.find(m => normaliserNom(m.name) === cible) ?? null
}

// ─── La liste ────────────────────────────────────────────────────────────────
export function listeAchat(devis, materials = []) {
  const items = Array.isArray(devis?.items) ? devis.items.filter(Boolean) : []

  const lignes = []
  let sansMateriel = 0

  for (const it of items) {
    // La part matériaux de la ligne, forfaits et prix plancher compris : c'est
    // `tarification` qui en décide, pour que la liste d'achat et le devis ne
    // puissent jamais se contredire.
    const { materiel } = repartitionLigne(it)
    if (materiel <= 0) {
      // Démolition, nettoyage, gestion de chantier : pure main-d'œuvre. Les
      // lister à 0 $ à acheter noierait ce qu'il y a vraiment à commander.
      sansMateriel += 1
      continue
    }
    const article = articleDe(it, materials)
    lignes.push({
      id: it.id,
      description: it.description ?? '',
      categorie: article?.category ?? categorieDe(it),
      qty: +num(it.qty).toFixed(2),
      unit: it.unit || 'unité',
      budget: materiel,
      // Prix matériaux unitaire tel qu'il a été figé dans le devis. Comparé au
      // prix de référence d'aujourd'hui, il dit si le devis a vieilli.
      prixUnitaire: +num(it.unitMat).toFixed(4),
      materialId: article?.id ?? null,
      article: article?.name ?? null,
      fournisseur: article?.supplier ?? '',
    })
  }

  // Regroupé par catégorie : c'est ainsi qu'on achète. Un passage chez le
  // fournisseur de gypse, un chez l'électricien — pas un aller-retour par
  // ligne de devis.
  const parCategorie = [...new Map(
    lignes.map(l => [l.categorie, null]),
  ).keys()].map(categorie => {
    const dedans = lignes.filter(l => l.categorie === categorie)
    return {
      categorie,
      lignes: dedans,
      budget: +dedans.reduce((s, l) => s + l.budget, 0).toFixed(2),
    }
  }).sort((a, b) => b.budget - a.budget)

  return {
    lignes,
    parCategorie,
    budget: +lignes.reduce((s, l) => s + l.budget, 0).toFixed(2),
    sansMateriel,
    // Combien de lignes pointent un article connu de l'inventaire : ce sont
    // les seules qu'on peut recevoir en stock sans ressaisie.
    reconnues: lignes.filter(l => l.materialId != null).length,
  }
}

// Budget matériaux d'un devis, sans construire toute la liste.
export const budgetMateriaux = (devis) => listeAchat(devis).budget

// ─── Le devis derrière une soumission ────────────────────────────────────────
// La soumission ne garde qu'un prix unitaire par ligne : la part matériaux y
// est déjà fondue dans le total. C'est le devis de l'estimateur qui conserve
// la ventilation, et on le retrouve par le numéro — le même des deux côtés.
export const devisDeLaSoumission = (devisEnregistres = [], soumission) =>
  (Array.isArray(devisEnregistres) ? devisEnregistres : [])
    .find(d => d?.number && soumission?.number && d.number === soumission.number) ?? null
