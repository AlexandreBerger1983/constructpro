// Tests du journal des mouvements de stock.
//
// Ce qui est vraiment vérifié ici : qu'un prix figé reste figé. Un mouvement
// enregistré hier doit valoir ce qu'il valait hier, même si le prix de
// l'article a changé deux fois depuis — c'est toute la raison d'être du
// journal.
import assert from 'node:assert/strict'
import {
  ACHAT, CONSOMMATION, AJUSTEMENT, TYPES_MOUVEMENT, estTypeValide,
  validerMouvement, appliquerMouvement, montantMouvement, coutChantier,
  mouvementsDe, consommationDuProjet, consommationParProjet, dernierPrixPaye,
  nouveauMouvement,
} from './mouvements.js'

let n = 0
const ok = (c, m) => { assert.ok(c, m); n++ }
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++ }

// ─── Types ───────────────────────────────────────────────────────────────────
ok(estTypeValide(ACHAT) && estTypeValide(CONSOMMATION) && estTypeValide(AJUSTEMENT), 'les trois types')
ok(!estTypeValide('autre'), 'un type inventé est refusé')
ok(!estTypeValide(undefined), 'pas de type')
ok(TYPES_MOUVEMENT[ACHAT].prixSaisi, 'seul l’achat demande un prix')
ok(!TYPES_MOUVEMENT[CONSOMMATION].prixSaisi, 'la consommation n’en demande pas')
ok(!TYPES_MOUVEMENT[AJUSTEMENT].prixSaisi, 'l’ajustement non plus')

// ─── Validation ──────────────────────────────────────────────────────────────
eq(validerMouvement({ type: ACHAT, materialId: 1, qty: 10, prixUnitaire: 24 }), null, 'achat valide')
eq(validerMouvement({ type: CONSOMMATION, materialId: 1, qty: -5 }), null,
  'une consommation NÉGATIVE est valide — c’est un retour de chantier')
eq(validerMouvement({ type: AJUSTEMENT, materialId: 1, qty: -2 }), null, 'ajustement négatif valide')
ok(/zéro/.test(validerMouvement({ type: ACHAT, materialId: 1, qty: 0, prixUnitaire: 24 })),
  'une quantité nulle est refusée : elle n’a aucun effet')
ok(/article/.test(validerMouvement({ type: ACHAT, qty: 10, prixUnitaire: 24 })), 'sans article')
ok(/inconnu/.test(validerMouvement({ type: 'bidon', materialId: 1, qty: 1 })), 'type inconnu')
ok(/négatif/.test(validerMouvement({ type: ACHAT, materialId: 1, qty: 5, prixUnitaire: -3 })),
  'un prix payé négatif est refusé')
ok(/payé/.test(validerMouvement({ type: ACHAT, materialId: 1, qty: -5, prixUnitaire: 0 })),
  'un retour au fournisseur demande le prix d’origine')
eq(validerMouvement({ type: ACHAT, materialId: 1, qty: -5, prixUnitaire: 18 }), null,
  'un retour au fournisseur avec son prix est valide')
// Un identifiant d'article arrivant en texte depuis un menu déroulant
eq(validerMouvement({ type: CONSOMMATION, materialId: '7', qty: 3 }), null, 'identifiant en texte')
ok(/article/.test(validerMouvement({ type: CONSOMMATION, materialId: '', qty: 3 })), 'identifiant vide')

// ─── Application : achat ─────────────────────────────────────────────────────
{
  // 10 feuilles en stock à 18 $, on en reçoit 10 à 24 $
  const article = { id: 1, stock: 10, unitCost: 18 }
  const r = appliquerMouvement(article, { type: ACHAT, qty: 10, prixUnitaire: 24 })
  eq(r.prixUnitaire, 24, 'l’achat fige le prix de la facture')
  eq(r.article.stock, 20, 'le stock monte')
  eq(r.article.coutMoyen, 21, 'le coût moyen devient 21 $')
}
{
  // Le prix de référence de l'article NE doit pas servir au prix figé
  const article = { id: 1, stock: 0, unitCost: 99 }
  const r = appliquerMouvement(article, { type: ACHAT, qty: 5, prixUnitaire: 24 })
  eq(r.prixUnitaire, 24, 'c’est le prix payé qui est figé, pas le prix de référence')
  eq(r.article.coutMoyen, 24, 'et c’est lui qui fait la moyenne')
}
{
  // Retour au fournisseur : le stock baisse, la moyenne ne bouge pas
  const article = { id: 1, stock: 20, coutMoyen: 21, unitCost: 24 }
  const r = appliquerMouvement(article, { type: ACHAT, qty: -5, prixUnitaire: 24 })
  eq(r.article.stock, 15, 'le stock baisse')
  eq(r.article.coutMoyen, 21, 'un retour ne déplace pas la moyenne')
}

