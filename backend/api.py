"""
ClutchLab API — Recibe demos de CS2 y devuelve análisis en JSON.
Correr con: uvicorn api:app --host 0.0.0.0 --port 8000
"""
import hashlib
import json
import tempfile
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from analyze import analizar_demo, get_players
from auth import get_current_user
from auth_routes import router as auth_router
from coach import generar_plan
from database import Base, engine, get_db
from models import Analysis, User

# Import opcional de la función optimizada (si existe en analyze.py)
try:
    from analyze import analizar_demo_desde_objeto
    _HAS_FAST_ANALYZE = True
except ImportError:
    _HAS_FAST_ANALYZE = False
    analizar_demo_desde_objeto = None


Base.metadata.create_all(bind=engine)

app = FastAPI(title="ClutchLab API", version="0.7.0")


# ═══════════════════════════════════════════════════════════════
# CORS — debe ir ANTES de los routers
# ═══════════════════════════════════════════════════════════════
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://clutchlabgg.vercel.app",
        "https://clutchlabgg-git-main-joaflores03.vercel.app",
        "https://clutchlabgg-joaflores03.vercel.app",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

app.include_router(auth_router)


# ═══════════════════════════════════════════════════════════════
# CACHE DE DEMOS (para reusar entre jugadores sin re-parsear)
# ═══════════════════════════════════════════════════════════════
DEMO_CACHE: dict[str, dict] = {}
CACHE_TTL_MINUTES = 15
VALID_DURATIONS = {15, 30, 45}


def _cleanup_paths(tmp_path: Path, tmp_dir: Path) -> None:
    """Borra archivo y directorio temporal de forma segura."""
    try:
        tmp_path.unlink(missing_ok=True)
        tmp_dir.rmdir()
    except Exception:
        pass


def _cleanup_session(session_id: str) -> None:
    """Limpia archivos y objeto Demo de una sesión específica."""
    data = DEMO_CACHE.pop(session_id, None)
    if not data:
        return
    try:
        Path(data["path"]).unlink(missing_ok=True)
        Path(data["tmp_dir"]).rmdir()
    except Exception:
        pass


def cleanup_cache() -> None:
    """Borra sesiones expiradas del cache."""
    now = datetime.utcnow()
    expired = [
        sid for sid, data in DEMO_CACHE.items()
        if now - data["created_at"] > timedelta(minutes=CACHE_TTL_MINUTES)
    ]
    for sid in expired:
        _cleanup_session(sid)


