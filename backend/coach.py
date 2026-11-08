"""
ClutchLab Coach — Genera un plan de entrenamiento personalizado
usando Groq. Adaptado a la duración elegida por el usuario.
"""
import os
import json
import re
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent / ".env")

API_KEY = os.getenv("GROQ_API_KEY")
if not API_KEY:
    raise RuntimeError("Falta GROQ_API_KEY en .env")

client = OpenAI(api_key=API_KEY, base_url="https://api.groq.com/openai/v1")
MODELO = "openai/gpt-oss-120b"

# ── Rangos de referencia ──────────────────────────────────────
BENCHMARKS = {
    "adr":                   {"bajo": 60, "promedio": 75, "bueno": 90},
    "kast":                  {"bajo": 60, "promedio": 68, "bueno": 75},
    "opening_duels_won_pct": {"bajo": 35, "promedio": 45, "bueno": 55},
    "trade_efficiency_pct":  {"bajo": 45, "promedio": 55, "bueno": 65},
    "utility_dmg_per_round": {"bajo": 5,  "promedio": 8,  "bueno": 12},
}

# ── Mapas de Workshop permitidos (el LLM solo debe usar estos) ──
WORKSHOP_MAPS_LIST = """
Aim Botz (ID 3070244462), Fast Warmup (ID 3083320026), Recoil Master (ID 3100869952),
CSStats Training (ID 3070389038), Aim_Rush (ID 3105821815),
Yprac Hub (ID 3070715607 — sirve para prefire y utilidad de Ancient, Anubis, Cache, Dust2, Inferno, Mirage, Nuke y Overpass),
Mirage Prefire (ID 3267302800), Inferno Prefire (ID 3289507717), Dust2 Prefire (ID 3295650711),
Movement Hub (ID 3355497176), Bhop (ID 3118806244), Surf (ID 3073875025)
""".strip()


def evaluar_metrica(nombre: str, valor: float) -> str:
    b = BENCHMARKS.get(nombre)
    if not b:
        return "sin-referencia"
    if valor < b["bajo"]:
        return "bajo"
    if valor < b["bueno"]:
        return "promedio"
    return "bueno"


def detectar_debilidades(metricas: dict) -> list[dict]:
    candidatos = []
    for nombre, valor in metricas.items():
        if nombre in BENCHMARKS and isinstance(valor, (int, float)):
            b = BENCHMARKS[nombre]
            distancia = (b["promedio"] - valor) / b["promedio"]
            candidatos.append({
                "metrica": nombre,
                "valor": valor,
                "benchmark_promedio": b["promedio"],
                "estado": evaluar_metrica(nombre, valor),
                "distancia": distancia,
            })
    candidatos.sort(key=lambda x: x["distancia"], reverse=True)
    return candidatos[:3]


def _limpiar_json(texto: str) -> str:
    texto = re.sub(r'^```(?:json)?\s*', '', texto.strip())
    texto = re.sub(r'\s*```$', '', texto.strip())
    return texto.strip()


def generar_plan(resultado: dict, duration: int = 30) -> dict:
    debilidades = detectar_debilidades(resultado)
    max_drills = 3 if duration <= 30 else 4

    contexto = f"""
Jugador: {resultado['jugador']}
Mapa: {resultado['mapa']}
Rondas: {resultado['rondas']} | Kills: {resultado['kills']} | Deaths: {resultado['deaths']}

MÉTRICAS:
- ADR: {resultado['adr']} (promedio: 75)
- KAST: {resultado['kast']}% (promedio: 68%)
- Opening duels: {resultado['opening_duels_won_pct']}% (promedio: 45%)
- Trade efficiency: {resultado['trade_efficiency_pct']}% (promedio: 55%)
- Utility dmg/ronda: {resultado['utility_dmg_per_round']} (promedio: 8)

DEBILIDADES DETECTADAS:
1. {debilidades[0]['metrica']}: {debilidades[0]['valor']} ({debilidades[0]['estado']})
2. {debilidades[1]['metrica']}: {debilidades[1]['valor']} ({debilidades[1]['estado']})
3. {debilidades[2]['metrica']}: {debilidades[2]['valor']} ({debilidades[2]['estado']})
"""

    prompt_sistema = f"""Sos un coach de Counter-Strike 2 nivel profesional. Generá un plan de entrenamiento CONCRETO para los próximos {duration} minutos.

REGLAS ESTRICTAS:
- Respondé ÚNICAMENTE con un objeto JSON válido, sin texto extra, sin markdown.
- Usá lenguaje directo, motivador, rioplatense (vos, podés, entrená).
- La suma de minutos debe ser exactamente {duration}.
- Máximo {max_drills} drills.
- Para cada drill indicá: duración, mapa (nombre exacto de la lista de abajo), título e instrucción.
- El campo "mapa" debe ser uno de estos (usá el nombre tal cual): {WORKSHOP_MAPS_LIST}
- No menciones Refrag ni plataformas de pago.

Formato JSON:
{{
  "diagnostico": "1-2 oraciones sobre el estado del jugador",
  "debilidad_principal": "nombre legible de la métrica más débil",
  "drills": [
    {{"duracion": 10, "mapa": "Aim Botz", "titulo": "Microajustes", "instruccion": "Descripción concreta"}}
  ],
  "motivacion": "Frase de cierre"
}}"""

    try:
        response = client.chat.completions.create(
            model=MODELO,
            messages=[
                {"role": "system", "content": prompt_sistema},
                {"role": "user", "content": contexto},
            ],
            temperature=0.7,
            max_tokens=1000,
        )
        plan = json.loads(_limpiar_json(response.choices[0].message.content))

        # Ajustar suma de minutos exacta
        total = sum(d.get("duracion", 0) for d in plan.get("drills", []))
        if total != duration and plan.get("drills"):
            factor = duration / total if total > 0 else 1
            for d in plan["drills"]:
                d["duracion"] = round(d["duracion"] * factor)
            diff = duration - sum(d["duracion"] for d in plan["drills"])
            if diff != 0:
                plan["drills"][0]["duracion"] += diff

        plan["tokens_used"] = response.usage.total_tokens if response.usage else 0
        plan["debilidades_detectadas"] = debilidades
        return plan

    except Exception as e:
        print(f"❌ Error generando plan: {e}")
        half = duration // 2
        return {
            "diagnostico": f"Análisis de {resultado['jugador']} con áreas claras de mejora.",
            "debilidad_principal": debilidades[0]["metrica"] if debilidades else "aim",
            "drills": [
                {"duracion": half, "mapa": "Aim Botz", "titulo": "Flicks", "instruccion": "Flicks cortos entre bots."},
                {"duracion": duration - half, "mapa": "Yprac Hub", "titulo": "Prefire", "instruccion": f"Ángulos de {resultado['mapa']}."},
            ],
            "motivacion": "La repetición es la base del progreso.",
            "error": str(e),
        }