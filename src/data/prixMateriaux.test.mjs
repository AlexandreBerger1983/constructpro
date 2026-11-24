// Tests du prix des matériaux : péremption, coût moyen pondéré, historique,
// écart. Le point qui compte : un changement de prix ne doit JAMAIS modifier
// ce qu'un mouvement passé a coûté.
import assert from 'node:assert/strict'
import {
  PRIX_PERIME_JOURS, PRIX_PERIME_JOURS_VOLATILE, estVolatil, joursDepuis,
  etatPrix, ageDuPrix, coutMoyenInitial, coutMoyenApres, valeurStock,
  valeurInventaire, historiqueApres, HISTORIQUE_MAX, tendancePrix, ecart,
} from './prixMateriaux.js'

const JOUR = 86400000
const maintenant = new Date('2026-11-24T12:00:00Z')
const ilYA = (jours) => new Date(maintenant.getTime() - jours * JOUR).toISOString().slice(0, 10)

let n = 0
const ok = (c, m) => { assert.ok(c, m); n++ }
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++ }

// ─── Volatilité ──────────────────────────────────────────────────────────────
ok(estVolatil({ category: 'Ossature' }), 'le bois d’œuvre est volatil')
ok(estVolatil({ category: 'Plomberie' }), 'le cuivre est volatil')
ok(!estVolatil({ category: 'Peinture' }), 'la peinture ne l’est pas')
ok(!estVolatil({ category: 'Fixation' }), 'la quincaillerie ne l’est pas')
ok(estVolatil({ category: 'Peinture', prixVolatil: true }), 'un article peut être marqué à la main')
ok(!estVolatil({}), 'un article sans catégorie n’est pas volatil par défaut')
ok(!estVolatil(null), 'un article absent ne fait pas planter')

// ─── Âge du prix ─────────────────────────────────────────────────────────────
eq(joursDepuis(ilYA(10), maintenant), 10, 'dix jours')
eq(joursDepuis(ilYA(0), maintenant), 0, 'aujourd’hui')
eq(joursDepuis('pas une date', maintenant), null, 'une date illisible ne donne pas un nombre')
eq(joursDepuis(undefined, maintenant), null, 'une date absente non plus')
// Une date future ne doit pas donner un âge négatif, qui s'afficherait
// « il y a −3 jours ».
eq(joursDepuis(new Date(maintenant.getTime() + 3 * JOUR).toISOString(), maintenant), 0,
  'une date future est ramenée à zéro, pas à un âge négatif')

{
  const stable = { category: 'Peinture', prixMaj: ilYA(60) }
  const e = etatPrix(stable, maintenant)
  eq(e.perime, false, '60 jours sur un article stable, c’est encore bon')
  eq(e.seuil, PRIX_PERIME_JOURS, 'le seuil long s’applique')
}
{
  const volatil = { category: 'Ossature', prixMaj: ilYA(60) }
  const e = etatPrix(volatil, maintenant)
  eq(e.perime, true, '60 jours sur du bois d’œuvre, c’est périmé')
  eq(e.seuil, PRIX_PERIME_JOURS_VOLATILE, 'le seuil court s’applique')
}
{
  // Le cas le plus dangereux : un prix sans date, qui a l'air frais.
  const e = etatPrix({ category: 'Peinture' }, maintenant)
  eq(e.perime, true, 'un prix sans date est traité comme périmé')
  eq(e.jamaisDate, true, 'et signalé comme tel')
}
eq(ageDuPrix({ prixMaj: ilYA(0) }, maintenant), "aujourd'hui", 'aujourd’hui')
eq(ageDuPrix({ prixMaj: ilYA(1) }, maintenant), 'hier', 'hier')
eq(ageDuPrix({ prixMaj: ilYA(12) }, maintenant), 'il y a 12 jours', 'douze jours')
eq(ageDuPrix({ prixMaj: ilYA(240) }, maintenant), 'il y a 8 mois', 'huit mois')
eq(ageDuPrix({ prixMaj: ilYA(900) }, maintenant), 'il y a 2 ans', 'deux ans')
eq(ageDuPrix({}, maintenant), 'date inconnue', 'sans date')

// ─── Coût moyen pondéré ──────────────────────────────────────────────────────
eq(coutMoyenInitial({ unitCost: 18 }), 18, 'sans historique, le prix de référence sert de départ')
eq(coutMoyenInitial({ unitCost: 18, coutMoyen: 21.5 }), 21.5, 'le coût moyen l’emporte dès qu’il existe')
eq(coutMoyenInitial({ unitCost: 18, coutMoyen: 0 }), 0, 'un coût moyen à zéro est une valeur, pas une absence')
eq(coutMoyenInitial({}), 0, 'article vide')

