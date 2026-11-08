"""
Modelos de SQLAlchemy: User y Analysis.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    analyses = relationship("Analysis", back_populates="owner")


class Analysis(Base):
    __tablename__ = "analyses"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Nuevo: hash de la demo para deduplicar
    demo_hash = Column(String(64), nullable=True, index=True)
    
    demo_filename = Column(String, nullable=False)
    map_name = Column(String)
    player_name = Column(String)
    rounds = Column(Integer)
    kills = Column(Integer)
    deaths = Column(Integer)
    adr = Column(Float)
    kast = Column(Float)
    opening_duels_won_pct = Column(Float)
    trade_efficiency_pct = Column(Float)
    utility_dmg_per_round = Column(Float)
    raw_json = Column(Text)
    
    # Nuevo: plan de IA persistido
    plan_json = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    owner = relationship("User", back_populates="analyses")