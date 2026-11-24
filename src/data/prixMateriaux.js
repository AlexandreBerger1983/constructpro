// Le prix d'un matériau : lequel, pour quoi, et pourquoi jamais un seul.
//
// Un article ne portait qu'un `unitCost`, à qui on demandait trois choses
// incompatibles :
//
//   1. chiffrer un devis à venir       → il faut le prix d'aujourd'hui ;
//   2. valoriser ce qui est en stock   → il faut la moyenne de ce qui a été
//                                        réellement payé pour ces articles-là ;
//   3. dire ce qu'un chantier a coûté  → il faut le prix payé À L'ÉPOQUE, figé.
//
// Les écraser l'un par l'autre réécrit le passé. Si le 2×4 passe de 18 $ à
// 24 $ et qu'on remplace la valeur, un chantier chiffré le mois dernier
// affiche soudain un autre coût de matériaux, et sa marge change
// rétroactivement — sans que personne n'ait rien saisi. C'est le piège, et il
// est silencieux.
//
// D'où trois prix distincts :
//
//   • prix de référence (`unitCost`) — celui qu'on utilise pour ESTIMER. On le
//     met à jour quand on veut, délibérément, et sa date est affichée : un
//     prix de huit mois qui a l'air frais est plus dangereux qu'un prix
//     visiblement périmé ;
//   • prix payé (sur chaque mouvement) — le prix réel de cette livraison-là.
//     Jamais recalculé, jamais relu depuis la fiche article ;
//   • coût moyen pondéré (`coutMoyen`) — ce que vaut ce qui est sur la
//     tablette. C'est la méthode que les normes comptables canadiennes
//     admettent pour une PME (moyenne pondérée ou PEPS ; le DEPS est interdit),
//     et elle a l'avantage de ne pas obliger à savoir quelle feuille de gypse
//     vient de quelle livraison.

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// Un prix de référence plus vieux que ça mérite d'être vérifié avant de servir
// à chiffrer un devis. Trois mois : assez long pour ne pas crier au loup sur
// des articles stables, assez court pour attraper une saison de bois d'œuvre.
export const PRIX_PERIME_JOURS = 90

// Les articles dont le prix bouge vraiment. Au Québec, le bois d'œuvre,
// l'acier, le cuivre et le bardeau d'asphalte montent et descendent ; le
// gypse, la quincaillerie, la peinture et le scellant ne bougent presque pas.
// Suivre l'historique de 200 articles est un travail que personne ne tient :
// on signale donc la péremption plus tôt sur les catégories volatiles, et on
// laisse les autres tranquilles.
export const CATEGORIES_VOLATILES = ['Ossature', 'Béton', 'Électricité', 'Plomberie']
export const PRIX_PERIME_JOURS_VOLATILE = 30

export const estVolatil = (article) =>
  Boolean(article?.prixVolatil) || CATEGORIES_VOLATILES.includes(article?.category)

const JOUR = 86400000

export const joursDepuis = (date, maintenant = new Date()) => {
  const t = Date.parse(date ?? '')
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((maintenant.getTime() - t) / JOUR))
}

// Depuis quand ce prix de référence n'a pas été revu, et faut-il s'en méfier.
//
// Un article SANS date de mise à jour est traité comme périmé : c'est le cas
// des articles saisis avant que les dates existent, et le dire vaut mieux que
// de laisser croire que le prix est frais.
export function etatPrix(article, maintenant = new Date()) {
  const seuil = estVolatil(article) ? PRIX_PERIME_JOURS_VOLATILE : PRIX_PERIME_JOURS
  const jours = joursDepuis(article?.prixMaj, maintenant)
  if (jours === null) return { jours: null, perime: true, seuil, jamaisDate: true }
  return { jours, perime: jours > seuil, seuil, jamaisDate: false }
}

