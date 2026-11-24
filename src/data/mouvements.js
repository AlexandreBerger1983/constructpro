// Le journal des mouvements de stock.
//
// Jusqu'ici, l'inventaire n'avait qu'un nombre : les boutons « + » et « − »
// faisaient monter ou descendre `stock`, et rien ne disait pourquoi. Impossible
// de savoir ce qu'un chantier avait consommé, ni à quel prix, ni qui l'avait
// sorti. Le nombre était juste ou faux, sans moyen de trancher.
//
// Chaque mouvement est donc inscrit, avec SON prix figé au moment où il a eu
// lieu. C'est ce qui permet de dire plus tard ce qu'un chantier a réellement
// coûté, même si le prix de l'article a changé trois fois depuis.
//
// Une seule convention de signe, partout : POSITIF entre en stock, NÉGATIF en
// sort. Un retour de chantier est donc une consommation négative, et un retour
// au fournisseur un achat négatif. Deux champs de quantité, un pour l'entrée
// et un pour la sortie, auraient obligé chaque calcul à choisir.

import { coutMoyenApres, coutMoyenInitial } from './prixMateriaux.js'

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export const ACHAT = 'achat'
export const CONSOMMATION = 'consommation'
export const AJUSTEMENT = 'ajustement'

export const TYPES_MOUVEMENT = {
  [ACHAT]: {
    label: 'Achat / réception',
    court: 'Achat',
    // Un achat est la SEULE opération qui déplace le coût moyen : c'est la
    // seule où de l'argent neuf entre dans le stock.
    prixSaisi: true,
    aide: 'Le prix payé sur la facture du fournisseur, pas le prix de référence.',
  },
  [CONSOMMATION]: {
    label: 'Consommation sur un chantier',
    court: 'Consommation',
    prixSaisi: false,
    aide: 'Quantité négative pour un retour de chantier vers l’entrepôt.',
  },
  [AJUSTEMENT]: {
    label: 'Ajustement d’inventaire',
    court: 'Ajustement',
    prixSaisi: false,
    aide: 'Après un décompte physique, une casse ou un vol. Négatif pour retirer.',
  },
}

export const estTypeValide = (type) => Object.hasOwn(TYPES_MOUVEMENT, String(type ?? ''))

// ─── Validation ──────────────────────────────────────────────────────────────
// Renvoie un message en français, ou null si le mouvement est recevable.
//
// La quantité zéro est refusée : elle n'a aucun effet et encombre le journal.
// Une quantité négative, elle, est parfaitement légitime — c'est même le seul
// moyen d'enregistrer un retour ou de corriger un décompte.
export function validerMouvement(mouvement = {}) {
  if (!estTypeValide(mouvement.type)) return 'Type de mouvement inconnu.'
  if (mouvement.materialId == null || mouvement.materialId === '') return 'Aucun article choisi.'
  const q = num(mouvement.qty)
  if (q === 0) return 'La quantité ne peut pas être zéro.'
  if (mouvement.type === ACHAT && q < 0 && num(mouvement.prixUnitaire) <= 0)
    return 'Un retour au fournisseur demande le prix auquel l’article avait été payé.'
  if (mouvement.type === ACHAT && num(mouvement.prixUnitaire) < 0)
    return 'Le prix payé ne peut pas être négatif.'
  return null
}

// ─── Application d'un mouvement à un article ─────────────────────────────────
// Renvoie le prix à FIGER sur le mouvement, et les nouvelles valeurs de
// l'article. Rien n'est écrit ici : la décision d'enregistrer reste à l'écran.
//
// Le stock peut devenir négatif, et c'est volontaire. Si l'application dit 3 et
// que le chantier en a posé 5, refuser la saisie oblige à mentir ou à ne rien
// inscrire — et on perd l'information la plus utile : le décompte est faux,
// allez compter. Un stock négatif est signalé en rouge, pas interdit.
export function appliquerMouvement(article, mouvement) {
  const stockAvant = num(article?.stock)
  const cmpAvant = coutMoyenInitial(article)
  const q = num(mouvement?.qty)

  // Le prix figé : celui de la facture pour un achat, le coût moyen du moment
  // pour toute sortie. Une consommation facturée au prix de référence
  // d'aujourd'hui raconterait le prix du jour, pas celui du stock utilisé.
  const prixUnitaire = mouvement?.type === ACHAT
    ? +num(mouvement.prixUnitaire).toFixed(4)
    : +cmpAvant.toFixed(4)

  // Seule une entrée payée déplace la moyenne. Toute quantité négative la
  // laisse intacte : retirer du stock ne change pas ce que le reste a coûté,
  // et reconstituer l'effet exact d'un retour demanderait de savoir de quelle
  // livraison il provient — ce que personne ne note sur un chantier.
  const coutMoyen = mouvement?.type === ACHAT && q > 0
    ? coutMoyenApres(stockAvant, cmpAvant, q, prixUnitaire)
    : +cmpAvant.toFixed(4)

  return {
    prixUnitaire,
    article: {
      stock: +(stockAvant + q).toFixed(4),
      coutMoyen,
    },
  }
}

