// Tests des initiales d'un compte.
import { initialesDe, initialesCompte } from './initiales.js'

let ok = 0, fail = 0
const eq = (label, got, want) => {
  if (got === want) { ok++; console.log(`OK   ${label} = ${got}`) }
  else { fail++; console.log(`ÉCHEC ${label} : obtenu « ${got} », attendu « ${want} »`) }
}

// ─── Noms ───────────────────────────────────────────────────────────────────
eq('Simon Gariépy', initialesDe('Simon Gariépy'), 'SG')
eq('Alexandre Berger', initialesDe('Alexandre Berger'), 'AB')
eq('un prénom composé ne garde que deux lettres', initialesDe('Jean-Pierre Tremblay'), 'JP')
eq('trois mots : les deux premières initiales', initialesDe('Marie Claude Dupont'), 'MC')
eq('un seul mot : ses deux lettres', initialesDe('Alexandre'), 'AL')
eq('espaces en trop', initialesDe('  Simon   Gariépy  '), 'SG')
eq('déjà en majuscules', initialesDe('SIMON GARIÉPY'), 'SG')

// ─── Courriels ──────────────────────────────────────────────────────────────
eq('un courriel se découpe aussi', initialesDe('cgf@videotron.ca'), 'CV')
eq('prénom.nom dans le courriel', initialesDe('simon.gariepy@exemple.ca'), 'SG')
eq('un courriel sans point', initialesDe('simon@exemple.ca'), 'SE')

// ─── Rien de lisible ────────────────────────────────────────────────────────
eq('vide', initialesDe(''), '?')
eq('absent', initialesDe(undefined), '?')
eq('nul', initialesDe(null), '?')
eq('que des séparateurs', initialesDe(' . @ - '), '?')
eq('repli personnalisé', initialesDe('', 'CP'), 'CP')

// ─── Le compte connecté fait foi ────────────────────────────────────────────
// Le défaut corrigé : connecté sous Simon, l'en-tête montrait « AB », les
// initiales du propriétaire rangé dans les Paramètres.
eq('connecté : le nom du profil, pas le propriétaire',
  initialesCompte({ connecte: true, profil: { nom: 'Simon Gariépy' }, ownerName: 'Alexandre Berger' }), 'SG')
eq('connecté sans nom de profil : le courriel',
  initialesCompte({ connecte: true, courriel: 'cgf@videotron.ca', ownerName: 'Alexandre Berger' }), 'CV')
eq('connecté sans rien : point d’interrogation',
  initialesCompte({ connecte: true, ownerName: 'Alexandre Berger' }), '?')
eq('hors connexion : le propriétaire',
  initialesCompte({ connecte: false, ownerName: 'Alexandre Berger' }), 'AB')
eq('hors connexion sans propriétaire : AB par défaut',
  initialesCompte({ connecte: false }), 'AB')
eq('aucun argument ne plante', initialesCompte(), 'AB')

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ Les initiales suivent le compte connecté')
