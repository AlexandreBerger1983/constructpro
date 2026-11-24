export const SETTINGS_KEY = 'cp-parametres-entreprise'

export const DEFAULT_COMPANY_SETTINGS = {
  companyName: '',
  // Ligne sous le nom sur les soumissions, comme sur les gabarits papier
  // (« Entrepreneur Général »).
  subtitle: '',
  ownerName: '',
  // Nom porté sur la ligne de signature des soumissions, écrit dans une
  // police d'écriture manuscrite. À défaut, le nom du propriétaire sert.
  signataire: '',
  address: '',
  phone: '',
  fax: '',
  email: '',
  rbq: '',
  neq: '',
  tpsNumber: '',
  tvqNumber: '',
  logoDataUrl: '',
  tpsPct: 5,
  tvqPct: 9.975,
  revenueTarget: 0,
}
