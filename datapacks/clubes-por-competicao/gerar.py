#!/usr/bin/env python3
"""Gera datapack.json (clubes por competição) a partir do openfootball (domínio público, CC0).
Uso: python3 -I gerar.py <pasta com os clones do openfootball> <saida datapack.json>
Espera as pastas: brazil (=repo brazil), europe (=repo europe), england, deutschland, espana, italy, belgium.
Os clubes saem dos jogos de cada liga (arquivos Football.TXT). Nada é inventado: sem arquivo, a competição fica sem clubes.
"""
import json, re, sys, unicodedata, datetime

def slug(s):
    s = unicodedata.normalize("NFD", s); s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")[:64].strip("-")

# país da API -> (id, nome em português, ISO3, confederação). Ids iguais aos do pacote competicoes-por-pais quando existem.
PAIS = {
    "Brazil": ("brasil", "Brasil", "BRA", "CONMEBOL"), "Argentina": ("argentina", "Argentina", "ARG", "CONMEBOL"),
    "Colombia": ("colombia", "Colômbia", "COL", "CONMEBOL"), "Paraguay": ("paraguai", "Paraguai", "PRY", "CONMEBOL"),
    "England": ("inglaterra", "Inglaterra", "ENG", "UEFA"), "Germany": ("alemanha", "Alemanha", "DEU", "UEFA"),
    "Spain": ("espanha", "Espanha", "ESP", "UEFA"), "Italy": ("italia", "Itália", "ITA", "UEFA"),
    "France": ("franca", "França", "FRA", "UEFA"), "Netherlands": ("paises-baixos", "Países Baixos", "NLD", "UEFA"),
    "Portugal": ("portugal", "Portugal", "PRT", "UEFA"), "Belgium": ("belgica", "Bélgica", "BEL", "UEFA"),
    "Greece": ("grecia", "Grécia", "GRC", "UEFA"), "Sweden": ("suecia", "Suécia", "SWE", "UEFA"), "Turkey": ("turquia", "Turquia", "TUR", "UEFA"),
}
# (país, id na API-Football, nome de jogo, [arquivos em ordem de preferência: pasta relativa])
COMP = [
    ("Brazil", 71, "Brasileirão Série A", ["brazil/brazil/2026_br1.txt", "brazil/brazil/2025_br1.txt"], "comp:bra-brasileirao-serie-a"),
    ("Brazil", 72, "Brasileirão Série B", ["brazil/brazil/2026_br2.txt", "brazil/brazil/2025_br2.txt"], "comp:bra-brasileirao-serie-b"),
    ("Argentina", 128, "Liga Profesional Argentina", ["brazil/argentina/2026_ar1.txt", "brazil/argentina/2025_ar1.txt"], None),
    ("Colombia", 239, "Primera A", ["brazil/colombia/2026_co1.txt", "brazil/colombia/2025_co1.txt"], None),
    ("Paraguay", 250, "Division Profesional - Apertura", ["brazil/paraguay/2025_py1.txt"], None),
    ("Paraguay", 252, "Division Profesional - Clausura", ["brazil/paraguay/2025_py1.txt"], None),
    ("England", 39, "Premier League", ["england/2026-27/1-premierleague.txt", "england/2025-26/1-premierleague.txt"], None),
    ("England", 40, "Championship", ["england/2026-27/2-championship.txt", "england/2025-26/2-championship.txt"], None),
    ("England", 41, "League One", ["england/2026-27/3-league1.txt", "england/2025-26/3-league1.txt"], None),
    ("England", 42, "League Two", ["england/2026-27/4-league2.txt", "england/2025-26/4-league2.txt"], None),
    ("England", 43, "National League", ["england/2026-27/5-nationalleague.txt", "england/2025-26/5-nationalleague.txt"], None),
    ("Germany", 78, "Bundesliga", ["deutschland/2026-27/1-bundesliga.txt", "deutschland/2025-26/1-bundesliga.txt"], None),
    ("Germany", 79, "2. Bundesliga", ["deutschland/2026-27/2-bundesliga2.txt", "deutschland/2025-26/2-bundesliga2.txt"], None),
    ("Germany", 80, "3. Liga", ["deutschland/2026-27/3-liga3.txt", "deutschland/2025-26/3-liga3.txt"], None),
    ("Spain", 140, "La Liga", ["espana/2026-27/1-liga.txt", "espana/2025-26/1-liga.txt"], None),
    ("Spain", 141, "Segunda División", ["espana/2026-27/2-liga2.txt", "espana/2025-26/2-liga2.txt"], None),
    ("Italy", 135, "Serie A", ["italy/2026-27/1-seriea.txt", "italy/2025-26/1-seriea.txt"], None),
    ("Italy", 136, "Serie B", ["italy/2026-27/2-serieb.txt", "italy/2025-26/2-serieb.txt"], None),
    ("France", 61, "Ligue 1", ["europe/france/2026-27_fr1.txt", "europe/france/2025-26_fr1.txt"], None),
    ("France", 62, "Ligue 2", ["europe/france/2026-27_fr2.txt", "europe/france/2025-26_fr2.txt"], None),
    ("Netherlands", 88, "Eredivisie", ["europe/netherlands/2026-27_nl1.txt", "europe/netherlands/2025-26_nl1.txt"], None),
    ("Portugal", 94, "Primeira Liga", ["europe/portugal/2026-27_pt1.txt", "europe/portugal/2025-26_pt1.txt"], None),
    ("Belgium", 144, "Jupiler Pro League", ["belgium/2026-27/be1.txt", "belgium/2025-26/be1.txt"], None),
    ("Greece", 197, "Super League 1", ["europe/greece/2026-27_gr1.txt", "europe/greece/2025-26_gr1.txt"], None),
    ("Sweden", 113, "Allsvenskan", ["europe/sweden/2026_se1.txt", "europe/sweden/2025_se1.txt"], None),
    ("Sweden", 114, "Superettan", ["europe/sweden/2026_se2.txt", "europe/sweden/2025_se2.txt"], None),
    ("Turkey", 203, "Süper Lig", ["europe/turkey/2026-27_tr1.txt", "europe/turkey/2025-26_tr1.txt"], None),
]
LINE = re.compile(r"^\s*(?:\d{1,2}[.:]\d{2}\s+)?(.+?)\s+v\s+(.+?)\s*$")
def clean(n):
    n = re.sub(r"\[[^\]]*\]", "", n)
    n = re.sub(r"^(--[:.]--|\d{1,2}[.:]\d{2})\s+", "", n.strip())   # hora ou hora indefinida
    n = re.sub(r"\s*\(\*\)\s*$", "", n)                              # marca de rodapé
    n = re.sub(r"\s+(\d+\s*-\s*\d+|-)\s*(\(.*\))?\s*$", "", n)   # placar no fim
    n = re.sub(r"\s+\d{1,2}[.:]\d{2}\s*$", "", n)
    return re.sub(r"\s+", " ", n).strip()
