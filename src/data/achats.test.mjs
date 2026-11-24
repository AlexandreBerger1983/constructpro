// Tests de la liste d'achat tirée d'une soumission acceptée.
//
// Le point qui commande tout : la part matériaux de la liste d'achat et celle
// du devis sont le MÊME calcul. Si elles divergeaient, on commanderait pour un
// montant que le client n'a pas accepté.
import assert from 'node:assert/strict'
import { listeAchat, budgetMateriaux, devisDeLaSoumission, CATEGORIE_AUTRE } from './achats.js'
import { repartitionLigne } from './tarification.js'

let n = 0
const ok = (c, m) => { assert.ok(c, m); n++ }
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++ }
const pres = (a, b, m) => { assert.ok(Math.abs(a - b) < 0.02, `${m} (${a} ≠ ${b})`); n++ }

// ─── Un devis représentatif ──────────────────────────────────────────────────
const devis = {
  number: 'SOM-2026-014',
  items: [
    // Démolition : pure main-d'œuvre, rien à acheter
    { id: 1, catalogId: 'demo-murs', description: 'Démolition — cloisons intérieures',
      unit: 'm²', qty: '30', unitMat: '0', unitLabor: '14' },
    // Ossature : 48 m² à 9,50 $ de matériaux
    { id: 2, catalogId: 'ossature-metal', description: 'Ossature métallique — murs',
      unit: 'm²', qty: '48', unitMat: '9.50', unitLabor: '14' },
    // Isolation : 48 m² à 7,50 $
    { id: 3, catalogId: 'iso-murs-r14', description: 'Isolant laine de roche — murs R14',
      unit: 'm²', qty: '48', unitMat: '7.50', unitLabor: '4' },
    // Une seconde ligne d'ossature, pour vérifier le regroupement
    { id: 4, catalogId: 'ossature-plafond', description: 'Ossature faux plafond',
      unit: 'm²', qty: '20', unitMat: '8', unitLabor: '12' },
  ],
}

{
  const liste = listeAchat(devis)
  eq(liste.lignes.length, 3, 'la ligne de démolition n’est pas à acheter')
  eq(liste.sansMateriel, 1, 'et elle est comptée comme telle plutôt que passée sous silence')

  pres(liste.budget, 48 * 9.5 + 48 * 7.5 + 20 * 8, 'budget matériaux total')

  // Le total de la liste est EXACTEMENT la somme des parts matériaux du devis
  const partsDevis = devis.items.reduce((s, it) => s + repartitionLigne(it).materiel, 0)
  pres(liste.budget, partsDevis, 'la liste d’achat et le devis comptent la même part matériaux')
}

// ─── Les quantités et unités sont celles du devis ────────────────────────────
{
  const ossature = listeAchat(devis).lignes.find(l => l.id === 2)
  eq(ossature.qty, 48, 'la quantité est reprise telle quelle')
  eq(ossature.unit, 'm²', 'l’unité aussi')
  eq(ossature.prixUnitaire, 9.5, 'le prix matériaux unitaire figé dans le devis')
  pres(ossature.budget, 456, '48 × 9,50 $')
  eq(ossature.materialId, null, 'une ligne de catalogue ne pointe aucun article d’inventaire')
}

// ─── Regroupement par catégorie ──────────────────────────────────────────────
{
  const { parCategorie } = listeAchat(devis)
  const noms = parCategorie.map(c => c.categorie)
  eq(noms.length, 2, 'deux catégories : ossature et isolation')
  ok(noms.includes('Ossature & Structure'), 'la catégorie vient du catalogue')
  ok(noms.includes('Isolation'), 'isolation présente')
  // La plus grosse dépense en tête : c'est l'ordre dans lequel on achète
  eq(parCategorie[0].categorie, 'Ossature & Structure', 'le plus gros poste en tête')
  pres(parCategorie[0].budget, 456 + 160, 'les deux lignes d’ossature sont additionnées')
  eq(parCategorie[0].lignes.length, 2, 'et listées ensemble')
  // La somme des catégories est le budget total
  pres(parCategorie.reduce((s, c) => s + c.budget, 0), listeAchat(devis).budget,
    'la somme des catégories est bien le total')
}