// ─── Application : consommation ──────────────────────────────────────────────
{
  const article = { id: 1, stock: 20, coutMoyen: 21, unitCost: 24 }
  const r = appliquerMouvement(article, { type: CONSOMMATION, qty: -8, projectId: 3 })
  eq(r.prixUnitaire, 21, 'une sortie est valorisée au coût moyen du moment, pas au prix du jour')
  eq(r.article.stock, 12, 'le stock baisse de huit')
  eq(r.article.coutMoyen, 21, 'une sortie ne change pas ce que le reste a coûté')
}
{
  // Retour de chantier : quantité positive sur une consommation
  const article = { id: 1, stock: 12, coutMoyen: 21 }
  const r = appliquerMouvement(article, { type: CONSOMMATION, qty: 3, projectId: 3 })
  eq(r.article.stock, 15, 'le retour remonte le stock')
  eq(r.article.coutMoyen, 21, 'et ne déplace pas la moyenne')
  eq(r.prixUnitaire, 21, 'au coût moyen, comme la sortie qu’il annule')
}
{
  // Stock négatif AUTORISÉ : le chantier a posé plus que ce que l'app croyait
  const article = { id: 1, stock: 3, coutMoyen: 21 }
  const r = appliquerMouvement(article, { type: CONSOMMATION, qty: -5, projectId: 3 })
  eq(r.article.stock, -2,
    'le stock devient négatif plutôt que de refuser la saisie : le décompte est faux, et il faut le voir')
}
{
  // Un article jamais mouvementé : le coût moyen part du prix de référence
  const article = { id: 1, stock: 10, unitCost: 18 }
  const r = appliquerMouvement(article, { type: CONSOMMATION, qty: -2 })
  eq(r.prixUnitaire, 18, 'à défaut d’historique, le prix de référence sert de base')
}
{
  // Article abîmé : ne doit pas produire NaN
  const r = appliquerMouvement({}, { type: CONSOMMATION, qty: -1 })
  eq(r.prixUnitaire, 0, 'article vide')
  eq(r.article.stock, -1, 'stock calculé quand même')
  ok(Number.isFinite(r.article.coutMoyen), 'aucun NaN')
}

// ─── LE POINT CRUCIAL : un prix figé ne bouge plus ───────────────────────────
{
  // On enchaîne : achat à 18, consommation, puis le prix double, puis nouvel
  // achat. Le premier mouvement doit valoir exactement ce qu'il valait.
  let article = { id: 1, stock: 0, unitCost: 18 }
  const journal = []

  const passer = (mvt) => {
    const r = appliquerMouvement(article, mvt)
    journal.push({ ...mvt, id: journal.length + 1, prixUnitaire: r.prixUnitaire })
    article = { ...article, ...r.article }
  }

  passer({ type: ACHAT, qty: 10, prixUnitaire: 18, date: '2026-03-01' })
  passer({ type: CONSOMMATION, qty: -4, projectId: 7, date: '2026-03-10' })
  // Le prix de référence double — l'entreprise met la fiche à jour
  article = { ...article, unitCost: 36 }
  passer({ type: ACHAT, qty: 10, prixUnitaire: 36, date: '2026-09-01' })
  passer({ type: CONSOMMATION, qty: -4, projectId: 8, date: '2026-09-10' })

  eq(journal[0].prixUnitaire, 18, 'le premier achat reste à 18 $')
  eq(journal[1].prixUnitaire, 18, 'la consommation de mars reste valorisée à 18 $')
  eq(journal[2].prixUnitaire, 36, 'le second achat est à 36 $')
  // Coût moyen après le second achat : (6 × 18 + 10 × 36) / 16 = 29,25
  eq(journal[3].prixUnitaire, 29.25, 'la consommation de septembre est au coût moyen du moment')

  // Le chantier de mars n'a pas été rendu plus cher par la hausse
  eq(consommationDuProjet(journal, 7).cout, 72, 'le chantier de mars a coûté 72 $, hier comme aujourd’hui')
  eq(consommationDuProjet(journal, 8).cout, 117, 'celui de septembre, 117 $')
  eq(article.stock, 12, 'stock final')
}

// ─── Montants et sens ────────────────────────────────────────────────────────
eq(montantMouvement({ qty: 10, prixUnitaire: 24 }), 240, 'une entrée ajoute de la valeur')
eq(montantMouvement({ qty: -8, prixUnitaire: 21 }), -168, 'une sortie en retire')
eq(coutChantier({ qty: -8, prixUnitaire: 21 }), 168, 'consommer coûte au chantier')
eq(coutChantier({ qty: 3, prixUnitaire: 21 }), -63, 'un retour le crédite')
eq(montantMouvement({}), 0, 'mouvement vide')

// ─── Lecture du journal ──────────────────────────────────────────────────────
const journal = [
  { id: 1, type: ACHAT, materialId: 1, qty: 10, prixUnitaire: 18, date: '2026-03-01' },
  { id: 2, type: CONSOMMATION, materialId: 1, qty: -4, prixUnitaire: 18, projectId: 7, date: '2026-03-10' },
  { id: 3, type: CONSOMMATION, materialId: 2, qty: -2, prixUnitaire: 50, projectId: 7, date: '2026-04-02' },
  { id: 4, type: CONSOMMATION, materialId: 1, qty: -1, prixUnitaire: 18, projectId: 8, date: '2026-04-05' },
  { id: 5, type: ACHAT, materialId: 1, qty: 20, prixUnitaire: 24, date: '2026-05-01' },
  { id: 6, type: AJUSTEMENT, materialId: 1, qty: -1, prixUnitaire: 22, date: '2026-05-02' },
]

