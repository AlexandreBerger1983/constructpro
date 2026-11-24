// Tests du choix multiple des genres de travaux.
// L'exigence qui commande tout : la valeur enregistrée reste du TEXTE, pour
// que les devis déjà sauvegardés et tous les écrans qui l'affichent
// continuent de fonctionner sans migration.
import {
  typesDepuis, typesVers, basculerType, aLeType, SEPARATEUR_TYPES,
} from './estimatorUtils.js'

let ok = 0, fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a === b) { ok++; console.log(`OK   ${label} = ${a}`) }
  else { fail++; console.log(`ÉCHEC ${label} : obtenu ${a}, attendu ${b}`) }
}
const vrai = (label, cond) => {
  if (cond) { ok++; console.log(`OK   ${label}`) }
  else { fail++; console.log(`ÉCHEC ${label}`) }
}

// ─── Lecture de l'existant ──────────────────────────────────────────────────
// Un devis enregistré avant ce changement porte un seul genre, en texte.
eq('un ancien devis à un seul genre se relit', typesDepuis('Cuisine'), ['Cuisine'])
eq('plusieurs genres se relisent', typesDepuis('Cuisine · Peinture'), ['Cuisine', 'Peinture'])
eq('un tableau se relit aussi', typesDepuis(['Cuisine', 'Peinture']), ['Cuisine', 'Peinture'])
eq('une virgule sépare aussi', typesDepuis('Cuisine, Peinture'), ['Cuisine', 'Peinture'])
eq('les espaces en trop sont nettoyés', typesDepuis('  Cuisine  ·  Peinture '), ['Cuisine', 'Peinture'])
eq('un champ vide ne donne rien', typesDepuis(''), [])
eq('une valeur absente ne plante pas', typesDepuis(undefined), [])
eq('une valeur nulle ne plante pas', typesDepuis(null), [])
eq('les doublons sont écartés', typesDepuis('Cuisine · Cuisine'), ['Cuisine'])
eq('les cases vides sont écartées', typesDepuis('Cuisine ·  · Peinture'), ['Cuisine', 'Peinture'])

// ─── Écriture : toujours du texte ───────────────────────────────────────────
vrai('la valeur enregistrée est du texte', typeof typesVers(['Cuisine', 'Peinture']) === 'string')
eq('les genres sont joints par « · »', typesVers(['Cuisine', 'Peinture']), 'Cuisine · Peinture')
eq('un seul genre reste simple', typesVers(['Cuisine']), 'Cuisine')
eq('aucun genre donne une chaîne vide', typesVers([]), '')
vrai('le séparateur est bien celui attendu', SEPARATEUR_TYPES === ' · ')

// Aller-retour : ce qu'on écrit se relit à l'identique
for (const cas of [[], ['Cuisine'], ['Cuisine', 'Peinture', 'Toiture']]) {
  eq(`aller-retour sur ${JSON.stringify(cas)}`, typesDepuis(typesVers(cas)), cas)
}

// ─── Basculer un genre ──────────────────────────────────────────────────────
eq('ajouter un premier genre', basculerType('', 'Cuisine'), 'Cuisine')
eq('ajouter un second genre', basculerType('Cuisine', 'Peinture'), 'Cuisine · Peinture')
eq('retirer un genre déjà choisi', basculerType('Cuisine · Peinture', 'Cuisine'), 'Peinture')
eq('retirer le dernier genre', basculerType('Cuisine', 'Cuisine'), '')
eq('l’ordre de sélection est conservé',
  basculerType(basculerType(basculerType('', 'Toiture'), 'Cuisine'), 'Peinture'),
  'Toiture · Cuisine · Peinture')
eq('rebasculer deux fois revient au point de départ',
  basculerType(basculerType('Cuisine', 'Peinture'), 'Peinture'), 'Cuisine')
eq('un genre vide ne change rien', basculerType('Cuisine', ''), 'Cuisine')
eq('un genre absent ne change rien', basculerType('Cuisine', undefined), 'Cuisine')
vrai('basculer rend toujours du texte', typeof basculerType('Cuisine', 'Peinture') === 'string')

// ─── Savoir si un genre est choisi ──────────────────────────────────────────
vrai('un genre choisi est reconnu', aLeType('Cuisine · Peinture', 'Peinture'))
vrai('un genre non choisi ne l’est pas', !aLeType('Cuisine · Peinture', 'Toiture'))
vrai('un genre proche n’est pas confondu', !aLeType('Cuisine', 'Cuisines'))
vrai('rien de choisi : aucun genre reconnu', !aLeType('', 'Cuisine'))
vrai('« Portes & Fenêtres » survit au séparateur',
  aLeType(basculerType('Cuisine', 'Portes & Fenêtres'), 'Portes & Fenêtres'))

// Un genre contenant une virgule ne doit pas être coupé en deux. Le
// séparateur « · » est justement choisi pour ça, mais la lecture tolère la
// virgule pour les anciennes saisies : on vérifie que le cas est conscient.
eq('la virgule reste un séparateur à la lecture',
  typesDepuis('Rénovation générale, Toiture'), ['Rénovation générale', 'Toiture'])

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ Choix multiple des genres de travaux, enregistré en texte')
