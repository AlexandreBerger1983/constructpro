// Lien entre une soumission et un projet.
//
// Une soumission acceptée devient un chantier : c'est le cycle normal du
// métier, et jusqu'ici rien ne le reliait. Sur un projet, rien ne disait de
// quelle offre il venait ; sur une soumission acceptée, rien ne menait au
// chantier — il fallait rapprocher les deux de mémoire, par le nom du client.
//
// Le lien est porté par la SOUMISSION (`projectId`), pas par le projet. Un
// projet peut naître de plusieurs soumissions — les travaux de départ, puis un
// avenant — alors qu'une soumission ne sert qu'un seul chantier. Mettre la
// référence du côté « plusieurs » évite d'avoir à tenir une liste à jour des
// deux côtés, où elles finissent toujours par diverger.

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const memeId = (a, b) =>
  a != null && b != null && a !== '' && b !== '' && String(a) === String(b)

// Les soumissions rattachées à un projet, de la plus récente à la plus ancienne.
export const soumissionsDuProjet = (quotes = [], projectId) =>
  (Array.isArray(quotes) ? quotes : [])
    .filter(q => memeId(q?.projectId, projectId))
    .sort((a, b) => String(b?.date ?? '').localeCompare(String(a?.date ?? '')))

export const projetDeLaSoumission = (projects = [], quote) =>
  (Array.isArray(projects) ? projects : []).find(p => memeId(p?.id, quote?.projectId)) ?? null

// Ce que les soumissions d'un projet représentent. Les refusées ne comptent
// pas : elles n'engagent rien, et les faire entrer dans le montant gonflerait
// le chantier d'offres que le client a écartées.
export function totauxDesSoumissions(quotes = []) {
  const retenues = (Array.isArray(quotes) ? quotes : []).filter(q => q?.status !== 'Refusée')
  const acceptees = retenues.filter(q => q?.status === 'Acceptée')
  return {
    nombre: retenues.length,
    nombreAcceptees: acceptees.length,
    total: +retenues.reduce((s, q) => s + num(q?.total), 0).toFixed(2),
    totalAccepte: +acceptees.reduce((s, q) => s + num(q?.total), 0).toFixed(2),
  }
}

// Les projets qu'on peut proposer pour une soumission : ceux du même client
// d'abord, puis les autres. Proposer la liste entière sans ordre oblige à
// chercher ; la trier par client met presque toujours le bon en tête.
export function projetsProposables(projects = [], quote) {
  const liste = Array.isArray(projects) ? projects.filter(Boolean) : []
  const duClient = (p) =>
    memeId(p.clientId, quote?.clientId) ||
    (quote?.client && p.client === quote.client)
  return [
    ...liste.filter(duClient),
    ...liste.filter(p => !duClient(p)),
  ]
}

// Prochain code de projet, dans la même suite que ceux créés à la main.
export function prochainCodeProjet(projects = [], annee = new Date().getFullYear()) {
  const n = (Array.isArray(projects) ? projects : [])
    .filter(p => String(p?.code ?? '').includes(String(annee))).length
  return `PRJ-${annee}-${String(n + 1).padStart(3, '0')}`
}

// Le projet qu'on créerait à partir d'une soumission acceptée.
//
// Le budget part du total de la soumission : c'est le montant sur lequel le
// client s'est engagé, et donc l'enveloppe du chantier. Les dates restent
// vides — ce n'est pas à une soumission de décider d'un échéancier.
export function projetDepuisSoumission(quote, projects = []) {
  const titre = String(quote?.title ?? '').trim()
  return {
    code: prochainCodeProjet(projects),
    name: titre || `Travaux — ${quote?.client ?? 'client'}`,
    client: quote?.client ?? '',
    clientId: quote?.clientId ?? null,
    type: 'Résidentiel',
    status: 'En préparation',
    manager: '',
    startDate: '',
    endDate: '',
    budgetTotal: num(quote?.total),
    budgetSpent: 0,
    progress: 0,
    address: '',
    description: quote?.number ? `Issu de la soumission ${quote.number}.` : '',
    phases: [],
    tasks: [],
  }
}
