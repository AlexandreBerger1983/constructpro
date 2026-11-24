// Tests de la section « Générale » : une pièce virtuelle dont les surfaces
// sont la somme de celles du devis.
import {
  GENERALE_ID, PIECE_GENERALE, estGenerale, sommeDesPieces, computeRoom,
} from './estimatorUtils.js'

let ok = 0, fail = 0
const eq = (label, got, want, tol = 0.02) => {
  if (typeof got === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want)) {
    ok++; console.log(`OK   ${label} = ${JSON.stringify(got)}`)
  } else { fail++; console.log(`ÉCHEC ${label} : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`) }
}
const vrai = (label, cond) => {
  if (cond) { ok++; console.log(`OK   ${label}`) }
  else { fail++; console.log(`ÉCHEC ${label}`) }
}

// Deux pièces en pieds : un salon et une chambre.
const salon = { length: 20, width: 15, height: 8 }
const chambre = { length: 12, width: 10, height: 8 }
const pieces = [salon, chambre]

// ─── Identité de la pièce virtuelle ─────────────────────────────────────────
vrai('la Générale se reconnaît', estGenerale(GENERALE_ID))
vrai('une vraie pièce n’est pas la Générale', !estGenerale(17) && !estGenerale('17'))
vrai('rien n’est pas la Générale', !estGenerale(null) && !estGenerale(undefined))
eq('la pièce virtuelle porte un nom', PIECE_GENERALE.name, 'Générale')
vrai('elle n’a pas de dimensions propres',
  PIECE_GENERALE.length === undefined && PIECE_GENERALE.width === undefined)

// ─── La somme est bien la somme ─────────────────────────────────────────────
const cs = computeRoom(salon, 'pi')
const cc = computeRoom(chambre, 'pi')
const total = sommeDesPieces(pieces, 'pi')
console.log(`Salon ${cs.floorArea} m² + chambre ${cc.floorArea} m² = ${total.floorArea} m²`)
for (const cle of ['floorArea', 'ceilArea', 'wallArea', 'perimeter']) {
  eq(`${cle} cumulé`, total[cle], cs[cle] + cc[cle])
}
vrai('la surface murale cumulée dépasse celle d’une seule pièce',
  total.wallArea > cs.wallArea && total.wallArea > cc.wallArea)

// ─── Cas limites ────────────────────────────────────────────────────────────
eq('aucune pièce : tout à zéro', sommeDesPieces([], 'pi'),
  { floorArea: 0, ceilArea: 0, wallArea: 0, perimeter: 0 })
eq('liste absente : tout à zéro', sommeDesPieces(undefined, 'pi'),
  { floorArea: 0, ceilArea: 0, wallArea: 0, perimeter: 0 })
eq('une seule pièce : la somme vaut la pièce', sommeDesPieces([salon], 'pi'), cs)
const abimee = sommeDesPieces([salon, { length: 'abc', width: null }], 'pi')
vrai('une pièce abîmée n’empoisonne pas la somme',
  Object.values(abimee).every(Number.isFinite) && abimee.floorArea === cs.floorArea)

// ─── L'unité de saisie est respectée ────────────────────────────────────────
// Les mêmes nombres saisis en mètres décrivent des pièces bien plus grandes.
const enMetres = sommeDesPieces(pieces, 'm')
vrai('les mêmes nombres en mètres donnent une surface plus grande',
  enMetres.floorArea > total.floorArea)
eq('le rapport suit la conversion pied → mètre',
  +(enMetres.floorArea / total.floorArea).toFixed(1), 10.8, 0.2)

// ─── Dix pièces : rien ne dérive ────────────────────────────────────────────
const dix = Array.from({ length: 10 }, () => salon)
eq('dix fois la même pièce', sommeDesPieces(dix, 'pi').floorArea, +(cs.floorArea * 10).toFixed(2), 0.05)

console.log(`\n${ok} réussis, ${fail} échoués`)
if (fail > 0) process.exit(1)
console.log('✅ La section Générale cumule correctement les surfaces du devis')
