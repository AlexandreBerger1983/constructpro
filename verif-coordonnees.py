# Contrôle du contenu réel des fichiers Excel et Word produits par
# l'application : les coordonnées du client doivent y être, et la signature
# doit porter la police d'écriture — pas seulement le bon texte.
import sys
from openpyxl import load_workbook
from docx import Document
from docx.shared import Pt

dossier, signataire, *attendus = sys.argv[1:]
echecs = []

# ─── Excel ───────────────────────────────────────────────────────────────────
wb = load_workbook(f'{dossier}/soumission.xlsx')
textes_xlsx, police_signature_xlsx = [], None
for ws in wb.worksheets:
    for ligne in ws.iter_rows():
        for cell in ligne:
            if isinstance(cell.value, str):
                textes_xlsx.append(cell.value)
                # Le nom du signataire apparaît DEUX fois : signé au-dessus du
                # trait, et rappelé en dessous avec le nom de l'entreprise.
                # On retient la police d'écriture si l'une des deux la porte.
                if cell.value.strip() == signataire:
                    nom = cell.font.name or ''
                    if 'script' in nom.lower() or police_signature_xlsx is None:
                        police_signature_xlsx = nom
xlsx = '\n'.join(textes_xlsx)

for attendu in attendus:
    if attendu not in xlsx:
        echecs.append(f'Excel : « {attendu} » absent')
if signataire not in xlsx:
    echecs.append('Excel : la signature est absente')
elif not police_signature_xlsx or 'script' not in police_signature_xlsx.lower():
    echecs.append(f'Excel : la signature n’est pas en police d’écriture ({police_signature_xlsx})')

# ─── Word ────────────────────────────────────────────────────────────────────
doc = Document(f'{dossier}/soumission.docx')
paras = [p.text for p in doc.paragraphs]
for tbl in doc.tables:
    for row in tbl.rows:
        for cell in row.cells:
            paras.extend(p.text for p in cell.paragraphs)
docx = '\n'.join(paras)

police_signature_docx = None
for p in doc.paragraphs:
    if p.text.strip() == signataire:
        for run in p.runs:
            if not run.text.strip():
                continue
            nom = run.font.name or ''
            if 'script' in nom.lower() or police_signature_docx is None:
                police_signature_docx = nom

for attendu in attendus:
    if attendu not in docx:
        echecs.append(f'Word : « {attendu} » absent')
if signataire not in docx:
    echecs.append('Word : la signature est absente')
elif not police_signature_docx or 'script' not in police_signature_docx.lower():
    echecs.append(f'Word : la signature n’est pas en police d’écriture ({police_signature_docx})')

if echecs:
    print('\n'.join('ÉCHEC ' + e for e in echecs))
    sys.exit(1)

for attendu in attendus:
    print(f'OK: « {attendu} » présent dans l’Excel et dans le Word')
print(f'OK: la signature « {signataire} » est présente dans les deux,')
print(f'    en police {police_signature_xlsx} (Excel) et {police_signature_docx} (Word)')
