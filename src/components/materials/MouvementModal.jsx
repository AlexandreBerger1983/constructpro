import { useMemo, useState } from 'react'
import { X, ArrowDownToLine, ArrowUpFromLine, Scale, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import {
  ACHAT, CONSOMMATION, AJUSTEMENT, TYPES_MOUVEMENT,
  validerMouvement, appliquerMouvement, nouveauMouvement,
} from '../../data/mouvements'
import { coutMoyenInitial } from '../../data/prixMateriaux'
// Au cent près : un coût moyen arrondi au dollar ferait mentir l'aperçu.
import { formatPrixUnitaire } from '../../data/affichagePrix'

// Saisie d'un mouvement de stock.
//
// Une fenêtre à part plutôt que le formulaire générique : le prix ne se
// demande que pour un achat, et surtout l'écran doit montrer D'AVANCE ce que
// le mouvement va faire au stock et au coût moyen. Inscrire un mouvement sans
// voir son effet, c'est ce qui fait qu'on s'aperçoit d'une erreur de signe
// trois semaines plus tard.

const ICONES = {
  [ACHAT]: ArrowDownToLine,
  [CONSOMMATION]: ArrowUpFromLine,
  [AJUSTEMENT]: Scale,
}

const nombre = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export default function MouvementModal({ article, projets = [], typeInitial = CONSOMMATION, onEnregistrer, onClose }) {
  const [type, setType] = useState(typeInitial)
  // La quantité se saisit en POSITIF et le sens vient du type : « 8 » en
  // consommation sort 8 unités. Demander un nombre négatif pour l'usage
  // courant garantit des erreurs de signe. Le négatif reste possible — case
  // « retour » — parce qu'il faut bien pouvoir corriger et reprendre.
  const [quantite, setQuantite] = useState('')
  const [retour, setRetour] = useState(false)
  const [prix, setPrix] = useState(String(article?.unitCost ?? ''))
  const [projectId, setProjectId] = useState('')
  const [fournisseur, setFournisseur] = useState(article?.supplier ?? '')
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState(null)

  const def = TYPES_MOUVEMENT[type]
  const Icone = ICONES[type]

  // Le signe réel appliqué au stock.
  const signe = useMemo(() => {
    if (type === ACHAT) return retour ? -1 : 1
    if (type === CONSOMMATION) return retour ? 1 : -1
    // Un ajustement n'a pas de sens par défaut : on le choisit explicitement.
    return retour ? 1 : -1
  }, [type, retour])

  const qty = +(nombre(quantite) * signe).toFixed(4)

  const brouillon = {
    type,
    materialId: article?.id,
    qty,
    prixUnitaire: type === ACHAT ? nombre(prix) : undefined,
    projectId: projectId || null,
  }

  // Aperçu de l'effet, recalculé à chaque frappe par la même fonction qui
  // l'appliquera pour de vrai : l'aperçu ne peut donc pas mentir.
  const apercu = useMemo(
    () => (qty !== 0 ? appliquerMouvement(article, brouillon) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [article, type, qty, prix, projectId],
  )

  const cmpAvant = coutMoyenInitial(article)
  const stockAvant = nombre(article?.stock)

  const soumettre = (e) => {
    e.preventDefault()
    const probleme = validerMouvement(brouillon)
    if (probleme) { setErreur(probleme); return }
    const { prixUnitaire, article: majArticle } = appliquerMouvement(article, brouillon)
    onEnregistrer({
      mouvement: nouveauMouvement({
        type, materialId: article.id, qty, prixUnitaire,
        projectId: projectId || null, note, fournisseur: type === ACHAT ? fournisseur : '',
      }),
      majArticle,
    })
    onClose()
  }

  const libelleQuantite = retour
    ? (type === ACHAT ? 'Quantité retournée au fournisseur' : 'Quantité remise en stock')
    : (type === ACHAT ? 'Quantité reçue' : type === CONSOMMATION ? 'Quantité sortie' : 'Quantité retirée')

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={soumettre} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">Mouvement de stock</h3>
            <p className="text-sm text-slate-500 mt-0.5">{article?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Type */}
          <div>
            <label className="label">Nature du mouvement</label>
            <div className="grid grid-cols-3 gap-2">
              {[ACHAT, CONSOMMATION, AJUSTEMENT].map(t => {
                const I = ICONES[t]
                return (
                  <button
                    key={t} type="button" aria-pressed={type === t}
                    onClick={() => { setType(t); setRetour(false); setErreur(null) }}
                    className={clsx('rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors flex flex-col items-center gap-1',
                      type === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                  >
                    <I size={15} />
                    {TYPES_MOUVEMENT[t].court}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">{def.aide}</p>
          </div>

          {/* Quantité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{libelleQuantite} <span className="text-red-400">*</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="number" step="0.01" min="0" value={quantite} autoFocus
                  onChange={e => { setQuantite(e.target.value); setErreur(null) }}
                  className="input" placeholder="0"
                  aria-label={libelleQuantite}
                />
                <span className="text-sm text-slate-500 whitespace-nowrap">{article?.unit}</span>
              </div>
            </div>
            {type === ACHAT && (
              <div>
                <label className="label">Prix payé ($ / {article?.unit}) <span className="text-red-400">*</span></label>
                <input
                  type="number" step="0.01" value={prix}
                  onChange={e => { setPrix(e.target.value); setErreur(null) }}
                  className="input" aria-label="Prix payé"
                />
              </div>
            )}
          </div>

          {/* Sens inverse */}
          <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={retour} onChange={e => { setRetour(e.target.checked); setErreur(null) }} className="rounded mt-0.5" />
            <span>
              {type === ACHAT
                ? 'C’est un retour au fournisseur (sort du stock)'
                : type === CONSOMMATION
                  ? 'C’est un retour de chantier (rentre en stock)'
                  : 'Ajouter au stock au lieu d’en retirer'}
            </span>
          </label>

          {/* Chantier */}
          {type === CONSOMMATION && (
            <div>
              <label className="label">Chantier</label>
              {projets.length === 0 ? (
                <p className="input flex items-center text-sm text-amber-700 bg-amber-50 border-amber-200">
                  Aucun chantier — créez d'abord un projet dans l'écran Projets.
                </p>
              ) : (
                <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input"
                  aria-label="Chantier qui consomme">
                  <option value="">Sans chantier précis</option>
                  {projets.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Sans chantier, la sortie compte dans l'inventaire mais n'entrera dans le coût d'aucun projet.
              </p>
            </div>
          )}

          {type === ACHAT && (
            <div>
              <label className="label">Fournisseur</label>
              <input value={fournisseur} onChange={e => setFournisseur(e.target.value)} className="input" placeholder="ex: BMR Pro" />
            </div>
          )}

          <div>
            <label className="label">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} className="input"
              placeholder={type === AJUSTEMENT ? 'ex: décompte du 24 nov., 2 feuilles brisées' : 'ex: bon de livraison 48213'} />
          </div>

          {/* Aperçu de l'effet */}
          {apercu && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Après ce mouvement</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Stock</span>
                <span className="font-medium text-slate-700">
                  {stockAvant} → <span className={clsx('font-bold', apercu.article.stock < 0 ? 'text-red-600' : 'text-slate-800')}>
                    {apercu.article.stock}
                  </span> {article?.unit}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Coût moyen</span>
                <span className="font-medium text-slate-700">
                  {formatPrixUnitaire(cmpAvant)}
                  {apercu.article.coutMoyen !== +cmpAvant.toFixed(4) && (
                    <> → <span className="font-bold text-slate-800">{formatPrixUnitaire(apercu.article.coutMoyen)}</span></>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {type === ACHAT ? 'Montant de l’achat' : 'Valeur sortie du stock'}
                </span>
                <span className="font-semibold text-slate-800">
                  {formatPrixUnitaire(Math.abs(qty) * apercu.prixUnitaire)}
                </span>
              </div>
              {apercu.article.stock < 0 && (
                <p className="text-xs text-red-600 flex items-start gap-1.5 pt-1">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  Le stock passera sous zéro. Le mouvement est accepté — c'est le décompte
                  qui est à refaire, pas la saisie à annuler.
                </p>
              )}
            </div>
          )}

          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" className="btn-primary">
            <Icone size={15} /> Enregistrer le mouvement
          </button>
        </div>
      </form>
    </div>
  )
}