// ─── Lecture du journal ──────────────────────────────────────────────────────

// Montant du mouvement du point de vue du STOCK : positif quand de la valeur
// entre, négatif quand elle sort.
export const montantMouvement = (m) => +(num(m?.qty) * num(m?.prixUnitaire)).toFixed(2)

// Ce que le mouvement a coûté au CHANTIER : l'inverse. Consommer coûte,
// retourner crédite.
export const coutChantier = (m) => +(-montantMouvement(m)).toFixed(2)

const memeId = (a, b) =>
  a != null && b != null && a !== '' && b !== '' && String(a) === String(b)

export function mouvementsDe(mouvements = [], filtre = {}) {
  const liste = Array.isArray(mouvements) ? mouvements.filter(Boolean) : []
  return liste
    .filter(m => filtre.materialId == null || memeId(m.materialId, filtre.materialId))
    .filter(m => filtre.projectId == null || memeId(m.projectId, filtre.projectId))
    .filter(m => filtre.type == null || m.type === filtre.type)
    .sort((a, b) => String(b?.date ?? '').localeCompare(String(a?.date ?? '')) ||
                    num(b?.id) - num(a?.id))
}

// Ce qu'un chantier a consommé en matériaux, au prix du moment.
//
// Les achats n'y entrent PAS : acheter du matériel ne le consomme pas, il
// attend en entrepôt. Seul ce qui est sorti vers le chantier compte, sans quoi
// une livraison en gros gonflerait le coût d'un chantier qui n'en a pas encore
// vu la moitié.
export function consommationDuProjet(mouvements = [], projectId) {
  const liste = mouvementsDe(mouvements, { projectId, type: CONSOMMATION })
  return {
    nombre: liste.length,
    cout: +liste.reduce((s, m) => s + coutChantier(m), 0).toFixed(2),
    mouvements: liste,
  }
}

// Même chose pour tous les chantiers d'un coup, pour l'écran Matériaux.
export function consommationParProjet(mouvements = []) {
  const parProjet = new Map()
  for (const m of mouvementsDe(mouvements, { type: CONSOMMATION })) {
    const cle = m.projectId ?? 'sans-chantier'
    const actuel = parProjet.get(cle) ?? { projectId: m.projectId ?? null, cout: 0, nombre: 0 }
    actuel.cout = +(actuel.cout + coutChantier(m)).toFixed(2)
    actuel.nombre += 1
    parProjet.set(cle, actuel)
  }
  return [...parProjet.values()].sort((a, b) => b.cout - a.cout)
}

// Dernier prix réellement payé pour un article — plus parlant que le prix de
// référence quand on s'interroge sur sa fraîcheur.
export function dernierPrixPaye(mouvements = [], materialId) {
  const achats = mouvementsDe(mouvements, { materialId, type: ACHAT })
    .filter(m => num(m.qty) > 0)
  if (achats.length === 0) return null
  const dernier = achats[0]
  return { prix: num(dernier.prixUnitaire), date: dernier.date ?? null }
}

// Le mouvement tel qu'il sera enregistré. Un seul endroit construit l'objet,
// pour que le journal ne contienne jamais deux formes du même fait.
export function nouveauMouvement({ type, materialId, qty, prixUnitaire, projectId, note, fournisseur, par, date }) {
  return {
    id: Date.now(),
    type,
    materialId,
    qty: +num(qty).toFixed(4),
    prixUnitaire: +num(prixUnitaire).toFixed(4),
    projectId: projectId ?? null,
    note: note ?? '',
    fournisseur: fournisseur ?? '',
    par: par ?? '',
    date: date ?? new Date().toISOString().slice(0, 10),
  }
}
