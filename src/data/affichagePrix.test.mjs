// Tests de l'affichage des prix en pieds.
// Le point à ne pas rater : changer d'unité ne doit modifier AUCUN prix.
import {
  estConvertible, uniteAffichee, versAffichage, versMetrique,
  pasDeSaisie, memePrix, formatPrixUnitaire,
} from './affichagePrix.js'
import { CATALOG, catalogDefaultPrice } from './estimatorCatalog.js'

let ok = 0, fail = 0
const eq = (label, got, want, tol = 0) => {
  if (Math.abs(got - want) <= tol) { ok++; console.log(`OK   ${label} = ${got}`) }
  else { fail++; console.log(`ÉCHEC ${label} : obtenu ${got}, attendu ${want}`) }
}
// Comparaison de texte : `eq` soustrait, ce qui ne veut rien dire sur un
// libellé — deux libellés différents s'y seraient vus « égaux ».
const eqTexte = (label, got, want) => {
  if (got === want) { ok++; console.log(`OK   ${label} = ${got}`) }
  else { fail++; console.log(`ÉCHEC ${label} : obtenu « ${got} », attendu « ${want} »`) }
}
const vrai = (label, cond) => {
  if (cond) { ok++; console.log(`OK   ${label}`) }
  else { fail++; console.log(`ÉCHEC ${label}`) }
}

// ─── Quelles unités se convertissent ────────────────────────────────────────
vrai('le mètre carré se convertit', estConvertible('m²'))
vrai('le mètre linéaire se convertit', estConvertible('m lin.'))
for (const u of ['unité', 'forfait', 'point', 'marche', 'hre'])
  vrai(`« ${u} » ne se convertit pas`, !estConvertible(u))

eqTexte('libellé en pieds carrés', uniteAffichee('m²', true), 'pi²')
eqTexte('libellé en pieds linéaires', uniteAffichee('m lin.', true), 'pi lin.')
eqTexte('en mode métrique, le libellé ne change pas', uniteAffichee('m²', false), 'm²')
eqTexte('une unité non convertible garde son libellé', uniteAffichee('unité', true), 'unité')

// ─── Sens de la conversion ──────────────────────────────────────────────────
// Un prix au pied carré est forcément PLUS PETIT qu'au mètre carré : un mètre
// carré couvre 10,76 pieds carrés. Se tromper de sens multiplierait les devis
// par cent.
const auPied = versAffichage(45, 'm²', true)
eq('45 $/m² s’affiche 4,18 $/pi²', auPied, 4.18)
vrai('le prix au pied carré est plus petit', auPied < 45)
eq('un prix au mètre linéaire', versAffichage(32.81, 'm lin.', true), 10)
eq('en mode métrique, rien ne bouge', versAffichage(45, 'm²', false), 45)
eq('une unité non convertible ne bouge jamais', versAffichage(250, 'forfait', true), 250)

// ─── Retour vers le stockage ────────────────────────────────────────────────
eq('4,18 $/pi² revient à 44,99 $/m²', versMetrique(4.18, 'm²', true), 44.993, 0.001)
eq('en mode métrique, la saisie est le stockage', versMetrique(45, 'm²', false), 45)
eq('une unité non convertible passe telle quelle', versMetrique(250, 'unité', true), 250)

// ─── Stabilité de l’aller-retour ────────────────────────────────────────────
// Afficher, retaper la valeur affichée, réafficher : le nombre montré ne doit
// pas dériver. Sans les quatre décimales au stockage, il glisserait à chaque
// passage et les prix s’éroderaient tout seuls.
for (const depart of [45, 55, 65, 70, 75, 12.5, 3.75, 120]) {
  let metrique = depart
  const premier = versAffichage(metrique, 'm²', true)
  for (let i = 0; i < 5; i++) {
    metrique = versMetrique(versAffichage(metrique, 'm²', true), 'm²', true)
  }
  eq(`${depart} $/m² reste stable après 5 allers-retours`, versAffichage(metrique, 'm²', true), premier)
}

// ─── Tolérance « c’est le même prix » ───────────────────────────────────────
// Retaper la valeur affichée ne doit pas marquer l’article comme modifié.
vrai('45 et 44,993 sont le même prix',
  memePrix(45, versMetrique(versAffichage(45, 'm²', true), 'm²', true), 'm²', true))
