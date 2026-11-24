// Tests du message affiché quand la base refuse quelque chose.
//
// Le défaut corrigé : une table manquante affichait « Modification non
// enregistrée » alors que rien n'avait été modifié, et conseillait de
// recharger — ce qui relance la même lecture et ramène la même erreur. Le
// message envoyait chercher au mauvais endroit, et bouclait.
import assert from 'node:assert/strict'
import { diagnostic, LECTURE, ECRITURE } from './messageErreur.js'

let n = 0
const ok = (c, m) => { assert.ok(c, m); n++ }
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++ }

// ─── LE CAS RÉEL : la table mouvements n'existait pas encore ────────────────
{
  const vu = "Chargement partiel — mouvements : Could not find the table 'public.mouvements' in the schema cache"
  const d = diagnostic({ texte: vu, type: LECTURE })
  eq(d.titre, 'La base de données n’est pas à jour',
    'une table manquante n’est pas une modification perdue')
  ok(/schema\.sql/.test(d.conseil), 'le conseil nomme le fichier à rejouer')
  ok(/SQL Editor/.test(d.conseil), 'et où le rejouer')
  eq(d.rechargerUtile, false,
    'recharger relancerait la même lecture : le bouton ne doit pas être proposé')
  ok(d.detail.includes('mouvements'), 'le message d’origine reste visible, pour savoir quelle table')
}

// Les deux formulations possibles du même problème
for (const texte of [
  "Could not find the table 'public.mouvements' in the schema cache",
  'relation "public.mouvements" does not exist',
  'PGRST205: table not found',
  'ERROR: undefined table',
]) {
  eq(diagnostic({ texte, type: LECTURE }).rechargerUtile, false, `table manquante reconnue : ${texte.slice(0, 40)}`)
}

// ─── Droits d'accès à l'API ─────────────────────────────────────────────────
{
  const d = diagnostic({ texte: 'permission denied for table materials', type: LECTURE })
  eq(d.titre, 'Accès refusé par la base', 'un refus de droits se dit comme tel')
  eq(d.rechargerUtile, false, 'recharger ne rend pas des droits')
  ok(/schema\.sql|rôle/.test(d.conseil), 'le conseil mène vers les permissions')
}

// ─── Panne de lecture ordinaire ─────────────────────────────────────────────
{
  const d = diagnostic({ texte: 'Chargement partiel — clients : network timeout', type: LECTURE })
  eq(d.titre, 'Données incomplètes', 'une lecture ratée n’annonce pas une modification perdue')
  eq(d.rechargerUtile, true, 'recharger a du sens sur une panne réseau')
  ok(/rien n’est perdu/.test(d.conseil), 'et on rassure : la base n’a pas changé')
}

// ─── Panne d'écriture ───────────────────────────────────────────────────────
{
  const d = diagnostic({ texte: 'Enregistrement impossible : network error', type: ECRITURE })
  eq(d.titre, 'Modification non enregistrée', 'là, le titre d’origine est le bon')
  eq(d.rechargerUtile, true, 'et recharger montre l’état réel')
  ok(/état réel/.test(d.conseil), 'le conseil d’origine est conservé')
}

// Une écriture sur une table manquante reste d'abord un problème de schéma :
// dire « modification non enregistrée » ferait ressaisir dans le vide.
{
  const d = diagnostic({ texte: "Could not find the table 'public.mouvements' in the schema cache", type: ECRITURE })
  eq(d.titre, 'La base de données n’est pas à jour', 'le schéma passe avant le sens de l’opération')
  eq(d.rechargerUtile, false, 'ressaisir ou recharger n’y changerait rien')
}

// ─── Robustesse ─────────────────────────────────────────────────────────────
eq(diagnostic('une erreur en texte brut').titre, 'Modification non enregistrée',
  'une chaîne seule est traitée comme une écriture, le cas d’origine')
eq(diagnostic('une erreur en texte brut', LECTURE).titre, 'Données incomplètes',
  'le type peut être donné en second argument')
eq(diagnostic(null).detail, '', 'une erreur absente ne produit pas « null » à l’écran')
eq(diagnostic(undefined).titre, 'Modification non enregistrée', 'ni undefined')
eq(diagnostic({}).detail, '', 'un objet vide non plus')
ok(diagnostic({ texte: '' }).conseil.length > 0, 'il y a toujours un conseil')
for (const d of [diagnostic(null), diagnostic({}), diagnostic('x')]) {
  ok(typeof d.titre === 'string' && d.titre.length > 0, 'un titre est toujours fourni')
  ok(typeof d.rechargerUtile === 'boolean', 'rechargerUtile est toujours un booléen')
}

console.log(`✅ messageErreur — ${n} assertions`)
