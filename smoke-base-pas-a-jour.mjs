// Ce que l'application dit quand une table manque dans la base.
//
// Le cas est arrivé pour de vrai : l'application connaissait la table
// `mouvements`, la base ne l'avait pas encore. Le bandeau annonçait
// « Modification non enregistrée » — alors que rien n'avait été modifié — et
// proposait « Recharger ». Recharger relance la même lecture et ramène la même
// erreur : le message envoyait chercher au mauvais endroit, et bouclait.
//
// Ce parcours rejoue exactement cette panne et vérifie que le message dit
// maintenant ce qu'il faut faire.
import { chromium } from 'playwright'

const base = (process.env.APP_BASE_AUTH || 'http://localhost:4174/constructpro/') + '#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
const page = await ctx.newPage()
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

// Une base où TOUTES les tables répondent, sauf `mouvements` qui n'existe pas.
// C'est la réponse exacte de Supabase dans ce cas.
await page.addInitScript(() => {
  const session = {
    access_token: 'faux-jeton', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'faux',
    user: { id: '00000000-0000-0000-0000-000000000001', email: 'bureau@exemple.com', aud: 'authenticated' },
  }
  localStorage.setItem('cp-session', JSON.stringify(session))

  const json = (corps, status = 200) =>
    new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } })

  const vraiFetch = window.fetch.bind(window)
  window.fetch = async (entree, init = {}) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? ''
    if (!url.includes('exemple-local-test.supabase.co')) return vraiFetch(entree, init)
    if (url.includes('/rest/v1/profiles'))
      return json({ id: session.user.id, nom: 'Bureau', role: 'bureau', employee_id: null })
    if (url.includes('/rest/v1/mouvements')) {
      window.__appelsMouvements = (window.__appelsMouvements ?? 0) + 1
      return json({
        code: 'PGRST205',
        message: "Could not find the table 'public.mouvements' in the schema cache",
        hint: null, details: null,
      }, 404)
    }
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
})

await page.goto(base + '/')
await page.waitForTimeout(2600)

const corps = await page.textContent('body')

// ─── Le titre ne doit PAS parler d'une modification perdue ──────────────────
if (/Modification non enregistrée/.test(corps))
  throw new Error('une table manquante n’est pas une modification perdue')
console.log('OK: le bandeau ne prétend plus qu’une modification a été perdue')

if (!/La base de données n’est pas à jour/.test(corps))
  throw new Error('le bandeau devrait annoncer que la base est en retard sur l’application')
console.log('OK: il annonce que la base est en retard sur l’application')

// ─── Il dit QUOI FAIRE, précisément ─────────────────────────────────────────
if (!/schema\.sql/.test(corps))
  throw new Error('le conseil devrait nommer le fichier à rejouer')
if (!/SQL Editor/.test(corps))
  throw new Error('le conseil devrait dire où le rejouer')
console.log('OK: il nomme le fichier à rejouer et l’endroit où le faire')

// La table en cause reste lisible : sans elle, on ne sait pas laquelle manque
if (!/mouvements/.test(corps))
  throw new Error('le message devrait nommer la table manquante')
console.log('OK: la table manquante est nommée')

// ─── Et surtout : pas de bouton « Recharger » qui ferait boucler ────────────
const boutonsRecharger = await page.locator('button:has-text("Recharger")').count()
if (boutonsRecharger !== 0)
  throw new Error('« Recharger » ne doit pas être proposé : il relancerait la même lecture')
console.log('OK: aucun bouton « Recharger » — il ne ferait que ramener la même erreur')

if (!/Recharger n’y changera rien/.test(corps))
  throw new Error('il faudrait dire explicitement que recharger ne sert à rien ici')
console.log('OK: et il est dit explicitement que recharger ne servirait à rien')

// ─── Le reste de l'application continue de fonctionner ──────────────────────
// Une table manquante ne doit pas emporter les autres : les écrans se chargent.
for (const [route, titre] of [['/clients', 'Clients'], ['/projets', 'Projets'], ['/materiaux', 'Matériaux']]) {
  await page.goto(base + route)
  await page.waitForTimeout(1200)
  const vu = await page.textContent('body')
  if (!new RegExp(titre).test(vu)) throw new Error(`l’écran ${titre} ne se charge plus`)
}
console.log('OK: les autres écrans se chargent quand même')

// ─── Une panne de lecture ORDINAIRE garde le bouton ─────────────────────────
// Pour prouver que le bouton n'a pas simplement disparu partout.
await ctx.close()
const page2 = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
page2.on('pageerror', e => errors.push('pageerror(2): ' + e.message))
await page2.addInitScript(() => {
  const session = {
    access_token: 'faux-jeton', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'faux',
    user: { id: '00000000-0000-0000-0000-000000000001', email: 'bureau@exemple.com', aud: 'authenticated' },
  }
  localStorage.setItem('cp-session', JSON.stringify(session))
  const json = (c, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } })
  const vraiFetch = window.fetch.bind(window)
  window.fetch = async (entree, init = {}) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? ''
    if (!url.includes('exemple-local-test.supabase.co')) return vraiFetch(entree, init)
    if (url.includes('/rest/v1/profiles'))
      return json({ id: session.user.id, nom: 'Bureau', role: 'bureau', employee_id: null })
    // Une panne réseau franche sur une table qui, elle, existe bel et bien
    if (url.includes('/rest/v1/clients'))
      return json({ message: 'network error: connection reset' }, 500)
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
})
await page2.goto(base + '/')
await page2.waitForTimeout(2600)
const corps2 = await page2.textContent('body')
if (!/Données incomplètes/.test(corps2))
  throw new Error('une panne de lecture ordinaire devrait s’annoncer comme telle')
if (await page2.locator('button:has-text("Recharger")').count() === 0)
  throw new Error('sur une panne réseau, « Recharger » a du sens et doit rester')
console.log('OK: sur une panne réseau ordinaire, « Recharger » est bien proposé')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Une table manquante dit quoi faire, au lieu d’envoyer recharger en boucle')
await browser.close()
