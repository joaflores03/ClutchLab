"""
ClutchLab — Analizador de demos de CS2 (awpy 2.x, robusto)
Uso: python analyze.py ruta/a/tu_demo.dem [nombre_jugador]
"""
import sys
from pathlib import Path
from awpy import Demo
import polars as pl


def asignar_ronda_por_tick(kills: pl.DataFrame, rounds: pl.DataFrame) -> pl.DataFrame:
    """Asigna round_num a cada kill usando los ticks de inicio/fin de ronda."""
    if "round_num" in kills.columns:
        print("✅ 'round_num' ya está en kills.")
        return kills

    print("⚠️ 'round_num' no está en kills. Intentando asignar por ticks...")
    print(f"   Columnas de rounds: {rounds.columns}")
    print(f"   Primeras 2 filas de rounds:\n{rounds.head(2)}")
    print(f"   Rango de ticks en kills: {kills['tick'].min()} - {kills['tick'].max()}")

    # Detectar columnas de inicio y fin
    start_col = None
    end_col = None
    for c in rounds.columns:
        cl = c.lower()
        if 'start' in cl and 'tick' in cl:
            start_col = c
        if 'end' in cl and 'tick' in cl:
            end_col = c
    if not start_col or not end_col:
        for c in rounds.columns:
            cl = c.lower()
            if cl in ('start', 'start_tick'):
                start_col = c
            if cl in ('end', 'end_tick'):
                end_col = c

    if not start_col or not end_col:
        print("❌ No se encontraron columnas de inicio/fin en rounds. No se puede asignar round_num.")
        return kills

    print(f"   Usando columnas: start='{start_col}', end='{end_col}'")

    # Filtrar rondas con ticks válidos (start null → usar 0)
    rangos_df = rounds.select(
        pl.col(start_col).fill_null(0).alias("start"),
        pl.col(end_col).alias("end"),
        pl.col("round_num")
    ).filter(
        pl.col("end").is_not_null()
    )
    rangos_list = list(rangos_df.iter_rows())
    print(f"   Rangos válidos: {len(rangos_list)}")

    if not rangos_list:
        print("❌ No hay rangos de ronda válidos.")
        return kills

    def tick_a_ronda(tick: int) -> int | None:
        for start, end, ronda in rangos_list:
            if start <= tick <= end:
                return ronda
        return None

    kills = kills.with_columns(
        pl.col("tick").map_elements(tick_a_ronda, return_dtype=pl.Int64).alias("round_num")
    )
    kills = kills.filter(pl.col("round_num").is_not_null())
    print(f"   → {len(kills)} kills asignados a rondas por tick.")
    return kills


