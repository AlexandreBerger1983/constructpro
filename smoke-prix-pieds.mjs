// Vérifie que les prix du devis rapide s'affichent et se saisissent en pieds
// carrés, et surtout que changer d'unité d'affichage ne modifie AUCUN prix :
// un devis monté avant et après la bascule doit donner le même total.
import { chromium } from 'playwright'

const base = 'http://localhost:4173/Claude/claude/construction-sme-app-rc82di/#'
const errors = []

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const num = (s) => parseFloat(String(s).replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'))
const prixEnregistres = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('cp-catalogue-prix') || '{}'))

const allerAuxPrix = async () => {
  await page.goto(base + '/parametres')
  await page.waitForSelector('text=Prix du devis rapide', { timeout: 10000 })
  await page.click('text=Prix du devis rapide')
  await page.waitForSelector('text=Afficher les prix en', { timeout: 8000 })
}

const champ = (libelle) => page.locator(`input[aria-label="Main-d'œuvre — ${libelle}"]`)
const CERAMIQUE = 'Mur en céramique'       // 55 $/m² de main-d'œuvre au départ

await allerAuxPrix()

// ─── Le sélecteur d'unité existe et le pied carré est le défaut ──────────────
const piedsActif = await page.locator('button[aria-pressed="true"]').first().textContent()
console.log('Unité active au premier affichage :', piedsActif.trim())
if (!/pi²/.test(piedsActif))
  throw new Error('le pied carré devrait être l’unité par défaut')
console.log('OK: les prix s’affichent en pieds carrés par défaut')

// ─── La céramique s'affiche bien en pieds ────────────────────────────────────
await page.locator('input[placeholder="Rechercher un travail…"]').fill('céramique')
await page.waitForTimeout(500)
const enPieds = num(await champ(CERAMIQUE).inputValue())
console.log(`${CERAMIQUE} — main-d'œuvre affichée : ${enPieds} $/pi²`)
if (Math.abs(enPieds - 5.11) > 0.01)
  throw new Error(`55 $/m² devrait s’afficher 5,11 $/pi², pas ${enPieds}`)
console.log('OK: 55 $/m² s’affiche bien 5,11 $/pi²')

// L'unité est annoncée à côté de l'article
const ligne = await page.locator('div').filter({ hasText: /^Mur en céramique/ }).first().textContent()
if (!/pi²/.test(ligne)) throw new Error('l’unité affichée n’est pas indiquée près de l’article')
console.log('OK: l’article indique son unité d’affichage')

// ─── Basculer en mètres montre le prix métrique ──────────────────────────────
await page.click('button:has-text("Mètres carrés")')
await page.waitForTimeout(600)
const enMetres = num(await champ(CERAMIQUE).inputValue())
console.log(`Après bascule en mètres : ${enMetres} $/m²`)
if (Math.abs(enMetres - 55) > 0.01)
  throw new Error(`le prix métrique devrait être 55, pas ${enMetres}`)
console.log('OK: la bascule en mètres carrés redonne 55 $/m²')

// Et surtout : aucun prix personnalisé n'a été créé par la bascule
if (Object.keys(await prixEnregistres()).length !== 0)
  throw new Error('changer d’unité a enregistré un prix personnalisé alors que rien n’a été modifié')
console.log('OK: changer d’unité n’enregistre aucun prix — rien n’a été modifié')

// ─── Retaper la valeur affichée ne crée pas de faux « modifié » ──────────────
await page.click('button:has-text("Pieds carrés")')
await page.waitForTimeout(600)
await champ(CERAMIQUE).fill('5.11')
await page.waitForTimeout(600)
if (Object.keys(await prixEnregistres()).length !== 0)
  throw new Error('retaper le prix déjà affiché l’a marqué comme personnalisé')
console.log('OK: retaper la valeur affichée ne crée pas de prix personnalisé fantôme')

// ─── Une vraie modification, saisie en pieds ─────────────────────────────────
await champ(CERAMIQUE).fill('7')
await page.waitForTimeout(700)
const enregistres = await prixEnregistres()
const stocke = enregistres['carrelage-mur-sdb']?.unitLabor
console.log('Valeur stockée après saisie de 7 $/pi² :', stocke)
if (stocke === undefined) throw new Error('la modification n’a pas été enregistrée')
// 7 $/pi² × 10,7639 = 75,35 $/m² — c'est bien du métrique qui part en mémoire
if (Math.abs(stocke - 75.35) > 0.05)
  throw new Error(`le stockage devrait rester métrique (≈75,35), il vaut ${stocke}`)
