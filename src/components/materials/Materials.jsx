import { useMemo, useState } from 'react'
import { Plus, Search, AlertTriangle, Package, Trash2, ArrowRightLeft, History, TrendingUp, Clock } from 'lucide-react'
import { useData } from '../../store/DataContext'
import { formatCurrency, formatDate } from '../../utils/formatters'
// `formatCurrency` arrondit au dollar : bon pour un total, faux pour un prix
// unitaire. Un coût moyen de 22,40 $ s'afficherait « 22 $ », et c'est
// précisément le cent que tout ce suivi de prix cherche à tenir.
import { formatPrixUnitaire } from '../../data/affichagePrix'
import FormModal from '../ui/FormModal'
import MouvementModal from './MouvementModal'
import {
  etatPrix, ageDuPrix, coutMoyenInitial, valeurStock, valeurInventaire,
  historiqueApres, tendancePrix, estVolatil,
} from '../../data/prixMateriaux'
import {
  TYPES_MOUVEMENT, ACHAT, CONSOMMATION, mouvementsDe, montantMouvement,
  dernierPrixPaye,
} from '../../data/mouvements'
import clsx from 'clsx'

const categories = ['Tous', 'Cloisons', 'Ossature', 'Isolation', 'Électricité', 'Plafond', 'Plancher', 'Peinture', 'Fixation', 'Béton', 'Plomberie', 'Autre']

const materialFields = [
  { name: 'name', label: "Nom de l'article", required: true, colSpan: 2, placeholder: 'ex: Panneau de gypse 5/8" (4x8)' },
  { name: 'category', label: 'Catégorie', type: 'select', options: categories.slice(1), default: 'Autre' },
  { name: 'unit', label: 'Unité', placeholder: 'ex: feuille, boîte, m²', default: 'unité' },
  { name: 'minStock', label: 'Stock minimum (alerte)', type: 'number', default: 0 },
  // Le prix de référence sert à ESTIMER un devis. Ce n'est pas la valeur du
  // stock, qui vient du coût moyen des achats réels.
  { name: 'unitCost', label: 'Prix de référence ($ / unité)', type: 'number', step: '0.01', default: 0 },
  { name: 'supplier', label: 'Fournisseur', placeholder: 'ex: BMR Pro' },
  { name: 'location', label: 'Emplacement', placeholder: 'ex: Entrepôt A, Camion 2', default: 'Entrepôt' },
  { name: 'prixVolatil', label: 'Prix volatil (à revérifier souvent)', type: 'select',
    options: [{ value: '', label: 'Non' }, { value: 'oui', label: 'Oui — bois, acier, cuivre…' }] },
]

// Le stock ne se saisit QUE par un mouvement : c'est là qu'on dit pourquoi il
// change et à quel prix. Il reste modifiable à la création, pour reprendre un
// inventaire existant.
const champsCreation = [
  ...materialFields.slice(0, 4),
  { name: 'stock', label: 'Quantité en stock', type: 'number', default: 0 },
  ...materialFields.slice(4),
]