// En mots, pour l'écran.
export function ageDuPrix(article, maintenant = new Date()) {
  const { jours, jamaisDate } = etatPrix(article, maintenant)
  if (jamaisDate) return 'date inconnue'
  if (jours === 0) return "aujourd'hui"
  if (jours === 1) return 'hier'
  if (jours < 31) return `il y a ${jours} jours`
  const mois = Math.round(jours / 30.44)
  if (mois < 24) return `il y a ${mois} mois`
  return `il y a ${Math.floor(mois / 12)} ans`
}

// ─── Coût moyen pondéré ──────────────────────────────────────────────────────
// Le stock existant n'a pas d'historique : la seule hypothèse disponible est
// qu'il a été acheté au prix de référence actuel. C'est écrit ici pour que
// personne ne prenne cette valeur de départ pour une mesure.
export const coutMoyenInitial = (article) =>
  article?.coutMoyen != null ? num(article.coutMoyen) : num(article?.unitCost)

// Nouveau coût moyen après une ENTRÉE de `qty` unités payées `prixPaye`.
//
// Un stock négatif ne vaut rien à moyenner : on part de zéro. Sans quoi un
// stock à −5 ferait baisser la moyenne d'un article qu'on vient de payer.
export function coutMoyenApres(stockAvant, coutMoyenAvant, qty, prixPaye) {
  const q = num(qty)
  if (q <= 0) return +num(coutMoyenAvant).toFixed(4)
  const base = Math.max(0, num(stockAvant))
  const total = base * num(coutMoyenAvant) + q * num(prixPaye)
  return +(total / (base + q)).toFixed(4)
}

// Ce que vaut le stock d'un article. Le coût moyen d'abord — c'est ce qui a
// été payé ; le prix de référence seulement à défaut.
export const valeurStock = (article) =>
  +(num(article?.stock) * coutMoyenInitial(article)).toFixed(2)

export const valeurInventaire = (articles = []) =>
  +(Array.isArray(articles) ? articles : [])
    .reduce((s, a) => s + valeurStock(a), 0).toFixed(2)

// ─── Historique des prix de référence ────────────────────────────────────────
// Gardé court volontairement : vingt relevés suffisent à voir une tendance, et
// une liste qui grossit sans fin finit dans la colonne jsonb de chaque article.
export const HISTORIQUE_MAX = 20

export function historiqueApres(article, nouveauPrix, date = new Date()) {
  const jour = (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 10)
  const ancien = Array.isArray(article?.prixHistorique) ? article.prixHistorique : []
  const prix = +num(nouveauPrix).toFixed(4)
  // Un même prix ressaisi le même jour ne crée pas un second relevé.
  const dernier = ancien.at(-1)
  if (dernier && dernier.date === jour && num(dernier.prix) === prix) return ancien
  return [...ancien, { date: jour, prix }].slice(-HISTORIQUE_MAX)
}

// Variation entre le premier et le dernier relevé, en pourcentage.
export function tendancePrix(article) {
  const h = Array.isArray(article?.prixHistorique) ? article.prixHistorique : []
  if (h.length < 2) return null
  const debut = num(h[0].prix)
  const fin = num(h.at(-1).prix)
  if (debut <= 0) return null
  return {
    depuis: h[0].date,
    pct: +(((fin - debut) / debut) * 100).toFixed(1),
    de: debut,
    a: fin,
  }
}

// ─── Écart budget / réel ─────────────────────────────────────────────────────
// Le vrai livrable du suivi des prix. « Budgété 310 $, payé 356 $, +15 % » est
// ce qui dit qu'un prix de référence a vieilli — et, chantier par chantier, si
// l'entreprise perd de l'argent sur les matériaux. Sans cet écart, suivre les
// prix n'est que de la tenue de livres.
export function ecart(budget, reel) {
  const b = num(budget)
  const r = num(reel)
  return {
    budget: +b.toFixed(2),
    reel: +r.toFixed(2),
    montant: +(r - b).toFixed(2),
    // Aucun budget : un dépassement de 0 $ n'a pas de pourcentage. On ne
    // renvoie pas Infinity, qui s'afficherait tel quel à l'écran.
    pct: b > 0 ? +(((r - b) / b) * 100).toFixed(1) : null,
  }
}
