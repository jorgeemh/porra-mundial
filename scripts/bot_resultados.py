#!/usr/bin/env python3
"""
Bot que mete resultados del Mundial 2026 automáticamente.

Flujo:
1. Lee partidos.json (calendario oficial con IDs G_A_1, R32_1, etc.)
2. Llama a la API pública de ESPN (sin key, gratis)
3. Por cada partido finalizado, hace match con un partido nuestro
4. Llama a la RPC bot_set_resultado de Supabase para guardar el resultado

Pensado para ejecutarse desde GitHub Actions con cron cada 30 min.

Variables de entorno necesarias (configurar como secretos en GitHub):
  SUPABASE_URL       — p.ej. https://xxx.supabase.co
  SUPABASE_ANON_KEY  — clave pública (sb_publishable_...)
  BOT_KEY            — bot key configurada en config.bot_key
"""

import os
import sys
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# ----------------------------------------
# Configuración
# ----------------------------------------
ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
ESPN_URL_DATE_PARAM = "?dates={ymd}"  # ej. ?dates=20260615

ROOT = Path(__file__).resolve().parent.parent
PARTIDOS_PATH = ROOT / "data" / "partidos.json"

# Mapeo de códigos ESPN → nuestros códigos. ESPN usa 3 letras pero algunos
# difieren. Esta tabla cubre las diferencias conocidas. Si aparece un equipo
# que no está aquí, asume que coincide.
ESPN_A_NUESTRO = {
    # Casos donde ESPN usa código distinto al de la FIFA / nuestro
    "DRC": "COD",   # ESPN a veces usa "DRC" para RD Congo
    "RSA": "RSA",   # Sudáfrica - igual
    "KSA": "KSA",   # Arabia Saudí - igual
    "BIH": "BIH",
    "CPV": "CPV",
    "CIV": "CIV",
    "NZL": "NZL",
    "USA": "USA",
    # El resto: dejamos que coincidan tal cual
}

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
BOT_KEY = os.environ.get("BOT_KEY", "")

DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"


# ----------------------------------------
# Utilidades
# ----------------------------------------
def log(msg, level="INFO"):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {level}: {msg}", flush=True)

def http_get_json(url):
    req = Request(url, headers={"User-Agent": "porra-mundial-bot/1.0"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def normalizar_codigo(codigo_espn):
    """Convierte el código de ESPN al nuestro si hace falta."""
    if not codigo_espn: return None
    c = codigo_espn.upper().strip()
    return ESPN_A_NUESTRO.get(c, c)


# ----------------------------------------
# Llamadas a Supabase (sin requests, solo stdlib)
# ----------------------------------------
def supabase_rpc(funcion, payload):
    url = f"{SUPABASE_URL}/rest/v1/rpc/{funcion}"
    body = json.dumps(payload).encode("utf-8")
    req = Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer": "return=minimal",
    })
    try:
        with urlopen(req, timeout=30) as r:
            return True, r.read().decode("utf-8")
    except HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8','ignore')[:300]}"
    except URLError as e:
        return False, f"URLError: {e.reason}"


# ----------------------------------------
# Cargar nuestros partidos
# ----------------------------------------
def cargar_partidos():
    data = json.load(open(PARTIDOS_PATH))
    # Por ahora solo procesamos partidos de grupos (los eliminatorios se generan
    # dinámicamente con admin_generar_eliminatorias y necesitan otro flujo).
    return data["partidos_grupos"]