def ler(path):
    teams, header, title = [], None, ""
    for l in open(path, encoding="utf-8"):
        if l.startswith("= ") and not title: title = l[2:].strip()
        m = re.match(r"^#\s*Teams\s+(\d+)", l)
        if m: header = int(m.group(1))
        m = LINE.match(l)
        if m:
            for t in (clean(m.group(1)), clean(m.group(2))):
                if t and t not in teams: teams.append(t)
    return teams, header, title
def temporada(path):
    m = re.search(r"/(\d{4})[-_/]?(\d{2})?[-_/]", "/" + path.split("/", 1)[1] + "/") or re.search(r"(\d{4})", path)
    y = re.search(r"(20\d{2})-(\d{2})", path)
    if y: return f"{y.group(1)}/{y.group(2)}"
    return re.search(r"(20\d{2})", path).group(1)

def main(raiz, saida):
    hoje = datetime.date.today().isoformat()
    paises, comps, clubes, editions, avisos, usados = {}, [], {}, [], [], set()
    for pais, api_id, nome, arquivos, comp_id in COMP:
        caminho = next((a for a in arquivos if __import__("os").path.exists(f"{raiz}/{a}")), None)
        if not caminho: avisos.append(f"{pais} / {nome}: sem arquivo; fica sem clubes"); continue
        times, hdr, _ = ler(f"{raiz}/{caminho}")
        if hdr is not None and hdr != len(times): avisos.append(f"{nome}: o arquivo diz {hdr} times, li {len(times)} ({caminho})")
        if len(times) < 4: avisos.append(f"{nome}: só {len(times)} times, ignorado"); continue
        pid, pnome, iso, conf = PAIS[pais]
        paises[pid] = {"id": f"ctry:{pid}", "name": pnome, "code": iso, "confederation": conf, "dataStatus": "pesquisa"}
        cid = comp_id or f"comp:{iso.lower()}-{slug(nome)}"
        comps.append({"id": cid, "name": nome, "countryId": f"ctry:{pid}", "kind": "league", "externalIds": {"apiFootball": api_id}, "dataStatus": "pesquisa"})
        ids = []
        for t in times:
            base = f"club:{slug(t)}"; c = base
            if c in usados and clubes.get(c, {}).get("name") != t or (c in usados and clubes[c]["countryId"] != f"ctry:{pid}"): c = f"{base}-{pid}"
            if c not in clubes:
                clubes[c] = {"id": c, "name": t, "countryId": f"ctry:{pid}", "dataStatus": "pesquisa"}; usados.add(c)
            ids.append(c)
        editions.append({"competitionId": cid, "season": temporada(caminho), "clubIds": ids, "dataStatus": "pesquisa"})
    manifest = {"schema": "ccw.datapack", "schemaVersion": 1, "packId": "clubes-por-competicao",
        "version": "1." + hoje[2:].replace("-", "") + ".0", "name": "Clubes por competição (openfootball)", "createdAt": hoje, "origin": "comunitario",
        "source": {"name": "openfootball (football.db)", "url": "https://github.com/openfootball", "license": "CC0 1.0 (domínio público)", "retrievedAt": hoje},
        "counts": {"countries": len(paises), "competitions": len(comps), "clubs": len(clubes), "players": 0, "editions": len(editions)},
        "notes": "Clubes lidos dos jogos de cada liga (temporada mais recente disponível por competição). Competições sem arquivo no openfootball ficam sem clubes. Sem jogadores."}
    pack = {"manifest": manifest, "countries": sorted(paises.values(), key=lambda c: c["name"]), "competitions": comps, "editions": editions, "clubs": list(clubes.values()), "players": []}
    json.dump(pack, open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for a in avisos: print("AVISO:", a)
    print(len(paises), "países", len(comps), "competições", len(clubes), "clubes", len(editions), "edições")
if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