// ─── Forfaits et prix plancher ───────────────────────────────────────────────
{
  // Un forfait ne dit rien de sa part matériaux : elle est répartie au prorata
  // des prix unitaires de l'article. 500 $ × 9,50 / 23,50 = 202,13 $
  const auForfait = { number: 'X', items: [
    { id: 1, catalogId: 'ossature-metal', description: 'Ossature — forfait',
      unit: 'm²', qty: '48', unitMat: '9.50', unitLabor: '14',
      mode: 'gros', forfaitGros: 500 },
  ] }
  const liste = listeAchat(auForfait)
  pres(liste.budget, 202.13, 'la part matériaux d’un forfait est au prorata des prix unitaires')
  pres(liste.budget, repartitionLigne(auForfait.items[0]).materiel, 'et c’est bien le calcul du devis')
}
{
  // Prix plancher appliqué : la part matériaux suit le montant réellement
  // facturé, pas le brut
  const auPlancher = { number: 'X', items: [
    { id: 1, catalogId: 'ossature-metal', description: 'Petite reprise',
      unit: 'm²', qty: '1', unitMat: '9.50', unitLabor: '14', min: 150 },
  ] }
  pres(listeAchat(auPlancher).budget, 60.64, 'la part matériaux suit le montant minimum facturé')
}
{
  // Un forfait sur un article SANS prix unitaires : tout en main-d'œuvre,
  // donc rien à acheter. C'est l'hypothèse prudente de `tarification`.
  const service = { number: 'X', items: [
    { id: 1, catalogId: null, description: 'Gestion de chantier',
      unit: 'forfait', qty: '1', unitMat: '0', unitLabor: '0',
      mode: 'moyen', forfaitMoyen: 800 },
  ] }
  const liste = listeAchat(service)
  eq(liste.lignes.length, 0, 'un forfait de service n’entre pas dans la liste d’achat')
  eq(liste.sansMateriel, 1, 'il est compté à part')
  eq(liste.budget, 0, 'et ne gonfle pas le budget matériaux')
}

// ─── Lignes prises dans l'inventaire ─────────────────────────────────────────
const materiaux = [
  { id: 11, name: 'Panneau de gypse 5/8" (4x8)', category: 'Cloisons', unit: 'feuille',
    unitCost: 22.4, supplier: 'BMR Pro' },
  { id: 12, name: 'Peinture latex — Blanc', category: 'Peinture', unit: 'gallon',
    unitCost: 48, supplier: 'Benjamin Moore' },
]
{
  const avecInventaire = { number: 'X', items: [
    // Ligne issue de l'inventaire : pas de catalogId, description = nom exact
    { id: 1, catalogId: null, description: 'Panneau de gypse 5/8" (4x8)',
      unit: 'feuille', qty: '16', unitMat: '22.40', unitLabor: '0' },
    { id: 2, catalogId: 'ossature-metal', description: 'Ossature métallique — murs',
      unit: 'm²', qty: '48', unitMat: '9.50', unitLabor: '14' },
  ] }
  const liste = listeAchat(avecInventaire, materiaux)
  const gypse = liste.lignes.find(l => l.id === 1)
  eq(gypse.materialId, 11, 'la ligne est rattachée à l’article d’inventaire')
  eq(gypse.article, 'Panneau de gypse 5/8" (4x8)', 'son nom est repris')
  eq(gypse.fournisseur, 'BMR Pro', 'et son fournisseur, pour savoir où aller')
  eq(gypse.categorie, 'Cloisons', 'la catégorie vient alors de la fiche article')
  eq(liste.reconnues, 1, 'une seule ligne est reconnue dans l’inventaire')
  pres(gypse.budget, 358.4, '16 × 22,40 $')
}
{
  // Rapprochement par identifiant, quand la ligne le porte
  const parId = { number: 'X', items: [
    { id: 1, catalogId: null, materialId: 12, description: 'Peinture (nom modifié depuis)',
      unit: 'gallon', qty: '3', unitMat: '48', unitLabor: '0' },
  ] }
  eq(listeAchat(parId, materiaux).lignes[0].materialId, 12,
    'l’identifiant l’emporte, même si la description a changé')
}
{
  // Rapprochement par nom : accents et casse ignorés, comme pour les clients
  const accents = { number: 'X', items: [
    { id: 1, catalogId: null, description: 'PEINTURE LATEX — BLANC',
      unit: 'gallon', qty: '2', unitMat: '48', unitLabor: '0' },
  ] }
  eq(listeAchat(accents, materiaux).lignes[0].materialId, 12,
    'la casse ne doit pas empêcher le rapprochement')
}
{
  // Une ligne personnalisée qui ne correspond à rien reste dans la liste
  const inconnue = { number: 'X', items: [
    { id: 1, catalogId: null, description: 'Tablette sur mesure en noyer',
      unit: 'unité', qty: '1', unitMat: '240', unitLabor: '120' },
  ] }
  const l = listeAchat(inconnue, materiaux).lignes[0]
  eq(l.materialId, null, 'aucun article d’inventaire')
  eq(l.categorie, CATEGORIE_AUTRE, 'classée « Autre » plutôt que perdue')
  pres(l.budget, 240, 'et son budget matériaux est bien compté')
}