# ----------------------------------------
# Obtener partidos finalizados de ESPN
# ----------------------------------------
def fetch_partidos_espn():
    """Devuelve lista de partidos del Mundial finalizados en los últimos 14 días."""
    finalizados = []
    hoy = datetime.now(timezone.utc).date()
    # Ventana de 14 días: si GitHub Actions fallara varios días seguidos, al
    # volver el bot aún encuentra los partidos atrasados (con 7 días se
    # perderían los más antiguos). El blindaje del parche 09 garantiza que
    # re-procesar partidos ya resueltos no toca nada.
    for dias_atras in range(14):
        fecha = hoy - timedelta(days=dias_atras)
        url = ESPN_URL + ESPN_URL_DATE_PARAM.format(ymd=fecha.strftime("%Y%m%d"))
        try:
            data = http_get_json(url)
        except Exception as e:
            log(f"Error consultando ESPN para {fecha}: {e}", "WARN")
            continue

        for event in data.get("events", []):
            comp = event.get("competitions", [{}])[0]
            estado = comp.get("status", {}).get("type", {}).get("state", "")
            if estado != "post":  # solo partidos finalizados ("post")
                continue
            competitors = comp.get("competitors", [])
            if len(competitors) != 2:
                continue

            # ESPN devuelve home/away pero no garantiza orden. Usamos el campo "homeAway"
            home = next((c for c in competitors if c.get("homeAway")=="home"), competitors[0])
            away = next((c for c in competitors if c.get("homeAway")=="away"), competitors[1])

            equipo_a_codigo = normalizar_codigo(home.get("team", {}).get("abbreviation"))
            equipo_b_codigo = normalizar_codigo(away.get("team", {}).get("abbreviation"))
            try:
                goles_home = int(home.get("score", 0))
                goles_away = int(away.get("score", 0))
            except (ValueError, TypeError):
                continue

            # Ganador según el campo "winner" de ESPN. En eliminatorias esto refleja
            # quién AVANZÓ (incluye prórroga y penaltis), no solo el marcador de 90 min.
            ganador_codigo = None
            if home.get("winner") is True:
                ganador_codigo = equipo_a_codigo
            elif away.get("winner") is True:
                ganador_codigo = equipo_b_codigo

            finalizados.append({
                "fecha_iso": event.get("date"),
                "equipo_local": equipo_a_codigo,
                "equipo_visitante": equipo_b_codigo,
                "goles_local": goles_home,
                "goles_visitante": goles_away,
                "ganador": ganador_codigo,
                "espn_id": event.get("id"),
            })
    return finalizados


# ----------------------------------------
# Leer partidos de ELIMINATORIA pendientes desde nuestra base de datos.
# (Sus equipos se rellenan dinámicamente tras "Generar cuadro", por eso no
#  están en partidos.json y hay que consultarlos en Supabase.)
# ----------------------------------------
def fetch_elim_pendientes():
    """Devuelve partidos elim con ambos equipos definidos y sin resultado todavía."""
    url = (f"{SUPABASE_URL}/rest/v1/partidos"
           f"?select=id,fase,equipo_a,equipo_b,fecha_hora,resultado"
           f"&fase=in.(r32,r16,qf,sf,final)"
           f"&resultado=is.null"
           f"&equipo_a=not.is.null"
           f"&equipo_b=not.is.null")
    req = Request(url, headers={
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    })
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except (HTTPError, URLError) as e:
        log(f"No se pudieron leer eliminatorias de Supabase: {e}", "WARN")
        return []


# ----------------------------------------
# Match: encontrar nuestro partido que coincide con uno de ESPN
# ----------------------------------------
def match_partido(api_match, nuestros):
    """Busca en nuestros partidos uno que coincida con el de la API por
    equipos (set) y fecha (±36h por márgenes de zona horaria/aplazamientos)."""
    equipos_api = {api_match["equipo_local"], api_match["equipo_visitante"]}
    if None in equipos_api: return None

    fecha_api = datetime.fromisoformat(api_match["fecha_iso"].replace("Z","+00:00"))

    candidatos = []
    for p in nuestros:
        equipos_p = {p["equipo_a"], p["equipo_b"]}
        if equipos_p != equipos_api: continue
        fecha_p = datetime.fromisoformat(p["fecha_hora"])
        diff_horas = abs((fecha_api - fecha_p).total_seconds()) / 3600
        if diff_horas <= 36:
            candidatos.append((diff_horas, p))

    if not candidatos: return None
    candidatos.sort(key=lambda x: x[0])
    return candidatos[0][1]


# ----------------------------------------
# Convertir orden home/away de ESPN al de nuestro partido
# ----------------------------------------
def goles_segun_nuestro_orden(api_match, partido):
    """Devuelve (goles_a, goles_b) según el orden de nuestro partido."""
    if api_match["equipo_local"] == partido["equipo_a"]:
        return api_match["goles_local"], api_match["goles_visitante"]
    else:
        return api_match["goles_visitante"], api_match["goles_local"]


