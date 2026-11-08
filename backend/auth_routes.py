"""
Endpoints de registro, login y perfil.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import (
    hash_password, verify_password, create_access_token, get_current_user
)
from database import get_db
from models import User
from schemas import UserRegister, UserLogin, UserOut, TokenOut


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: UserRegister, db: Session = Depends(get_db)):
    # ¿Ya existe el email o username?
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Ya existe una cuenta con ese email")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Ese username ya está en uso")
    
    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    token = create_access_token({"sub": str(user.id)})
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Email o contraseña incorrectos")
    
    token = create_access_token({"sub": str(user.id)})
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)