// 10 unités à 18 $ + 10 à 24 $ → 21 $
eq(coutMoyenApres(10, 18, 10, 24), 21, 'moyenne de deux livraisons égales')
// 90 unités à 18 $ + 10 à 24 $ → 18,60 $ : la grosse quantité tire la moyenne
eq(coutMoyenApres(90, 18, 10, 24), 18.6, 'la moyenne est bien pondérée par les quantités')
// Premier achat sur un stock vide : la moyenne, c'est le prix payé
eq(coutMoyenApres(0, 0, 10, 24), 24, 'premier achat sur stock vide')
eq(coutMoyenApres(0, 18, 10, 24), 24, 'un stock à zéro n’a aucun poids, même avec un ancien coût')
// Un stock négatif ne doit pas peser dans la moyenne
eq(coutMoyenApres(-5, 18, 10, 24), 24, 'un stock négatif est ramené à zéro dans la moyenne')
// Une quantité nulle ou négative ne déplace rien
eq(coutMoyenApres(10, 18, 0, 24), 18, 'une entrée vide ne change pas la moyenne')
eq(coutMoyenApres(10, 18, -3, 24), 18, 'une quantité négative ne change pas la moyenne')

// ─── Valeur du stock ─────────────────────────────────────────────────────────
eq(valeurStock({ stock: 10, unitCost: 18 }), 180, 'à défaut, au prix de référence')
eq(valeurStock({ stock: 10, unitCost: 18, coutMoyen: 21 }), 210, 'au coût moyen dès qu’il existe')
eq(valeurStock({ stock: 0, unitCost: 18 }), 0, 'stock vide')
eq(valeurStock({ stock: -2, unitCost: 18, coutMoyen: 20 }), -40,
  'un stock négatif donne une valeur négative — le décompte est faux, et ça se voit')
eq(valeurInventaire([
  { stock: 10, coutMoyen: 21 },
  { stock: 4, unitCost: 50 },
]), 410, 'la valeur d’inventaire additionne les deux façons')
eq(valeurInventaire([]), 0, 'inventaire vide')
eq(valeurInventaire(null), 0, 'inventaire absent')

// ─── Historique ──────────────────────────────────────────────────────────────
{
  const a = { prixHistorique: [] }
  const h1 = historiqueApres(a, 18, new Date('2026-01-15'))
  eq(h1, [{ date: '2026-01-15', prix: 18 }], 'premier relevé')
  const h2 = historiqueApres({ prixHistorique: h1 }, 24, new Date('2026-06-01'))
  eq(h2.length, 2, 'deuxième relevé')
  // Le même prix ressaisi le même jour ne doit pas doubler
  const h3 = historiqueApres({ prixHistorique: h2 }, 24, new Date('2026-06-01'))
  eq(h3.length, 2, 'un prix identique le même jour ne crée pas de doublon')
  // Un prix DIFFÉRENT le même jour, lui, compte : on a corrigé une erreur
  const h4 = historiqueApres({ prixHistorique: h2 }, 25, new Date('2026-06-01'))
  eq(h4.length, 3, 'une correction le même jour est conservée')
}
{
  // L'historique ne grossit pas sans fin
  let a = { prixHistorique: [] }
  for (let i = 0; i < HISTORIQUE_MAX + 8; i++) {
    a = { prixHistorique: historiqueApres(a, 10 + i, new Date(2026, 0, 1 + i)) }
  }
  eq(a.prixHistorique.length, HISTORIQUE_MAX, 'l’historique est plafonné')
  eq(a.prixHistorique.at(-1).prix, 10 + HISTORIQUE_MAX + 7, 'ce sont les relevés RÉCENTS qui restent')
}
eq(historiqueApres({ prixHistorique: 'abîmé' }, 18, new Date('2026-01-15')),
  [{ date: '2026-01-15', prix: 18 }], 'un historique abîmé repart proprement')

// ─── Tendance ────────────────────────────────────────────────────────────────
eq(tendancePrix({ prixHistorique: [{ date: '2026-01-01', prix: 18 }, { date: '2026-06-01', prix: 24 }] }),
  { depuis: '2026-01-01', pct: 33.3, de: 18, a: 24 }, 'hausse d’un tiers')
eq(tendancePrix({ prixHistorique: [{ date: '2026-01-01', prix: 18 }] }), null,
  'un seul relevé ne fait pas une tendance')
eq(tendancePrix({ prixHistorique: [] }), null, 'aucun relevé')
eq(tendancePrix({ prixHistorique: [{ date: '2026-01-01', prix: 0 }, { date: '2026-06-01', prix: 24 }] }), null,
  'un départ à zéro ne donne pas un pourcentage infini')
eq(tendancePrix({}), null, 'article sans historique')

// ─── Écart ───────────────────────────────────────────────────────────────────
eq(ecart(310, 356), { budget: 310, reel: 356, montant: 46, pct: 14.8 }, 'dépassement')
eq(ecart(400, 350), { budget: 400, reel: 350, montant: -50, pct: -12.5 }, 'économie')
eq(ecart(0, 120), { budget: 0, reel: 120, montant: 120, pct: null },
  'sans budget, pas de pourcentage — et surtout pas Infinity à l’écran')
eq(ecart(0, 0), { budget: 0, reel: 0, montant: 0, pct: null }, 'rien contre rien')
eq(ecart('310', '356').montant, 46, 'des montants arrivant en texte sont acceptés')
eq(ecart(undefined, undefined), { budget: 0, reel: 0, montant: 0, pct: null }, 'valeurs absentes')

console.log(`✅ prixMateriaux — ${n} assertions`)
