import { useState } from 'react'
import { ShoppingCart, Download, ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'
import { listeAchat } from '../../data/achats'
import { etatPrix, ecart } from '../../data/prixMateriaux'
import { formatCurrency } from '../../utils/formatters'
import { formatPrixUnitaire } from '../../data/affichagePrix'
import { downloadCsv } from '../../utils/csv'

// Ce qu'il y a à acheter pour un chantier accepté.
//
// La soumission dit ce qu'il faut faire et pour combien ; elle ne disait pas
// quoi commander. Il fallait reprendre le devis ligne à ligne pour retrouver la
// part matériaux de chaque poste — deux fois le même travail, et un oubli
// possible à chaque fois.
//
// Ce que cette liste donne : par poste, la QUANTITÉ à couvrir dans son unité et
// le BUDGET matériaux prévu. Pas un nombre de feuilles ni de seaux : les prix
// du catalogue sont au mètre carré, et il n'existe nulle part la nomenclature
// qui dirait qu'un mur de 48 m² demande 16 feuilles de 4×8. Sortir un nombre de
// feuilles d'un prix au mètre carré donnerait un chiffre faux présenté comme
// exact, ce qui est pire qu'aucun chiffre. « 48 m² de gypse 5/8 » est d'ailleurs
// exactement ce qu'on dit au comptoir.

export default function ListeAchat({ devis, quote, materiaux = [], consommation, projetLie }) {
  const [ouvert, setOuvert] = useState(false)

  // Sans devis d'estimateur derrière, la soumission ne garde qu'un prix
  // unitaire par ligne : la part matériaux y est fondue dans le total et rien
  // ne permet de l'en extraire. On le dit, plutôt que d'inventer une clé de
  // répartition qui aurait l'air d'un calcul.
  if (!devis) {
    return (
      <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <ShoppingCart size={15} /> Liste d'achat
        </p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Cette soumission n'a pas de devis d'estimateur derrière elle : ses lignes ne portent
          qu'un prix unitaire global, sans la part matériaux. Impossible d'en tirer une liste
          d'achat sans inventer la répartition. Montez le devis dans l'Estimateur pour l'obtenir.
        </p>
      </div>
    )
  }

  const liste = listeAchat(devis, materiaux)

  if (liste.lignes.length === 0) {
    return (
      <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <ShoppingCart size={15} /> Rien à acheter
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Les {liste.sansMateriel} ligne(s) de cette soumission sont de la main-d'œuvre seule
          (démolition, nettoyage, gestion). Aucun matériau n'est à commander.
        </p>
      </div>
    )
  }

  // Le devis a-t-il vieilli ? On compare le prix matériaux figé au devis avec
  // le prix de référence d'aujourd'hui, article par article, quand on sait de
  // quel article il s'agit.
  const vieillies = liste.lignes.filter(l => {
    if (l.materialId == null) return false
    const article = materiaux.find(m => String(m.id) === String(l.materialId))
    if (!article || !(article.unitCost > 0) || !(l.prixUnitaire > 0)) return false
    return (article.unitCost - l.prixUnitaire) / l.prixUnitaire > 0.05
  })

  const ecartConsomme = consommation ? ecart(liste.budget, consommation.cout) : null

  const exporter = () => {
    downloadCsv(
      `liste-achat-${quote.number}.csv`,
      ['Catégorie', 'Poste', 'Article inventaire', 'Fournisseur', 'Quantité', 'Unité', 'Prix matériaux / unité', 'Budget matériaux'],
      liste.parCategorie.flatMap(c => c.lignes.map(l => [
        c.categorie, l.description, l.article ?? '', l.fournisseur ?? '',
        String(l.qty).replace('.', ','), l.unit,
        String(l.prixUnitaire.toFixed(2)).replace('.', ','),
        String(l.budget.toFixed(2)).replace('.', ','),
      ])),
    )
  }

  return (
    <div id="liste-achat" className="mt-3 rounded-xl border border-brand-200 bg-brand-50/40 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
        <button onClick={() => setOuvert(v => !v)} className="flex items-center gap-2 text-left">
          {ouvert ? <ChevronDown size={16} className="text-brand-600" /> : <ChevronRight size={16} className="text-brand-600" />}
          <ShoppingCart size={15} className="text-brand-600" />
          <span className="text-sm font-semibold text-slate-700">
            Liste d'achat — budget matériaux {formatCurrency(liste.budget, true)}
          </span>
          <span className="text-xs text-slate-500">
            {liste.lignes.length} poste(s) · {liste.parCategorie.length} catégorie(s)
          </span>
        </button>
        <button onClick={exporter} className="btn-secondary text-xs py-1.5">
          <Download size={13} /> CSV
        </button>
      </div>

      {ouvert && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <span>
              Quantités de travail et budget matériaux, pas un nombre de feuilles ou de seaux :
              les prix sont au {liste.lignes[0]?.unit ?? 'm²'} et la conversion reste au métier.
              Le surplus de coupe est déjà compris dans les quantités.
            </span>
          </p>

          {vieillies.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {vieillies.length} article(s) ont augmenté depuis ce devis
              </p>
              <ul className="mt-1 space-y-0.5">
                {vieillies.map(l => {
                  const article = materiaux.find(m => String(m.id) === String(l.materialId))
                  return (
                    <li key={l.id} className="text-xs text-amber-700/90">
                      {l.article} : {formatPrixUnitaire(l.prixUnitaire)} au devis →{' '}
                      <strong>{formatPrixUnitaire(article.unitCost)}</strong> aujourd'hui
                      {' '}({etatPrix(article).perime ? 'prix à revérifier' : 'prix à jour'})
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {liste.parCategorie.map(c => (
            <div key={c.categorie} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-600 uppercase">{c.categorie}</span>
                <span className="text-xs font-bold text-slate-700">{formatCurrency(c.budget)}</span>
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-50">
                  {c.lignes.map(l => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 text-slate-700">
                        {l.description}
                        {l.article && <span className="text-slate-400"> · en inventaire</span>}
                        {l.fournisseur && <span className="text-slate-400"> · {l.fournisseur}</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">
                        {l.qty} {l.unit}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">
                        {formatPrixUnitaire(l.prixUnitaire)}/{l.unit}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-slate-700">
                        {formatCurrency(l.budget)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {liste.sansMateriel > 0 && (
            <p className="text-xs text-slate-400">
              {liste.sansMateriel} ligne(s) de main-d'œuvre seule ne sont pas listées : il n'y a
              rien à y acheter.
            </p>
          )}

          {/* Budget contre réel. C'est le vrai intérêt du suivi : savoir, en
              cours de chantier, si on tient le budget matériaux. */}
          {ecartConsomme && (
            <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1.5">
                Consommé sur {projetLie.code}
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Budget matériaux</span>
                <span className="font-medium text-slate-700">{formatCurrency(ecartConsomme.budget)}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-0.5">
                <span className="text-slate-500">Sorti du stock ({consommation.nombre} mouvement(s))</span>
                <span className="font-medium text-slate-700">{formatCurrency(ecartConsomme.reel)}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1 pt-1.5 border-t border-slate-100">
                <span className="font-semibold text-slate-600">Écart</span>
                <span className={clsx('font-bold',
                  ecartConsomme.montant > 0 ? 'text-red-600' : 'text-emerald-600')}>
                  {ecartConsomme.montant > 0 ? '+' : ''}{formatCurrency(ecartConsomme.montant)}
                  {ecartConsomme.pct != null && ` (${ecartConsomme.pct > 0 ? '+' : ''}${ecartConsomme.pct} %)`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Seules les sorties de stock rattachées à ce chantier sont comptées. Le matériel
                acheté mais encore en entrepôt n'y est pas.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
