# ConstructPro — Gestion PME Construction

**En ligne :** https://alexandreberger1983.github.io/constructpro/

Application web de gestion pour PME en construction au Québec :
projets, soumissions, facturation, clients, employés, feuilles de temps,
matériaux, sous-traitants, calendrier, documents et rapports.

## Déploiement

Le site se publie tout seul sur GitHub Pages à chaque poussée sur `main`
(`.github/workflows/deploy-pages.yml`). Le chemin de base se déduit du nom
du dépôt : renommer le dépôt ne demande aucune modification du code.

Deux secrets doivent être définis dans Settings → Secrets and variables →
Actions pour que l'application atteigne sa base de données :

| Secret | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | `https://<projet>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la clé **anon public** — jamais `service_role` |

Sans eux, l'application fonctionne sur le stockage du navigateur.

Le schéma de la base et ses règles d'accès sont dans `supabase/schema.sql`,
rejouable sans risque. Une tâche planifiée
(`.github/workflows/supabase-keepalive.yml`) interroge la base chaque jour
pour l'empêcher de se mettre en pause.

## Tests

```bash
npm ci && npm run build
npx vite preview --port 4173 &          # puis, dans un autre terminal :
node src/data/*.test.mjs                # moteurs de calcul
PW_CHROMIUM=/opt/pw-browsers/chromium node smoke.mjs   # parcours navigateur
```

Les parcours navigateur visent `http://localhost:4173/constructpro/` par
défaut ; `APP_BASE` permet de viser ailleurs. Trois d'entre eux
(`smoke-connexion`, `smoke-donnees-supabase`, `smoke-demonstration`)
demandent une seconde construction avec de fausses clés Supabase, servie
sur le port 4174, et suivent `APP_BASE_AUTH`. L'adresse factice n'est pas
libre : ces trois parcours interceptent les appels réseau en la reconnaissant,
et une autre adresse les fait échouer sans dire pourquoi.

```bash
VITE_SUPABASE_URL=https://exemple-local-test.supabase.co \
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.faux \
  npx vite build --outDir dist-auth
npx vite preview --outDir dist-auth --port 4174 &
```

## Démarrer

```bash
npm install
npm run dev        # développement (http://localhost:5173)
npm run build      # production (dossier dist/)
npm run preview    # tester la version production
```

## ✦ Devis rapide sur place (mode terrain)

Le module **Devis** (menu « ✦ Estimateur » / onglet « Devis » sur mobile)
est conçu pour être utilisé debout, chez le client, sur un téléphone ou
une tablette — même par quelqu'un qui n'aime pas l'informatique :

1. **Le client** — on choisit un client existant ou on tape juste un nom.
2. **Les pièces** — on touche « Cuisine », « Salle de bain », etc., puis on
   ajuste les mesures avec les gros boutons − / + (en **pieds** ou en mètres).
3. **Les travaux** — on ouvre une catégorie (Peinture, Planchers, Plomberie…)
   et on coche les travaux. Le prix de chaque travail est calculé
   automatiquement à partir des mesures de la pièce.
4. **Le devis** — le prix total taxes incluses s'affiche en gros.
   Deux boutons : **Imprimer / PDF** (devis propre avec lignes de signature)
   et **Enregistrer**.

Points importants :

- **Sauvegarde automatique** : chaque geste est enregistré dans le
  navigateur. On peut fermer l'application et reprendre le devis plus tard.
- **Fonctionne sans connexion** une fois la page chargée (aucune ressource
  externe).
- Le total en cours est toujours visible au bas de l'écran.
- Les prix du catalogue (60+ travaux : matériaux + main-d'œuvre) et les
  majorations (frais généraux, profit, imprévus) sont ajustables.
- TPS 5 % et TVQ 9,975 % ajoutées automatiquement.

## Paramètres de l'entreprise

La page **Paramètres** (bas du menu, ou `/parametres`) permet de définir :
nom de l'entreprise, nom du propriétaire, adresse, téléphone, courriel,
licence RBQ, NEQ, numéros de TPS/TVQ et logo. Ces informations apparaissent
automatiquement sur toutes les soumissions et tous les devis générés par
l'application (plus besoin de « ConstructPro Inc. » codé en dur).

## Matériaux : trois prix, jamais un seul

Un article ne portait qu'un prix, à qui on demandait trois choses
incompatibles. Les écraser l'un par l'autre réécrit le passé : si le 2×4 passe
de 18 $ à 24 $ et qu'on remplace la valeur, un chantier chiffré le mois
dernier affiche soudain un autre coût de matériaux, et sa marge change
rétroactivement — sans que personne n'ait rien saisi. C'est le piège, et il
est silencieux.

| Prix | À quoi il sert | Qui le fixe |
|---|---|---|
| **Prix de référence** | chiffrer un devis à venir | l'entreprise, délibérément — et sa date est affichée |
| **Prix payé** | dire ce qu'un chantier a coûté | la facture du fournisseur, figée sur le mouvement, jamais recalculée |
| **Coût moyen pondéré** | valoriser ce qui est en stock | recalculé à chaque réception |

Le coût moyen pondéré est l'une des deux méthodes que les normes comptables
canadiennes admettent pour une PME (l'autre étant le PEPS ; le DEPS est
interdit), et elle évite d'avoir à savoir quelle feuille de gypse vient de
quelle livraison.

**Un prix de référence est daté, et sa péremption est signalée** : au bout
d'un mois sur les articles volatils (bois, acier, cuivre, bardeau), de trois
mois sur les autres. Un prix de huit mois qui a l'air frais est plus dangereux
qu'un prix visiblement périmé.

### Journal des mouvements

Le stock ne change que par un mouvement inscrit — **achat**, **consommation de
chantier** ou **ajustement d'inventaire** — qui dit pourquoi et à quel prix.
Une seule convention de signe : positif entre en stock, négatif en sort. Un
retour de chantier est donc une consommation négative, un retour au
fournisseur un achat négatif.

Le stock **peut** devenir négatif, volontairement : si l'application dit 3 et
que le chantier en a posé 5, refuser la saisie oblige à mentir ou à ne rien
inscrire. Un stock négatif est signalé en rouge, pas interdit — c'est le
décompte qui est à refaire.

### Liste d'achat

Une soumission **acceptée** affiche ce qu'il y a à commander, groupé par
catégorie : la quantité de travail à couvrir dans son unité, et le budget
matériaux prévu. Pas un nombre de feuilles ni de seaux — les prix du catalogue
sont au mètre carré et il n'existe nulle part la nomenclature qui dirait qu'un
mur de 48 m² demande 16 feuilles de 4×8. « 48 m² de gypse 5/8 » est d'ailleurs
exactement ce qu'on dit au comptoir. Les quantités portent déjà le facteur de
perte du catalogue.

Elle n'apparaît qu'après acceptation : commander sur une offre en attente est
la meilleure façon de payer du matériel pour un chantier qui ne se fera pas.
Elle ne figure pas sur le document imprimé.

Sur la fiche du chantier, le budget est comparé au réellement consommé. C'est
le vrai livrable du suivi des prix : « budgété 310 $, sorti 356 $, +15 % » dit
à la fois qu'un prix de référence a vieilli et si l'entreprise tient sa marge.

## Paie & Heures (CCQ)

Le module **Paie & Heures** (`/paie`) reproduit fidèlement le système de
suivi des heures fourni (classeur Excel avec banque d'heures CCQ) : mêmes
catégories (Commercial, Résidentiel Lourd/Léger Réglementé, Non-Réglementé),
mêmes formules de temps supplémentaire et de banque d'heures, pour obtenir
exactement les mêmes chiffres.

- **Saisie hebdomadaire** — heures travaillées par catégorie, par employé et
  par semaine ; le temps supplémentaire et la banque d'heures se calculent
  automatiquement.
- **Résumé de la semaine** — équivalent de la feuille « Heures payables par
  semaine » de l'ancien classeur, recalculé en direct.
- **Fiche annuelle** — tableau complet des 52 semaines par employé, avec
  soldes de banque et totaux, comme dans l'ancien fichier.
- **Employés & banque** — gestion de la liste des employés (préremplie avec
  les 22 employés du classeur fourni) et saisie du solde de banque reporté
  de l'année précédente.
- **Licences** — suivi des dates de renouvellement des certificats de
  compétence, avec alerte si expiré ou proche de l'échéance.

Le moteur de calcul (`src/components/payroll/payrollEngine.js`) est
directement porté ligne par ligne des formules Excel d'origine et vérifié
par des tests unitaires (`payrollEngine.test.mjs`).

## Tests

```bash
# Moteur de calcul de paie (sans navigateur)
node src/components/payroll/payrollEngine.test.mjs

# Parcours complet dans un vrai navigateur
npm run build && npm run preview -- --port 4173 &
PW_CHROMIUM=/opt/pw-browsers/chromium node smoke.mjs        # assistant de devis terrain
PW_CHROMIUM=/opt/pw-browsers/chromium node smoke-paie.mjs   # paramètres + paie & heures
```
