// Ce qu'on dit à l'utilisateur quand la base refuse quelque chose.
//
// Le bandeau d'erreur n'avait qu'un seul titre — « Modification non
// enregistrée » — pour toutes les pannes, y compris les pannes de LECTURE.
// Une table manquante affichait donc qu'une modification avait été perdue
// alors que rien n'avait été modifié, puis conseillait de recharger pour voir
// l'état réel : un rechargement relance exactement la même lecture et ramène
// exactement la même erreur. Le message envoyait chercher au mauvais endroit
// et bouclait.
//
// Deux choses à distinguer, donc : ce qui a échoué (lire ou écrire), et si
// recharger peut y faire quoi que ce soit.

export const LECTURE = 'lecture'
export const ECRITURE = 'ecriture'

// Une table absente de la base. Supabase répond « Could not find the table
// 'public.x' in the schema cache » ; PostgREST en direct, « relation … does
// not exist ». Les deux veulent dire la même chose : le schéma de la base est
// en retard sur l'application.
const TABLE_MANQUANTE = /schema cache|does not exist|undefined table|PGRST205/i

// Les droits d'accès à l'API, distincts des règles de sécurité par ligne.
const DROITS_MANQUANTS = /permission denied/i

export function diagnostic(erreur, type = ECRITURE) {
  const texte = typeof erreur === 'string' ? erreur : (erreur?.texte ?? '')
  const genre = (typeof erreur === 'object' && erreur?.type) || type

  if (TABLE_MANQUANTE.test(texte)) {
    return {
      titre: 'La base de données n’est pas à jour',
      detail: texte,
      conseil:
        'Une table manque dans la base. Ouvrez le SQL Editor de Supabase et rejouez ' +
        'supabase/schema.sql — il est fait pour être rejoué sans risque. ' +
        'Recharger n’y changera rien tant que la table n’existe pas.',
      rechargerUtile: false,
    }
  }

  if (DROITS_MANQUANTS.test(texte)) {
    return {
      titre: 'Accès refusé par la base',
      detail: texte,
      conseil:
        'Le compte connecté n’a pas les droits sur cette table. Rejouez ' +
        'supabase/schema.sql pour rétablir les permissions, ou vérifiez le rôle du profil.',
      rechargerUtile: false,
    }
  }

  if (genre === LECTURE) {
    return {
      titre: 'Données incomplètes',
      detail: texte,
      conseil:
        'Une partie des données n’a pas pu être lue. Ce qui s’affiche est incomplet, ' +
        'mais rien n’est perdu dans la base.',
      rechargerUtile: true,
    }
  }

  return {
    titre: 'Modification non enregistrée',
    detail: texte,
    conseil:
      'Ce qui s’affiche à l’écran n’est peut-être pas ce que contient la base. ' +
      'Rechargez pour voir l’état réel.',
    rechargerUtile: true,
  }
}
