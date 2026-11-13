#!/usr/bin/env python3
"""Monta o datapack final `mundo-competicoes-clubes` juntando:
  1. competicoes.md  (lista aprovada pelo dono do projeto: competições por país + World, com ids da API-Football)
  2. ../clubes-por-competicao/datapack.json  (clubes e edições do openfootball, CC0)
Uso: python3 -I montar.py   (gera datapack.json ao lado)"""
import json, re, unicodedata, datetime, os
AQUI = os.path.dirname(os.path.abspath(__file__))
def slug(s):
    s = unicodedata.normalize("NFD", s); s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")[:64].strip("-")

base = json.load(open(f"{AQUI}/../competicoes-por-pais/datapack.json", encoding="utf-8"))
cl = json.load(open(f"{AQUI}/../clubes-por-competicao/datapack.json", encoding="utf-8"))
paises = {c["id"]: c for c in base["countries"] + cl["countries"]}
paises["ctry:colombia"] = {"id": "ctry:colombia", "name": "Colômbia", "code": "COL", "confederation": "CONMEBOL", "dataStatus": "pesquisa"}
paises["ctry:paraguai"] = {"id": "ctry:paraguai", "name": "Paraguai", "code": "PRY", "confederation": "CONMEBOL", "dataStatus": "pesquisa"}
EN = {"Angola": "angola", "Argentina": "argentina", "Belgium": "belgica", "Brazil": "brasil", "Canada": "canada", "Chile": "chile", "China": "china",
      "Colombia": "colombia", "Denmark": "dinamarca", "England": "inglaterra", "France": "franca", "Germany": "alemanha", "Greece": "grecia", "Indonesia": "indonesia",
      "Iran": "ira", "Italy": "italia", "Mexico": "mexico", "Morocco": "marrocos", "Netherlands": "paises-baixos", "Paraguay": "paraguai", "Peru": "peru",
      "Portugal": "portugal", "San-Marino": "san-marino", "Saudi-Arabia": "arabia-saudita", "South-Korea": "coreia-do-sul", "Spain": "espanha", "Sweden": "suecia",
      "Turkey": "turquia", "United-Arab-Emirates": "emirados-arabes-unidos", "USA": "estados-unidos"}
# ids já usados pelos pacotes anteriores (para não mudar o id de uma competição)
por_api = {c["externalIds"]["apiFootball"]: c["id"] for c in cl["competitions"]}
por_api.update({71: "comp:bra-brasileirao-serie-a", 72: "comp:bra-brasileirao-serie-b"})

pais_atual, comps, usados, usados_paises = None, [], set(), set()
for linha in open(f"{AQUI}/competicoes.md", encoding="utf-8"):
    m = re.match(r"^## (\S+) \(\d+\)", linha)
    if m: pais_atual = m.group(1); continue
    m = re.match(r"^- (.+?)(?: \(API: .+?\))? \[([LC])\] id (\d+)$", linha.rstrip())
    if not m or not pais_atual: continue
    nome, tipo, api = m.group(1), m.group(2), int(m.group(3))
    kind = "league" if tipo == "L" else "cup"
    if pais_atual == "World": cid_pais, prefixo = None, "int"
    else:
        pid = f"ctry:{EN[pais_atual]}"; cid_pais = pid; usados_paises.add(pid); prefixo = paises[pid]["code"].lower()
    cid = por_api.get(api) or f"comp:{prefixo}-{slug(nome)}"
    if cid in usados: cid = f"{cid}-{api}"
    usados.add(cid)
    c = {"id": cid, "name": nome, "kind": kind, "externalIds": {"apiFootball": api}, "dataStatus": "pesquisa"}
    if cid_pais: c["countryId"] = cid_pais
    comps.append(c)
ids = {c["id"] for c in comps}
for e in cl["editions"]: assert e["competitionId"] in ids, e["competitionId"]
hoje = datetime.date.today().isoformat()
paises_usados = sorted((paises[p] for p in usados_paises | {c["countryId"] for c in cl["clubs"]}), key=lambda c: c["name"])
pack = {"manifest": {"schema": "ccw.datapack", "schemaVersion": 1, "packId": "mundo-competicoes-clubes", "version": "1." + hoje[2:].replace("-", "") + ".0",
        "name": "Competições do mundo por país e clubes", "createdAt": hoje, "origin": "comunitario",
        "source": {"name": "API-Football (lista de competições) + openfootball (clubes, CC0)", "license": "Competições: dados do API-Football da conta do dono do projeto, sob os termos dele (não redistribuir). Clubes: openfootball, CC0 1.0.", "retrievedAt": hoje},
        "counts": {"countries": len(paises_usados), "competitions": len(comps), "clubs": len(cl["clubs"]), "players": 0, "editions": len(cl["editions"])},
        "notes": "Só masculino e adulto; estaduais do Brasil só 1ª divisão. Competições World sem país. Clubes só onde o openfootball tem a liga (27 competições). Sem jogadores."},
        "countries": paises_usados, "competitions": comps, "editions": cl["editions"], "clubs": cl["clubs"], "players": []}
json.dump(pack, open(f"{AQUI}/datapack.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(paises_usados), "países", len(comps), "competições", len(cl["clubs"]), "clubes", len(cl["editions"]), "edições")
