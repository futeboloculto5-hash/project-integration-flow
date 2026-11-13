# Baixa os clubes de cada competição na API-Football (1 chamada por competição). Roda no Google Colab.
# - Pede a chave na hora (não fica gravada no arquivo).
# - Retoma de onde parou: o que já foi baixado em "clubes/" é pulado, então pode rodar todo dia.
# - Para sozinho ao chegar em MAX_NOVOS chamadas novas (o limite grátis é 100/dia e o jogo também gasta da cota).
# - Descobre sozinho a temporada mais nova que o seu plano permite.
import requests, time, os, re, json, zipfile
from getpass import getpass
KEY = getpass("Cole a chave da API-Football (não aparece na tela) e dê Enter: ").strip()
MAX_NOVOS = 85
PAUSA = 6.5   # o plano grátis aceita ~10 pedidos por minuto
# competição:temporada mais nova que a API conhece. Ordem: países sem clubes, clubes continentais, o resto, e por último as 27 que já têm clubes.
IDS = "397:2026,1192:2026,258:2025,259:2026,260:2025,479:2026,923:2025,265:2026,266:2026,267:2026,527:2026,711:2026,1220:2026,169:2026,170:2026,171:2026,929:2026,972:2026,119:2026,120:2026,121:2026,122:2026,123:2020,124:2025,125:2025,126:2025,127:2025,862:2026,982:2024,983:2024,274:2026,275:2026,718:2018,924:2026,1250:2026,290:2026,291:2026,495:2025,905:2025,262:2026,263:2026,264:2019,662:2022,722:2026,857:2026,872:2026,1242:2026,200:2026,201:2026,822:2025,281:2026,282:2026,502:2020,503:2026,558:2020,1232:2026,404:2026,729:2026,884:2025,307:2026,308:2026,309:2026,504:2027,826:2026,827:2017,292:2026,293:2026,294:2026,295:2026,1234:2026,301:2026,302:2026,303:2026,560:2026,896:2026,253:2026,255:2026,256:2026,257:2026,489:2026,523:2024,866:2026,909:2026,1095:2026,1118:2025,2:2026,3:2026,11:2026,12:2026,13:2026,15:2025,16:2026,17:2026,18:2026,20:2026,27:2026,531:2026,533:2026,534:2026,541:2026,767:2022,768:2023,772:2026,848:2026,856:2026,869:2027,885:2026,1024:2023,1028:2026,1043:2023,1129:2026,1132:2026,1162:2026,1168:2026,1214:2027,129:2026,131:2026,132:2026,133:2023,134:2026,1032:2024,1067:2026,145:2026,148:2026,149:2026,150:2026,151:2024,152:2024,153:2024,154:2024,155:2024,156:2024,157:2024,158:2024,159:2024,160:2024,161:2024,487:2026,689:2024,690:2024,691:2024,979:2024,980:2024,75:2026,76:2026,475:2026,477:2026,520:2026,521:2026,522:2026,602:2027,603:2026,604:2026,606:2026,607:2026,608:2026,609:2027,610:2026,611:2026,615:2026,616:2026,621:2026,622:2027,623:2026,624:2026,626:2026,627:2026,628:2026,629:2026,630:2026,631:2026,1128:2026,240:2026,50:2026,51:2026,52:2025,53:2025,54:2025,55:2025,56:2025,57:2025,58:2026,59:2026,60:2026,931:2026,932:2025,933:2025,1022:2025,63:2026,67:2026,68:2026,69:2026,70:2023,461:2025,462:2025,463:2025,464:2025,465:2025,466:2025,467:2025,468:2024,469:2024,470:2023,471:2022,472:2022,1029:2025,83:2026,84:2026,85:2026,86:2026,87:2026,744:2026,745:2026,746:2026,747:2026,748:2026,749:2026,750:2026,751:2026,752:2026,753:2026,754:2026,755:2026,938:2026,939:2026,988:2025,989:2025,1003:2024,198:2020,494:2026,576:2026,577:2026,578:2026,579:2026,580:2026,581:2026,582:2026,583:2026,693:2026,694:2026,990:2025,138:2026,426:2026,427:2026,428:2026,429:2026,430:2026,431:2026,432:2026,433:2026,434:2026,942:2026,943:2026,974:2025,999:2025,89:2026,92:2026,93:2025,492:2026,1004:2025,251:2026,95:2026,457:2026,458:2026,459:2026,460:2026,681:2021,682:2021,683:2020,684:2020,865:2026,991:2025,435:2026,436:2026,437:2020,438:2020,439:2026,440:2026,441:2026,442:2026,443:2026,444:2026,445:2026,446:2026,447:2026,448:2026,449:2026,450:2026,451:2026,452:2026,453:2026,454:2026,455:2026,456:2026,692:2020,875:2026,876:2026,877:2026,878:2026,879:2026,1006:2025,563:2026,564:2026,592:2026,593:2026,594:2026,595:2026,596:2026,597:2026,1055:2026,204:2026,205:2026,552:2026,553:2026,554:2026,1027:2025,130:2026,483:2020,517:2026,810:2026,1178:2026,147:2026,519:2026,73:2026,77:2026,612:2026,617:2026,618:2026,632:2026,740:2026,741:2024,843:2025,1179:2026,1183:2026,241:2026,713:2026,45:2026,46:2026,47:2026,48:2026,528:2026,871:2026,1156:2026,65:2019,66:2026,526:2026,81:2026,529:2026,199:2026,1210:2027,137:2026,547:2026,891:2026,892:2026,90:2026,543:2025,501:2026,961:2025,96:2026,97:2026,550:2026,143:2026,556:2026,735:2026,115:2026,206:2026,551:2026,128:2026,144:2026,71:2026,72:2026,239:2026,39:2026,40:2026,41:2026,42:2026,43:2026,61:2026,62:2026,78:2026,79:2026,80:2026,197:2026,135:2026,136:2026,88:2026,250:2026,252:2026,94:2026,140:2026,141:2026,113:2026,114:2026,203:2026"
H = {"x-apisports-key": KEY}
os.makedirs("clubes", exist_ok=True)
novos, teto = 0, None
# Competições que você já baixou antes (de clubes.zip anteriores): são puladas mesmo num notebook novo.
PULAR = {169,170,171,258,259,260,265,266,267,397,479,527,711,923,929,972,1192,1220}