// ─── Robustesse ──────────────────────────────────────────────────────────────
eq(listeAchat(null).budget, 0, 'devis absent')
eq(listeAchat({}).lignes.length, 0, 'devis sans lignes')
eq(listeAchat({ items: 'abîmé' }).lignes.length, 0, 'lignes abîmées')
eq(listeAchat({ items: [null, undefined] }).lignes.length, 0, 'lignes vides écartées')
eq(listeAchat(devis, null).lignes.length, 3, 'inventaire absent : la liste marche quand même')
eq(listeAchat(devis, 'abîmé').lignes.length, 3, 'inventaire abîmé')
eq(budgetMateriaux(devis), listeAchat(devis).budget, 'le raccourci donne le même budget')
eq(budgetMateriaux(null), 0, 'budget d’un devis absent')
{
  // Un catalogId qui n'existe plus (article retiré du catalogue depuis)
  const disparu = { items: [{ id: 1, catalogId: 'article-supprime', description: 'Travail ancien',
    unit: 'm²', qty: '10', unitMat: '5', unitLabor: '5' }] }
  eq(listeAchat(disparu).lignes[0].categorie, CATEGORIE_AUTRE,
    'un article retiré du catalogue ne fait pas disparaître la ligne')
}

// ─── Le devis derrière une soumission ────────────────────────────────────────
const enregistres = [
  { id: 1, number: 'SOM-2026-013', items: [] },
  { id: 2, number: 'SOM-2026-014', items: devis.items },
]
eq(devisDeLaSoumission(enregistres, { number: 'SOM-2026-014' }).id, 2, 'retrouvé par son numéro')
eq(devisDeLaSoumission(enregistres, { number: 'SOM-2026-099' }), null, 'aucun devis correspondant')
eq(devisDeLaSoumission(enregistres, {}), null, 'soumission sans numéro')
eq(devisDeLaSoumission([], { number: 'SOM-2026-014' }), null, 'aucun devis enregistré')
eq(devisDeLaSoumission(null, { number: 'X' }), null, 'liste absente')
// Une soumission saisie à la main, sans devis d'estimateur derrière
eq(devisDeLaSoumission(enregistres, { number: 'FACT-001' }), null,
  'une soumission sans devis ne doit pas être rattachée au hasard')

console.log(`✅ achats — ${n} assertions`)
