// Pourquoi la lecture du profil a échoué, dite en clair.
//
// Ce module est séparé d'AuthContext.jsx pour une raison pratique : node ne
// sait pas charger un fichier .jsx, donc une logique enfermée là-dedans n'est
// pas vérifiable par un test. C'est précisément ce qui avait permis à un
// message unique et faux de survivre.

// Pourquoi le profil n'a pas pu être lu.
//
// Ce message affichait auparavant une seule phrase, qui accusait toujours
// schema.sql. L'erreur réelle était jetée — et trois causes très différentes
// se présentaient donc à l'utilisateur de la même façon : une session périmée,
// un droit manquant et un profil réellement absent. Chacune appelle un geste
// différent, et aucune n'était reconnaissable.
export function messageProfil(erreur) {
  const brut = erreur?.message ?? ''
  const code = erreur?.code ?? ''

  // PGRST116 : la requête n'a ramené aucune ligne. Le compte existe côté
  // authentification mais n'a pas de profil, ou les règles d'accès ne le lui
  // montrent pas.
  if (code === 'PGRST116' || /0 rows|no rows/i.test(brut))
    return "Ce compte est connecté mais n'a pas de profil dans la base. "
         + 'Dans Supabase, vérifiez que le compte figure dans la table profiles.'

  // 42501 : le rôle qui interroge n'a pas le droit de lire la table. En
  // pratique, c'est presque toujours une session expirée : la requête retombe
  // alors sur le rôle « visiteur non connecté », qui n'a aucun droit.
  if (code === '42501' || /permission denied/i.test(brut))
    return 'Votre session a expiré ou n’a plus les droits nécessaires. '
         + 'Déconnectez-vous puis reconnectez-vous.'

  if (/jwt|token|expired/i.test(brut))
    return 'Votre session a expiré. Déconnectez-vous puis reconnectez-vous.'

  if (/failed to fetch|network/i.test(brut))
    return 'Impossible de joindre la base de données. Vérifiez votre connexion internet.'

  // Cas non prévu : on montre le message brut plutôt que d'inventer une
  // explication. Un message technique vaut mieux qu'un diagnostic faux.
  return brut
    ? `La lecture du profil a échoué : ${brut}`
    : 'La lecture du profil a échoué, sans message de la base.'
}