vrai('45 et 46 sont des prix différents', !memePrix(45, 46, 'm²', true))
vrai('45 et 45,10 sont des prix différents', !memePrix(45, 45.10, 'm²', true))
vrai('une vraie modification au pied carré est détectée',
  !memePrix(45, versMetrique(5, 'm²', true), 'm²', true))
// Le gros montant, qui faisait échouer une tolérance fixe : 980 $/m² s'affiche
// 298,70 $/pi² et revient à 979,99 $/m² — pour l'utilisateur, c'est le même prix.
vrai('980 $/m² reste le même prix après un aller-retour',
  memePrix(980, versMetrique(versAffichage(980, 'm²', true), 'm²', true), 'm²', true))
vrai('en mode métrique aussi', memePrix(45, 45, 'm²', false))

// ─── Écriture d'un prix unitaire ────────────────────────────────────────────
// Les cents doivent survivre : au pied carré, « 4 $ » au lieu de « 4,18 $ »
// perdrait 4 % du prix.
vrai('les cents sont conservés', /4[.,]18/.test(formatPrixUnitaire(4.18)))
vrai('un montant rond garde ses deux décimales', /45[.,]00/.test(formatPrixUnitaire(45)))
vrai('le symbole dollar est présent', formatPrixUnitaire(4.18).includes('$'))
vrai('une valeur abîmée ne produit pas NaN', !/NaN/.test(formatPrixUnitaire('abc')))

// ─── Pas de saisie ──────────────────────────────────────────────────────────
eq('pas de 0,05 $ au pied carré', pasDeSaisie('m²', true), 0.05)
eq('pas de 0,50 $ au mètre carré', pasDeSaisie('m²', false), 0.5)
eq('pas de 0,50 $ pour un forfait', pasDeSaisie('forfait', true), 0.5)

// ─── Sur le vrai catalogue ──────────────────────────────────────────────────
// Aucun article ne doit produire un affichage aberrant, et surtout aucun NaN
// ne doit pouvoir atterrir dans une case de prix.
let convertibles = 0
for (const item of CATALOG) {
  for (const champ of ['unitMat', 'unitLabor']) {
    const metrique = catalogDefaultPrice(item.id, champ)
    const affiche = versAffichage(metrique, item.unit, true)
    if (!Number.isFinite(affiche)) { fail++; console.log(`ÉCHEC ${item.id}.${champ} affiche ${affiche}`); continue }
    if (affiche < 0) { fail++; console.log(`ÉCHEC ${item.id}.${champ} affiche un prix négatif`); continue }
    const retour = versMetrique(affiche, item.unit, true)
    if (!memePrix(metrique, retour, item.unit, true)) {
      fail++; console.log(`ÉCHEC ${item.id}.${champ} : ${metrique} → ${affiche} → ${retour}`)
    } else ok++
  }
  if (estConvertible(item.unit)) convertibles++
}
console.log(`\n${CATALOG.length} articles, dont ${convertibles} convertibles en pieds`)
vrai('le catalogue contient des articles au mètre carré', convertibles > 30)

// La céramique, qui est à l'origine de la demande
const ceramique = CATALOG.filter(c => /céramique|dosseret/i.test(c.label))
console.log('\nCéramique — main-d’œuvre :')
for (const c of ceramique) {
  const m = catalogDefaultPrice(c.id, 'unitLabor')
  console.log(`  ${c.label.padEnd(42)} ${m} $/${c.unit}  =  ${versAffichage(m, c.unit, true)} $/${uniteAffichee(c.unit, true)}`)
}
vrai('les quatre articles de céramique sont trouvés', ceramique.length === 4)
vrai('tous sont au mètre carré, donc convertibles', ceramique.every(c => estConvertible(c.unit)))

// ─── Valeurs abîmées ────────────────────────────────────────────────────────
for (const mauvaise of ['', 'abc', null, undefined, NaN]) {
  vrai(`« ${String(mauvaise)} » à l’affichage → 0`, versAffichage(mauvaise, 'm²', true) === 0)
  vrai(`« ${String(mauvaise)} » au stockage → 0`, versMetrique(mauvaise, 'm²', true) === 0)
}

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ Les prix s’affichent en pieds sans qu’aucun prix ne change')