console.log('OK: la saisie en pieds est convertie et stockée en mètres')

// La case affiche toujours 7, et le mode mètres affiche 75,35
if (Math.abs(num(await champ(CERAMIQUE).inputValue()) - 7) > 0.01)
  throw new Error('la case n’affiche plus la valeur saisie')
await page.click('button:has-text("Mètres carrés")')
await page.waitForTimeout(600)
const vuEnMetres = num(await champ(CERAMIQUE).inputValue())
console.log(`La même modification vue en mètres : ${vuEnMetres} $/m²`)
if (Math.abs(vuEnMetres - 75.35) > 0.05)
  throw new Error('la valeur modifiée ne se relit pas correctement en mètres')
console.log('OK: la modification se relit dans les deux unités')

// ─── Le choix d'unité survit à un rechargement ───────────────────────────────
await page.reload()
await page.waitForTimeout(1200)
await page.click('text=Prix du devis rapide')
await page.waitForSelector('text=Afficher les prix en', { timeout: 8000 })
const apresRechargement = await page.locator('button[aria-pressed="true"]').first().textContent()
if (!/Mètres/.test(apresRechargement))
  throw new Error('le choix d’unité n’a pas été retenu')
console.log('OK: le choix d’unité est retenu d’une visite à l’autre')

// ─── Remise à zéro ───────────────────────────────────────────────────────────
page.once('dialog', d => d.accept())
await page.click('button:has-text("Tout remettre par défaut")')
await page.waitForTimeout(800)
if (Object.keys(await prixEnregistres()).length !== 0)
  throw new Error('la remise à zéro n’a pas effacé les prix personnalisés')
console.log('OK: la remise à zéro fonctionne')

// ─── Le devis n'a pas bougé : même total avant et après la bascule ───────────
// C'est la vraie garantie. Changer d'unité d'affichage ne doit avoir aucun
// effet sur ce qu'un client paie.
const monterUnDevis = async (nom) => {
  await page.goto(base + '/estimateur')
  await page.waitForSelector('text=Nouveau devis', { timeout: 8000 })
  await page.click('text=Nouveau devis')
  await page.waitForSelector('text=Pour qui est ce devis ?', { timeout: 5000 })
  await page.click('text=Nouveau client')
  await page.fill('input[placeholder="ex: Jean Tremblay"]', nom)
  await page.click('text=Salle de bain')
  await page.click('text=Continuer')
  await page.waitForSelector('text=Quelles pièces sont à rénover ?', { timeout: 5000 })
  await page.locator('button:has-text("Salle de bain")').last().click()
  await page.waitForSelector('text=Surface de plancher', { timeout: 5000 })
  await page.click('text=Continuer')
  await page.waitForSelector('text=Quels travaux faut-il faire ?', { timeout: 5000 })
  await page.locator('button').filter({ has: page.locator('p:text-is("Revêtement mural")') }).first().click()
  await page.waitForTimeout(500)
  await page.locator('button').filter({ has: page.locator('p:text-is("Mur en céramique")') }).first().click()
  await page.waitForSelector('text=Travaux choisis', { timeout: 5000 })
  await page.click('text=Continuer')
  await page.waitForSelector('span:text-is("TOTAL")', { timeout: 8000 })
  const txt = await page.locator('span:text-is("TOTAL")').first()
    .locator('xpath=following-sibling::span[1]').textContent()
  return num(txt)
}

const totalEnMetres = await monterUnDevis('Essai Mètres')
console.log(`Devis monté avec l’affichage en mètres : ${totalEnMetres} $`)

await allerAuxPrix()
await page.click('button:has-text("Pieds carrés")')
await page.waitForTimeout(600)

const totalEnPieds = await monterUnDevis('Essai Pieds')
console.log(`Devis monté avec l’affichage en pieds  : ${totalEnPieds} $`)
if (Math.abs(totalEnPieds - totalEnMetres) > 0.5)
  throw new Error(`le total du devis a changé avec l’unité d’affichage : ${totalEnMetres} puis ${totalEnPieds}`)
console.log('OK: le total du devis est identique — l’unité d’affichage ne change aucun prix')

if (errors.length) { console.log('Erreurs JS:', errors); process.exit(1) }
console.log('\n✅ Prix du devis rapide affichables et modifiables en pieds carrés')
await browser.close()