# ----------------------------------------
# Programa principal
# ----------------------------------------
def main():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY or not BOT_KEY:
        log("Faltan variables de entorno (SUPABASE_URL, SUPABASE_ANON_KEY, BOT_KEY)", "ERROR")
        sys.exit(1)

    log(f"DRY_RUN={DRY_RUN}")
    nuestros = cargar_partidos()
    log(f"Cargados {len(nuestros)} partidos de grupos desde partidos.json")

    api_matches = fetch_partidos_espn()
    log(f"Obtenidos {len(api_matches)} partidos finalizados de ESPN")

    actualizados = 0
    no_matcheados = 0
    errores = 0
    sin_cambio = 0

    for m in api_matches:
        nuestro = match_partido(m, nuestros)
        if not nuestro:
            no_matcheados += 1
            log(f"   ⚠️  No match: {m['equipo_local']} vs {m['equipo_visitante']} ({m['fecha_iso']})", "WARN")
            continue
        ga, gb = goles_segun_nuestro_orden(m, nuestro)

        log(f"📊 {nuestro['id']}: {nuestro['equipo_a']} {ga}-{gb} {nuestro['equipo_b']}")

        if DRY_RUN:
            sin_cambio += 1
            continue

        ok, info = supabase_rpc("bot_set_resultado", {
            "p_bot_key": BOT_KEY,
            "p_partido_id": nuestro["id"],
            "p_goles_a": ga,
            "p_goles_b": gb,
            "p_ganador": None,
        })
        if ok:
            actualizados += 1
        else:
            errores += 1
            log(f"   ❌ RPC error: {info}", "ERROR")

    log(f"── Grupos: ✅ {actualizados} actualizados · ⚠️ {no_matcheados} sin match · ❌ {errores} errores · 🔵 {sin_cambio} dry-run")

    # ========================================================
    # ELIMINATORIAS (solo si el bracket ya está generado)
    # ========================================================
    elim_act = elim_no_match = elim_err = elim_dry = 0
    elim_pendientes = fetch_elim_pendientes()
    if elim_pendientes:
        log(f"Partidos de eliminatoria pendientes en la BD: {len(elim_pendientes)}")
        for ep in elim_pendientes:
            eq = {ep["equipo_a"], ep["equipo_b"]}
            # En eliminación directa, un par de equipos solo se enfrenta una vez,
            # así que basta con matchear por equipos. Solo aceptamos un partido de
            # ESPN que esté finalizado Y tenga un ganador definido.
            espn_match = None
            for m in api_matches:
                if {m["equipo_local"], m["equipo_visitante"]} == eq and m.get("ganador"):
                    espn_match = m; break
            if not espn_match:
                # Aún no se ha jugado (o ESPN no ha marcado ganador todavía). Normal.
                elim_no_match += 1
                continue
            ganador = espn_match["ganador"]
            if ganador not in eq:
                log(f"   ⚠️  {ep['id']}: ganador de ESPN ({ganador}) no coincide con los equipos {eq}", "WARN")
                elim_no_match += 1
                continue
            # Goles ordenados según equipo_a de NUESTRO partido (informativo)
            if espn_match["equipo_local"] == ep["equipo_a"]:
                ga, gb = espn_match["goles_local"], espn_match["goles_visitante"]
            else:
                ga, gb = espn_match["goles_visitante"], espn_match["goles_local"]

            log(f"🏆 {ep['id']} ({ep['fase']}): pasa {ganador}  [{ep['equipo_a']} {ga}-{gb} {ep['equipo_b']}]")

            if DRY_RUN:
                elim_dry += 1
                continue

            ok, info = supabase_rpc("bot_set_resultado", {
                "p_bot_key": BOT_KEY,
                "p_partido_id": ep["id"],
                "p_goles_a": ga,
                "p_goles_b": gb,
                "p_ganador": ganador,
            })
            if ok:
                elim_act += 1
            else:
                elim_err += 1
                log(f"   ❌ RPC error en {ep['id']}: {info}", "ERROR")
        log(f"── Eliminatorias: ✅ {elim_act} actualizados · ⏳ {elim_no_match} aún no jugados · ❌ {elim_err} errores · 🔵 {elim_dry} dry-run")
    else:
        log("Eliminatorias: no hay partidos pendientes (bracket no generado o todos resueltos)")

    log("─" * 50)
    total_err = errores + elim_err
    log(f"TOTAL: ✅ {actualizados + elim_act} resultados metidos · ❌ {total_err} errores")

    if total_err > 0:
        sys.exit(2)


if __name__ == "__main__":
    main()
