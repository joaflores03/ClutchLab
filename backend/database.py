"""
Configuración de la base de datos: PostgreSQL (producción) o SQLite (desarrollo local).
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ── Leer DATABASE_URL del entorno, con fallback a SQLite para desarrollo local
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./clutchlab.db")

# ── SQLAlchemy necesita el prefijo correcto para el driver psycopg3.
# Neon inyecta "postgresql://" o "postgres://", pero SQLAlchemy espera "postgresql+psycopg://".
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# ── Argumentos de conexión condicionales
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # Verifica conexiones antes de usarlas (útil en entornos serverless)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency de FastAPI: provee una sesión de BD por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()