eq(mouvementsDe(journal).map(m => m.id), [6, 5, 4, 3, 2, 1], 'du plus récent au plus ancien')
eq(mouvementsDe(journal, { materialId: 1 }).map(m => m.id), [6, 5, 4, 2, 1], 'filtré par article')
eq(mouvementsDe(journal, { projectId: 7 }).map(m => m.id), [3, 2], 'filtré par chantier')
eq(mouvementsDe(journal, { type: ACHAT }).map(m => m.id), [5, 1], 'filtré par type')
eq(mouvementsDe(journal, { materialId: '1', type: CONSOMMATION }).map(m => m.id), [4, 2],
  'identifiant en texte, comme il arrive d’un menu déroulant')
eq(mouvementsDe([]).length, 0, 'journal vide')
eq(mouvementsDe(null).length, 0, 'journal absent')
eq(mouvementsDe([null, undefined, { id: 1, type: ACHAT }]).length, 1, 'les entrées abîmées sont écartées')

// ─── Consommation par chantier ───────────────────────────────────────────────
{
  const c7 = consommationDuProjet(journal, 7)
  eq(c7.cout, 172, 'chantier 7 : 4 × 18 + 2 × 50 = 172 $')
  eq(c7.nombre, 2, 'deux mouvements')
  // L'ACHAT du 1er mai ne doit pas entrer dans un coût de chantier
  const c8 = consommationDuProjet(journal, 8)
  eq(c8.cout, 18, 'chantier 8 : un seul article sorti')
  eq(consommationDuProjet(journal, 99).cout, 0, 'un chantier sans consommation')
}
{
  const parProjet = consommationParProjet(journal)
  eq(parProjet.length, 2, 'deux chantiers ont consommé')
  eq(parProjet[0], { projectId: 7, cout: 172, nombre: 2 }, 'le plus gros en tête')
  eq(parProjet[1], { projectId: 8, cout: 18, nombre: 1 }, 'puis l’autre')
  // Un ajustement d'inventaire n'est pas une consommation de chantier
  ok(!parProjet.some(p => p.projectId === null), 'l’ajustement sans chantier n’apparaît pas')
}
{
  // Une consommation sans chantier est regroupée à part, pas perdue
  const avecOrphelin = [...journal,
    { id: 7, type: CONSOMMATION, materialId: 1, qty: -2, prixUnitaire: 20, date: '2026-06-01' }]
  const p = consommationParProjet(avecOrphelin)
  ok(p.some(x => x.projectId === null && x.cout === 40),
    'une sortie sans chantier est regroupée séparément plutôt que jetée')
}

// ─── Dernier prix payé ───────────────────────────────────────────────────────
eq(dernierPrixPaye(journal, 1), { prix: 24, date: '2026-05-01' }, 'le dernier achat de l’article 1')
eq(dernierPrixPaye(journal, 2), null, 'aucun achat enregistré pour l’article 2')
eq(dernierPrixPaye([], 1), null, 'journal vide')
{
  // Un retour au fournisseur n'est pas un « dernier prix payé »
  const avecRetour = [...journal,
    { id: 8, type: ACHAT, materialId: 1, qty: -3, prixUnitaire: 24, date: '2026-06-01' }]
  eq(dernierPrixPaye(avecRetour, 1), { prix: 24, date: '2026-05-01' },
    'un retour ne compte pas comme un achat')
}

// ─── Construction d'un mouvement ─────────────────────────────────────────────
{
  const m = nouveauMouvement({ type: CONSOMMATION, materialId: 1, qty: '-4.5', prixUnitaire: '21', projectId: 7 })
  eq(m.qty, -4.5, 'la quantité est un nombre, négatif conservé')
  eq(m.prixUnitaire, 21, 'le prix est un nombre')
  eq(m.projectId, 7, 'le chantier est conservé')
  eq(m.note, '', 'les champs absents sont vides, pas undefined')
  eq(m.fournisseur, '', 'fournisseur vide')
  ok(/^\d{4}-\d{2}-\d{2}$/.test(m.date), 'la date est du jour, au bon format')
  ok(Number.isFinite(m.id), 'un identifiant est attribué')
}
eq(nouveauMouvement({ type: ACHAT, materialId: 1, qty: 'abc', prixUnitaire: 'xyz' }).qty, 0,
  'des valeurs illisibles donnent zéro, pas NaN')
eq(nouveauMouvement({ type: CONSOMMATION, materialId: 1, qty: -1 }).projectId, null,
  'sans chantier, c’est null et non undefined')

console.log(`✅ mouvements — ${n} assertions`)
