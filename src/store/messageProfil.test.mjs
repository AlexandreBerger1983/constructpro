// Tests des messages d'échec de lecture du profil.
//
// Trois causes très différentes — session périmée, droit manquant, profil
// réellement absent — s'affichaient auparavant d'une seule et même façon, qui
// accusait toujours schema.sql. Chacune appelle un geste différent : ces tests
// vérifient que chacune est reconnue et nommée.
import { messageProfil } from './messageProfil.js'

let ok = 0, fail = 0
const contient = (label, message, attendu) => {
  if (new RegExp(attendu, 'i').test(message)) { ok++; console.log(`OK   ${label}`) }
  else { fail++; console.log(`ÉCHEC ${label} : « ${message} » ne contient pas « ${attendu} »`) }
}
const vrai = (label, cond) => {
  if (cond) { ok++; console.log(`OK   ${label}`) }
  else { fail++; console.log(`ÉCHEC ${label}`) }
}

// ─── Aucune ligne : le profil n'existe pas ──────────────────────────────────
const aucuneLigne = messageProfil({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
contient('PGRST116 parle de la table profiles', aucuneLigne, 'profiles')
vrai('PGRST116 ne conseille PAS de se reconnecter', !/reconnect/i.test(aucuneLigne))
contient('le message sans code est reconnu aussi',
  messageProfil({ message: 'The result contains 0 rows' }), 'profil')

// ─── Droit manquant : presque toujours une session expirée ──────────────────
const refus = messageProfil({ code: '42501', message: 'permission denied for table profiles' })
contient('42501 dit de se reconnecter', refus, 'reconnect')
vrai('42501 n’accuse pas un profil absent', !/pas de profil/i.test(refus))
contient('« permission denied » sans code est reconnu',
  messageProfil({ message: 'permission denied for table profiles' }), 'reconnect')

// ─── Jeton expiré ───────────────────────────────────────────────────────────
contient('un JWT expiré dit de se reconnecter',
  messageProfil({ message: 'JWT expired' }), 'reconnect')

// ─── Réseau ─────────────────────────────────────────────────────────────────
const reseau = messageProfil({ message: 'TypeError: Failed to fetch' })
contient('une panne réseau parle de connexion internet', reseau, 'internet')
vrai('une panne réseau n’accuse pas la base de données vide', !/profil/i.test(reseau))

// ─── Cas non prévu : jamais de diagnostic inventé ───────────────────────────
// Montrer le message brut vaut mieux qu'une explication fausse : c'est
// exactement ce qui avait fait perdre du temps, un texte sur schema.sql
// s'affichant pour une cause qui n'avait rien à voir.
const inconnu = messageProfil({ code: 'XX000', message: 'quelque chose d’imprévu' })
contient('un cas non prévu montre le message brut', inconnu, 'quelque chose d’imprévu')
vrai('un cas non prévu n’invente pas de cause',
  !/schema\.sql|reconnect|internet/i.test(inconnu))
vrai('une erreur sans message ne produit pas « undefined »',
  !/undefined|null/i.test(messageProfil({})))
vrai('une erreur absente ne plante pas', typeof messageProfil(undefined) === 'string')
vrai('aucun message n’est vide',
  [undefined, {}, { code: 'X' }, { message: '' }].every(e => messageProfil(e).length > 10))

// ─── Plus aucun message n'accuse schema.sql à tort ──────────────────────────
// Seule l'absence réelle de profil doit renvoyer vers la base ; les autres
// causes ne doivent plus y envoyer l'utilisateur pour rien.
for (const cas of [
  { code: '42501', message: 'permission denied for table profiles' },
  { message: 'JWT expired' },
  { message: 'Failed to fetch' },
]) {
  vrai(`« ${cas.code ?? cas.message} » n’accuse pas schema.sql`,
    !/schema\.sql/i.test(messageProfil(cas)))
}

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ Chaque cause d’échec du profil est nommée pour ce qu’elle est')