export default function Materials() {
  const { data, add, update, remove } = useData()
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('Tous')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [modal, setModal] = useState(null)       // null | 'new' | article
  const [mouvementDe, setMouvementDe] = useState(null) // article dont on saisit un mouvement
  const [journalOuvert, setJournalOuvert] = useState(false)
  const [filtreJournal, setFiltreJournal] = useState(null) // id d'article, ou null

  const materials = data.materials
  const mouvements = data.mouvements ?? []

  const filtered = materials.filter(m =>
    (cat === 'Tous' || m.category === cat) &&
    (!showLowOnly || (m.minStock > 0 && m.stock <= m.minStock)) &&
    (m.name.toLowerCase().includes(search.toLowerCase()) || (m.supplier || '').toLowerCase().includes(search.toLowerCase()))
  )

  const lowStock = materials.filter(m => m.minStock > 0 && m.stock <= m.minStock)
  // La valeur d'inventaire se calcule au coût moyen des achats réels, pas au
  // prix de référence : c'est ce que le stock a coûté, et c'est ce chiffre
  // qu'un comptable attend.
  const totalValue = valeurInventaire(materials)
  const prixPerimes = materials.filter(m => m.unitCost > 0 && etatPrix(m).perime)

  const journal = useMemo(
    () => mouvementsDe(mouvements, filtreJournal ? { materialId: filtreJournal } : {}),
    [mouvements, filtreJournal],
  )
  const articleDe = (id) => materials.find(m => String(m.id) === String(id)) ?? null
  const projetDe = (id) => data.projects.find(p => String(p.id) === String(id)) ?? null

  const enregistrerMouvement = ({ mouvement, majArticle }) => {
    add('mouvements', mouvement)
    update('materials', mouvement.materialId, majArticle)
  }

  const handleSubmit = (values) => {
    const aujourdhui = new Date()
    const jour = aujourdhui.toISOString().slice(0, 10)
    const prix = parseFloat(values.unitCost) || 0

    if (modal === 'new') {
      add('materials', {
        ...values,
        prixVolatil: values.prixVolatil === 'oui',
        prixMaj: jour,
        prixHistorique: prix > 0 ? [{ date: jour, prix }] : [],
        // Le stock repris à la création est supposé acheté au prix de
        // référence du jour : c'est la seule hypothèse disponible, et elle est
        // dite ici pour que personne ne la prenne pour une mesure.
        coutMoyen: prix,
      })
      return
    }

    // Un prix de référence qui change est DATÉ et conservé. Sans date, un prix
    // de huit mois a l'air aussi frais qu'un prix d'hier — c'est le vrai
    // danger, bien plus qu'un prix périmé qu'on voit périmé.
    const ancienPrix = parseFloat(modal.unitCost) || 0
    const prixChange = Math.abs(prix - ancienPrix) > 0.0001
    update('materials', modal.id, {
      ...values,
      prixVolatil: values.prixVolatil === 'oui',
      ...(prixChange ? {
        prixMaj: jour,
        prixHistorique: historiqueApres(modal, prix, aujourdhui),
      } : {}),
    })
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h2 className="section-title">Matériaux & Inventaire</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Valeur au coût moyen : {formatCurrency(totalValue, true)} · {lowStock.length} article(s) sous le seuil
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setJournalOuvert(v => !v); setFiltreJournal(null) }} className="btn-secondary">
            <History size={16} /> Journal {mouvements.length > 0 && `(${mouvements.length})`}
          </button>
          <button onClick={() => setModal('new')} className="btn-primary"><Plus size={16} /> Ajouter article</button>
        </div>
      </div>

      {/* Prix de référence périmés : ce qui fait rater un devis */}
      {prixPerimes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock size={15} className="text-amber-600" />
            <p className="text-sm font-semibold text-amber-700">
              {prixPerimes.length} prix de référence à revérifier avant de chiffrer un devis
            </p>
          </div>
          <p className="text-xs text-amber-700/80 mb-2">
            Un prix qui a vieilli sans qu'on le sache fait perdre la marge sur tout un chantier.
            Les articles volatils (bois, acier, cuivre) sont signalés au bout d'un mois, les autres après trois.
          </p>
          <div className="flex flex-wrap gap-2">
            {prixPerimes.slice(0, 8).map(m => (
              <button key={m.id} onClick={() => setModal(m)}
                className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-xs hover:border-amber-400">
                <span className="font-medium text-slate-700">{m.name}</span>
                <span className="text-amber-600">{formatPrixUnitaire(m.unitCost)}</span>
                <span className="text-slate-400">· {ageDuPrix(m)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stock faible */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <p className="text-sm font-semibold text-amber-700">Articles sous le stock minimum</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(m => (
              <div key={m.id} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-xs">
                <Package size={11} className="text-amber-500" />
                <span className="font-medium text-slate-700">{m.name}</span>
                <span className="text-amber-600 font-bold">{m.stock} {m.unit}</span>
                <span className="text-slate-400">(min. {m.minStock})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">Articles</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{materials.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">Valeur (coût moyen)</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalValue, true)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">Sous le seuil</p>
          <p className={clsx('text-2xl font-bold mt-1', lowStock.length > 0 ? 'text-amber-600' : 'text-emerald-600')}>{lowStock.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">Mouvements</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{mouvements.length}</p>
        </div>
      </div>

      {/* Journal */}
      {journalOuvert && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">
                Journal des mouvements{filtreJournal && ` — ${articleDe(filtreJournal)?.name ?? ''}`}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Chaque mouvement garde le prix du jour où il a eu lieu. C'est ce qui permet de dire
                ce qu'un chantier a coûté, même après un changement de prix.
              </p>
            </div>
            {filtreJournal && (
              <button onClick={() => setFiltreJournal(null)} className="btn-ghost text-xs py-1 px-2">Tout l'inventaire</button>
            )}
          </div>
          {journal.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-slate-500 font-medium text-sm">Aucun mouvement enregistré</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Chaque réception, sortie de chantier ou décompte s'inscrit ici. Utilisez le bouton
                « Mouvement » sur une ligne de l'inventaire.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Nature</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Article</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Chantier</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Quantité</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Prix figé</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Montant</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journal.slice(0, 60).map(m => {
                    const art = articleDe(m.materialId)
                    const proj = projetDe(m.projectId)
                    const entre = m.qty > 0
                    return (
                      <tr key={m.id} className="table-row-hover">
                        <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{formatDate(m.date)}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('badge', m.type === ACHAT ? 'bg-brand-50 text-brand-700'
                            : m.type === CONSOMMATION ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700')}>
                            {TYPES_MOUVEMENT[m.type]?.court ?? m.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{art?.name ?? '— article supprimé —'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {proj ? `${proj.code}` : m.type === CONSOMMATION ? 'sans chantier' : '—'}
                        </td>
                        <td className={clsx('px-4 py-3 text-right font-semibold', entre ? 'text-emerald-600' : 'text-slate-700')}>
                          {entre ? '+' : ''}{m.qty} {art?.unit ?? ''}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatPrixUnitaire(m.prixUnitaire)}</td>
                        <td className={clsx('px-4 py-3 text-right font-semibold', entre ? 'text-emerald-600' : 'text-slate-700')}>
                          {formatPrixUnitaire(montantMouvement(m))}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-48 truncate" title={m.note}>
                          {m.fournisseur ? `${m.fournisseur}${m.note ? ' · ' : ''}` : ''}{m.note}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {journal.length > 60 && (
                <p className="text-xs text-slate-400 text-center py-3">
                  60 mouvements les plus récents sur {journal.length}.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher article, fournisseur..." className="input pl-8" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showLowOnly} onChange={e => setShowLowOnly(e.target.checked)} className="rounded" />
            Stock faible seulement
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', cat === c ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Inventaire */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[1050px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Article</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Catégorie</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Fournisseur</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                Prix réf.
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Coût moyen</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Stock</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valeur</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(m => {
              const isLow = m.minStock > 0 && m.stock <= m.minStock
              const prix = etatPrix(m)
              const cmp = coutMoyenInitial(m)
              const tendance = tendancePrix(m)
              const paye = dernierPrixPaye(mouvements, m.id)
              return (
                <tr key={m.id} className={clsx('table-row-hover', isLow && 'bg-amber-50/30')}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {isLow && <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />}
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{m.name}</p>
                        <p className="text-xs text-slate-400">
                          par {m.unit}
                          {estVolatil(m) && <span className="text-amber-600"> · prix volatil</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="badge bg-slate-100 text-slate-600">{m.category}</span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">{m.supplier}</td>
                  <td className="px-4 py-3.5 text-right">
                    <p className={clsx('font-medium', prix.perime && m.unitCost > 0 ? 'text-amber-600' : 'text-slate-700')}>
                      {formatPrixUnitaire(m.unitCost)}
                    </p>
                    <p className={clsx('text-xs', prix.perime && m.unitCost > 0 ? 'text-amber-500' : 'text-slate-400')}>
                      {ageDuPrix(m)}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="font-medium text-slate-700">{formatPrixUnitaire(cmp)}</p>
                    {paye && (
                      <p className="text-xs text-slate-400" title={`Dernier achat le ${formatDate(paye.date)}`}>
                        payé {formatPrixUnitaire(paye.prix)}
                      </p>
                    )}
                    {tendance && !paye && (
                      <p className={clsx('text-xs flex items-center justify-end gap-0.5',
                        tendance.pct > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                        <TrendingUp size={10} /> {tendance.pct > 0 ? '+' : ''}{tendance.pct} %
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={clsx('font-bold text-sm',
                      m.stock < 0 ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-800')}>
                      {m.stock}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">
                      {m.minStock > 0 ? `/ min. ${m.minStock}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-slate-700">{formatCurrency(valeurStock(m))}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setMouvementDe(m)} className="btn-secondary py-1 px-2 text-xs whitespace-nowrap"
                        title="Achat, consommation de chantier ou ajustement">
                        <ArrowRightLeft size={13} /> Mouvement
                      </button>
                      <button
                        onClick={() => { setFiltreJournal(m.id); setJournalOuvert(true) }}
                        className="p-1.5 text-slate-300 hover:text-brand-500 transition-colors"
                        aria-label={`Journal de ${m.name}`} title="Voir son journal"
                      >
                        <History size={15} />
                      </button>
                      <button onClick={() => setModal(m)} className="btn-ghost py-1 px-2 text-xs">Modifier</button>
                      <button
                        onClick={() => window.confirm(`Supprimer « ${m.name} » de l'inventaire ?`) && remove('materials', m.id)}
                        className="p-1.5 text-slate-300 hover:text-red-400 transition-colors"
                        aria-label={`Supprimer ${m.name}`}
                        title="Supprimer cet article"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 px-4">
            {materials.length === 0 ? (
              <>
                <p className="text-slate-500 font-medium">Aucun article dans l'inventaire</p>
                <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                  Ajoutez les articles que vous gardez en stock. Chaque réception et chaque sortie
                  de chantier garde son prix du jour, ce qui permet de savoir ce qu'un chantier
                  a réellement coûté.
                </p>
                <button onClick={() => setModal('new')} className="btn-primary mt-4">
                  <Plus size={16} /> Ajouter un article
                </button>
              </>
            ) : (
              <p className="text-slate-400 text-sm">Aucun article ne correspond à cette recherche</p>
            )}
          </div>
        )}
      </div>

      {modal && (
        <FormModal
          title={modal === 'new' ? 'Ajouter un article' : `Modifier — ${modal.name}`}
          fields={modal === 'new' ? champsCreation : materialFields}
          initialValues={modal === 'new' ? {} : { ...modal, prixVolatil: modal.prixVolatil ? 'oui' : '' }}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      {mouvementDe && (
        <MouvementModal
          article={mouvementDe}
          projets={data.projects}
          onEnregistrer={enregistrerMouvement}
          onClose={() => setMouvementDe(null)}
        />
      )}
    </div>
  )
}