def analizar_demo(ruta_demo: str, target_player: str = None):
    print(f"📂 Parseando: {ruta_demo}")
    demo = Demo(Path(ruta_demo))
    demo.load("kills", "damages", "rounds", "stats")

    print(f"✅ Demo cargada")
    mapa = demo.header.get("map_name", "desconocido")
    print(f"   - Mapa: {mapa}")

    rounds = demo.rounds
    kills = demo.kills
    stats = demo.stats
    damages = demo.damages

    total_rounds = len(rounds)
    print(f"   - Rondas: {total_rounds}")

    # Intentar asignar round_num
    kills = asignar_ronda_por_tick(kills, rounds)

    if stats is None or len(stats) == 0:
        print("⚠️ No se encontraron estadísticas en la demo")
        return

    # Si no se especifica jugador, tomar el que más kills tiene
    if target_player is None:
        top = stats.sort("kills", descending=True).head(1)
        target_player = top["name"][0]

    print(f"\n🎯 Jugador analizado: {target_player}\n")

    player_stats = stats.filter(pl.col("name") == target_player)
    if len(player_stats) == 0:
        print(f"❌ No se encontró al jugador '{target_player}' en la demo")
        print(f"   Jugadores disponibles: {stats['name'].to_list()}")
        return

    # ✅ Fila como diccionario
    ps = player_stats.row(0, named=True)

    # ── Opening duels (solo si tenemos round_num)
    opening_pct = 0.0
    if "round_num" in kills.columns:
        opening_duels = []
        for r in rounds["round_num"].to_list():
            round_kills = kills.filter(pl.col("round_num") == r).sort("tick")
            if len(round_kills) > 0:
                first = round_kills[0]
                opening_duels.append(first["attacker_name"][0] == target_player)
        opening_total = len(opening_duels)
        opening_won = sum(1 for won in opening_duels if won)
        opening_pct = (opening_won / opening_total * 100) if opening_total > 0 else 0.0
    else:
        print("⚠️ No se pudo calcular opening duels (sin round_num).")

    # ── Utility damage
    if damages is not None and len(damages) > 0:
        util_weapons = ["hegrenade", "inferno", "molotov", "incgrenade"]
        util_dmg = damages.filter(
            (pl.col("attacker_name") == target_player) &
            (pl.col("weapon").is_in(util_weapons))
        )["dmg_health"].sum()
        util_per_round = util_dmg / total_rounds if total_rounds > 0 else 0.0
    else:
        util_per_round = 0.0

    # ── Trade efficiency
    player_deaths = kills.filter(pl.col("victim_name") == target_player)
    total_deaths = len(player_deaths)

    if "victim_traded" in kills.columns:
        # Método directo: victim_traded indica si la muerte fue vengada
        traded_deaths = player_deaths.filter(pl.col("victim_traded") == True)
        trade_pct = (len(traded_deaths) / total_deaths * 100) if total_deaths > 0 else 0.0
        print("✅ Trade efficiency calculado con 'victim_traded'.")
    elif "round_num" in kills.columns:
        # Método antiguo (por rondas)
        trade_kills = 0
        for death in player_deaths.iter_rows(named=True):
            death_round = death["round_num"]
            death_tick = death["tick"]
            death_side = death["victim_side"]
            death_killer = death["attacker_name"]
            teammates_trade = kills.filter(
                (pl.col("round_num") == death_round) &
                (pl.col("tick") > death_tick) &
                (pl.col("tick") < death_tick + 320) &
                (pl.col("attacker_side") == death_side) &
                (pl.col("victim_name") == death_killer)
            )
            if len(teammates_trade) > 0:
                trade_kills += 1
        trade_pct = (trade_kills / total_deaths * 100) if total_deaths > 0 else 0.0
    else:
        trade_pct = 0.0
        print("⚠️ No se pudo calcular trade efficiency.")

    # ── Resultado final
    resultado = {
        "jugador": target_player,
        "mapa": mapa,
        "rondas": total_rounds,
        "kills": ps["kills"],
        "deaths": ps["deaths"],
        "adr": round(float(ps["adr"]), 1),
        "kast": round(float(ps["kast"]), 1),
        "opening_duels_won_pct": round(opening_pct, 1),
        "trade_efficiency_pct": round(trade_pct, 1),
        "utility_dmg_per_round": round(util_per_round, 1),
    }

    print("═" * 50)
    print("📊 ANÁLISIS")
    print("═" * 50)
    for k, v in resultado.items():
        print(f"  {k:30s} {v}")
    print("═" * 50)

    return resultado


def get_players(ruta_demo: str) -> list[dict]:
    """
    Devuelve la lista de jugadores de la demo con stats básicas.
    No genera plan ni guarda nada — solo lee la tabla stats.
    """
    demo = Demo(Path(ruta_demo))
    demo.load("stats")
    
    stats = demo.stats
    if stats is None or len(stats) == 0:
        return []
    
    players = []
    for row in stats.iter_rows(named=True):
        players.append({
            "name": row.get("name", "—"),
            "kills": int(row.get("kills", 0) or 0),
            "deaths": int(row.get("deaths", 0) or 0),
            "assists": int(row.get("assists", 0) or 0),
            "adr": round(float(row.get("adr", 0) or 0), 1),
            "kast": round(float(row.get("kast", 0) or 0), 1),
        })
    
    players.sort(key=lambda p: p["kills"], reverse=True)
    return players

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python analyze.py ruta/a/tu_demo.dem [nombre_jugador]")
        sys.exit(1)

    ruta = sys.argv[1]
    jugador = sys.argv[2] if len(sys.argv) > 2 else None

    analizar_demo(ruta, jugador)