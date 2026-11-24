import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sert le site dans un sous-dossier au nom du dépôt :
//   https://<utilisateur>.github.io/<nom du dépôt>/
// Les fichiers de l'application doivent donc porter ce préfixe.
//
// Ce chemin n'est PAS écrit en dur. Le workflow de déploiement le déduit du
// nom du dépôt et le passe dans BASE_PATH. Renommer le dépôt, ou repartir
// d'une copie sous un autre nom, ne demande ainsi aucune modification du
// code — c'est exactement ce qu'il a fallu corriger à la main en cinq
// endroits en sortant ConstructPro de l'ancien dépôt partagé.
//
// La valeur de repli sert aux constructions locales (npm run build puis
// npm run preview), où la variable n'est pas définie.
//
// Le routage applicatif utilise HashRouter (voir main.jsx) : lui ne dépend
// pas de « base ».
const base = process.env.BASE_PATH || '/constructpro/'

export default defineConfig({
  plugins: [react()],
  base,
})
