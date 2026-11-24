// Initiales affichées dans la pastille d'un compte.
//
// Le calcul vivait dans la barre latérale, et l'en-tête affichait « AB » écrit
// en dur : connecté sous un autre compte, on voyait donc les initiales de
// quelqu'un d'autre en haut de chaque écran. Une seule fonction, utilisée des
// deux côtés, évite que les deux pastilles se contredisent à nouveau.

// « Simon Gariépy » → SG · « cgf@videotron.ca » → CV · « Alexandre » → AL
export function initialesDe(texte, repli = '?') {
  const mots = String(texte ?? '')
    .split(/[\s.@_\-+]+/)
    .filter(Boolean)

  if (mots.length === 0) return repli
  // Un seul mot : ses deux premières lettres, faute de prénom et de nom.
  const brut = mots.length === 1
    ? mots[0].slice(0, 2)
    : mots.map(m => m[0]).join('')
  return (brut.slice(0, 2) || repli).toUpperCase()
}

// Les initiales à montrer, selon qu'un compte est connecté ou non.
//
// Connecté, c'est le compte qui fait foi — jamais le nom du propriétaire
// rangé dans les Paramètres, qui désigne l'entreprise et non la personne
// devant l'écran. Hors connexion (stockage du navigateur), le propriétaire
// est la seule identité disponible.
export const initialesCompte = ({ connecte, profil, courriel, ownerName } = {}) =>
  connecte
    ? initialesDe(profil?.nom || courriel, '?')
    : initialesDe(ownerName, 'AB')