# ═══════════════════════════════════════════════════════════════
# ROOT + HEALTH
# ═══════════════════════════════════════════════════════════════
@app.get("/")
def root():
    return {
        "app": "ClutchLab API",
        "version": "0.7.0",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════
# SUBIR DEMO (parsea jugadores, cachea el Demo para reusar)
# ═══════════════════════════════════════════════════════════════
@app.post("/demo/upload")
async def upload_demo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename.endswith(".dem"):
        raise HTTPException(400, "El archivo debe ser .dem")

    content = await file.read()
    demo_hash = hashlib.sha256(content).hexdigest()

    # ¿Qué jugadores ya fueron analizados para esta demo?
    existing = (
        db.query(Analysis.player_name)
        .filter(
            Analysis.user_id == current_user.id,
            Analysis.demo_hash == demo_hash,
        )
        .all()
    )
    analyzed_players = [row[0] for row in existing if row[0]]

    cleanup_cache()
    session_id = str(uuid.uuid4())
    tmp_dir = Path(tempfile.mkdtemp())
    tmp_path = tmp_dir / file.filename

    with tmp_path.open("wb") as buffer:
        buffer.write(content)

    # Parsear la demo UNA SOLA VEZ y cachear el objeto para /analyze
    demo_obj = None
    try:
        from awpy import Demo
        import polars as pl

        demo_obj = Demo(tmp_path)
        demo_obj.load("stats")

        stats = demo_obj.stats
        if stats is None or len(stats) == 0:
            raise ValueError("La demo no contiene estadísticas de jugadores")

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

    except Exception as e:
        _cleanup_paths(tmp_path, tmp_dir)
        raise HTTPException(500, f"Error parseando la demo: {str(e)}")

    if not players:
        _cleanup_paths(tmp_path, tmp_dir)
        raise HTTPException(422, "No se encontraron jugadores en la demo")

    all_names = {p["name"] for p in players}
    all_analyzed = all_names.issubset(set(analyzed_players))

    DEMO_CACHE[session_id] = {
        "path": str(tmp_path),
        "tmp_dir": str(tmp_dir),
        "hash": demo_hash,
        "filename": file.filename,
        "created_at": datetime.utcnow(),
        "demo_obj": demo_obj,  # cachear para reusar en /analyze
    }

    print(
        f"📥 Demo: {file.filename} → {len(players)} jugadores, "
        f"{len(analyzed_players)} ya analizados, session {session_id[:8]}"
    )

    return {
        "session_id": session_id,
        "players": players,
        "analyzed_players": analyzed_players,
        "all_analyzed": all_analyzed,
    }


# ═══════════════════════════════════════════════════════════════
# ANALIZAR JUGADOR
# ═══════════════════════════════════════════════════════════════
@app.post("/analyze")
async def analyze(
    session_id: str = Form(...),
    player: str = Form(...),
    duration: int = Form(30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cached = DEMO_CACHE.get(session_id)
    if not cached:
        raise HTTPException(404, "Sesión expirada. Subí la demo de nuevo.")

    if duration not in VALID_DURATIONS:
        duration = 30

    # ¿Ya existe un análisis de este jugador para esta demo?
    existing = (
        db.query(Analysis)
        .filter(
            Analysis.user_id == current_user.id,
            Analysis.demo_hash == cached["hash"],
            Analysis.player_name == player,
        )
        .first()
    )

    if existing:
        print(f"♻️  Ya existe análisis de '{player}' para esta demo")
        resultado = json.loads(existing.raw_json) if existing.raw_json else {}
        if existing.plan_json:
            resultado["plan"] = json.loads(existing.plan_json)
        resultado["analysis_id"] = existing.id
        resultado["duplicate"] = True
        resultado["created_at"] = existing.created_at.isoformat()
        return resultado

    try:
        # Intentar reusar el Demo cacheado (evita re-parsear = 2x más rápido)
        resultado = None
        if _HAS_FAST_ANALYZE and cached.get("demo_obj") is not None:
            try:
                demo_obj = cached["demo_obj"]
                # Cargar solo las tablas que faltan (stats ya está cargada)
                demo_obj.load("kills", "damages", "rounds")
                resultado = analizar_demo_desde_objeto(demo_obj, player)
                print(f"⚡ Análisis rápido (reusando Demo cacheado)")
            except Exception as e:
                print(f"⚠️ Fallback a re-parseo por: {e}")
                resultado = None

        # Fallback: re-parsear desde el archivo
        if resultado is None:
            resultado = analizar_demo(cached["path"], player)

        if resultado is None:
            raise HTTPException(422, "No se pudo analizar la demo para ese jugador")

        print(f"🤖 Generando plan de {duration} min para {resultado['jugador']}...")
        plan = generar_plan(resultado, duration=duration)
        resultado["plan"] = plan
        resultado["plan_duration"] = duration

        analysis = Analysis(
            user_id=current_user.id,
            demo_hash=cached["hash"],
            demo_filename=cached["filename"],
            map_name=resultado["mapa"],
            player_name=resultado["jugador"],
            rounds=resultado["rondas"],
            kills=resultado["kills"],
            deaths=resultado["deaths"],
            adr=resultado["adr"],
            kast=resultado["kast"],
            opening_duels_won_pct=resultado["opening_duels_won_pct"],
            trade_efficiency_pct=resultado["trade_efficiency_pct"],
            utility_dmg_per_round=resultado["utility_dmg_per_round"],
            raw_json=json.dumps(resultado),
            plan_json=json.dumps(plan),
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        resultado["analysis_id"] = analysis.id
        resultado["created_at"] = analysis.created_at.isoformat()
        resultado["duplicate"] = False

        _cleanup_session(session_id)
        return resultado

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error analizando demo: {str(e)}")


# ═══════════════════════════════════════════════════════════════
# HISTORIAL
# ═══════════════════════════════════════════════════════════════
@app.get("/analyses")
def list_analyses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    analyses = (
        db.query(Analysis)
        .filter(Analysis.user_id == current_user.id)
        .order_by(Analysis.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "demo_filename": a.demo_filename,
            "map_name": a.map_name,
            "player_name": a.player_name,
            "rondas": a.rounds,
            "kills": a.kills,
            "deaths": a.deaths,
            "adr": a.adr,
            "kast": a.kast,
            "opening_duels_won_pct": a.opening_duels_won_pct,
            "trade_efficiency_pct": a.trade_efficiency_pct,
            "utility_dmg_per_round": a.utility_dmg_per_round,
            "plan": json.loads(a.plan_json) if a.plan_json else None,
            "created_at": a.created_at.isoformat(),
        }
        for a in analyses
    ]


# ═══════════════════════════════════════════════════════════════
# ELIMINAR
# ═══════════════════════════════════════════════════════════════
@app.delete("/analyses/{analysis_id}")
def delete_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    analysis = (
        db.query(Analysis)
        .filter(
            Analysis.id == analysis_id,
            Analysis.user_id == current_user.id,
        )
        .first()
    )
    if not analysis:
        raise HTTPException(404, "Análisis no encontrado")

    db.delete(analysis)
    db.commit()
    print(f"🗑️  Análisis {analysis_id} eliminado por {current_user.username}")
    return {"deleted": True, "analysis_id": analysis_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)