def chamar(liga, temporada):
    global novos
    r = requests.get("https://v3.football.api-sports.io/teams", params={"league": liga, "season": temporada}, headers=H, timeout=40)
    novos += 1
    return r.json()

for item in IDS.split(","):
    liga, ano = (int(x) for x in item.split(":"))
    if liga in PULAR or any(f.startswith(f"{liga}_") for f in os.listdir("clubes")): continue
    if novos >= MAX_NOVOS: print("Chegou em", MAX_NOVOS, "chamadas novas hoje. Rode de novo amanhã."); break
    temporada = min(ano, teto) if teto else ano
    for tentativa in range(3):
        d = chamar(liga, temporada)
        erros = d.get("errors") or {}
        txt = json.dumps(erros)
        if not erros: break
        anos = [int(a) for a in re.findall(r"\b(20\d\d)\b", txt)]
        if "plan" in erros and anos:          # plano grátis: só algumas temporadas
            teto = max(anos); temporada = min(ano, teto); print("  seu plano só permite até", teto); continue
        if "rateLimit" in erros: print("  limite por minuto, esperando 65s"); time.sleep(65); continue
        break
    erros = d.get("errors") or {}
    if erros:
        print("PAROU na liga", liga, erros)
        if "requests" in erros or "rateLimit" in erros: break
        continue
    open(f"clubes/{liga}_{temporada}.json", "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False))
    print(len(os.listdir("clubes")), "liga", liga, "temporada", temporada, "clubes", d.get("results"))
    time.sleep(PAUSA)

with zipfile.ZipFile("clubes.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for n in sorted(os.listdir("clubes")): z.write(f"clubes/{n}")
print("Baixados até agora:", len(os.listdir("clubes")), "de 394")
try:
    from google.colab import files; files.download("clubes.zip")
except Exception: pass
