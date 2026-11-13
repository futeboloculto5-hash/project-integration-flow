#!/usr/bin/env python3
"""Monta o datapack final `mundo-competicoes-clubes` juntando:
  1. competicoes.md  (lista aprovada pelo dono do projeto: competições por país + World, com ids da API-Football)
  2. ../clubes-por-competicao/datapack.json  (clubes e edições do openfootball, CC0)
Uso: python3 -I montar.py   (gera base.json; depois rode montar-clubes.ts para gerar datapack.json)"""
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
# ---- clubes vindos do API-Football (fonte-api/<liga>_<temporada>.json); só entram em competições que ainda não têm clubes ----
import glob
EN_CLUBE = dict(EN); EN_CLUBE.update({"Congo-DR": "congo-rd"})
temporadas = json.load(open(f"{AQUI}/temporadas.json", encoding="utf-8"))
clubes = list(cl["clubs"]); editions = list(cl["editions"])
por_cid = {c["id"]: c for c in comps}
api_para_cid = {c["externalIds"]["apiFootball"]: c["id"] for c in comps}
tem_clubes = {e["competitionId"] for e in editions}
api_id_para_clube, ids_clube = {}, {c["id"] for c in clubes}
avisos_api = []
def pais_do_time(nome):
    pid = f"ctry:{EN_CLUBE[nome]}" if nome in EN_CLUBE else f"ctry:{slug(nome)}"
    if pid not in paises: paises[pid] = {"id": pid, "name": nome, "dataStatus": "pesquisa"}
    usados_paises.add(pid)
    return pid
for f in sorted(glob.glob(f"{AQUI}/fonte-api/*.json"), key=lambda x: int(os.path.basename(x).split("_")[0])):
    liga, ano = os.path.basename(f)[:-5].split("_")
    d = json.load(open(f, encoding="utf-8"))
    cid = api_para_cid.get(int(liga))
    if cid is None or cid not in por_cid: avisos_api.append(f"liga {liga}: não está na lista do jogo"); continue
    if d.get("errors") or not d.get("response"): avisos_api.append(f"{por_cid[cid]['name']} ({liga}): sem clubes na temporada {ano}"); continue
    if cid in tem_clubes: avisos_api.append(f"{por_cid[cid]['name']} ({liga}): já tem clubes do openfootball, mantidos"); continue
    ids_edicao = []
    for item in d["response"]:
        t = item["team"]
        if t.get("national"): continue
        if t["id"] not in api_id_para_clube:
            pid = pais_do_time(t["country"]) if t.get("country") else por_cid[cid].get("countryId")
            if not pid: avisos_api.append(f"time {t['name']} sem país, ignorado"); continue
            base = f"club:{slug(t['name'])}"; novo = base
            if novo in ids_clube: novo = f"{base}-{pid.split(':')[1]}"
            if novo in ids_clube: novo = f"{base}-{t['id']}"
            ids_clube.add(novo); api_id_para_clube[t["id"]] = novo
            c = {"id": novo, "name": t["name"], "countryId": pid, "externalIds": {"apiFootball": t["id"]}, "dataStatus": "pesquisa"}
            if t.get("code"): c["short"] = t["code"]
            v = item.get("venue") or {}
            if v.get("city"): c["city"] = v["city"]
            if v.get("name"): c["stadium"] = v["name"]
            clubes.append(c)
        if api_id_para_clube[t["id"]] not in ids_edicao: ids_edicao.append(api_id_para_clube[t["id"]])
    if ids_edicao:
        editions.append({"competitionId": cid, "season": temporadas.get(liga, {}).get(ano, ano), "clubIds": ids_edicao, "dataStatus": "pesquisa"}); tem_clubes.add(cid)
ids = {c["id"] for c in comps}
for e in editions: assert e["competitionId"] in ids, e["competitionId"]
hoje = datetime.date.today().isoformat()
paises_usados = sorted((paises[p] for p in usados_paises | {c["countryId"] for c in clubes}), key=lambda c: c["name"])
pack = {"manifest": {"schema": "ccw.datapack", "schemaVersion": 1, "packId": "mundo-competicoes-clubes", "version": "1." + hoje[2:].replace("-", "") + ".0",
        "name": "Competições do mundo por país e clubes", "createdAt": hoje, "origin": "comunitario",
        "source": {"name": "API-Football (competições e parte dos clubes) + openfootball (clubes, CC0)", "license": "Dados do API-Football da conta do dono do projeto, sob os termos dele (não redistribuir). Clubes do openfootball: CC0 1.0.", "retrievedAt": hoje},
        "counts": {"countries": len(paises_usados), "competitions": len(comps), "clubs": len(clubes), "players": 0, "editions": len(editions)},
        "notes": "Só masculino e adulto; estaduais do Brasil só 1ª divisão. Competições World sem país. Clubes: openfootball (temporada atual) onde existe; senão API-Football (temporada mais nova que o plano permite, ver a edição). Sem jogadores."},
        "countries": paises_usados, "competitions": comps, "editions": editions, "clubs": clubes, "players": []}
json.dump(pack, open(f"{AQUI}/base.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for a in avisos_api: print("AVISO:", a)
print(len(paises_usados), "países", len(comps), "competições", len(clubes), "clubes", len(editions), "edições")
