import os
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import SQLModel, Field, Session, create_engine, select

# Configurações de Armazenamento
STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")
PROJECTS_DIR = os.path.join(STORAGE_DIR, "projects")

# Configurações de Banco de Dados PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://dronemapper:dronemapper_password@db:5432/dronemapper")
engine = create_engine(DATABASE_URL)

def get_session():
    with Session(engine) as session:
        yield session

# Modelo de Tabela SQLModel
class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    description: Optional[str] = ""
    quality: str = "medium"      # low, medium, high
    mode: str = "both"           # mesh, ortho, both
    status: str = "queued"       # queued, processing, completed, failed
    createdAt: str
    progress: int = 0
    filesCount: int = 0

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Criar tabelas se não existirem
    SQLModel.metadata.create_all(engine)
    os.makedirs(PROJECTS_DIR, exist_ok=True)
    yield

app = FastAPI(
    title="DroneMapper API",
    description="API para Plataforma Self-Hosted de Reconstrução 3D por Fotogrametria",
    version="0.1.0",
    lifespan=lifespan,
)

# Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas para validação da API
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    quality: str = "medium"
    mode: str = "both"

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    quality: str
    mode: str
    status: str
    createdAt: str
    progress: int
    filesCount: int

# Endpoints
@app.get("/")
def read_root():
    return {"message": "Bem-vindo ao DroneMapper API!"}

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "backend"}

@app.post("/api/projects", response_model=ProjectResponse, status_code=201)
def create_project(project: ProjectCreate, db: Session = Depends(get_session)):
    project_id = f"proj-{uuid.uuid4().hex[:8]}"
    
    # Criar diretórios locais para o projeto
    proj_dir = os.path.join(PROJECTS_DIR, project_id)
    uploads_dir = os.path.join(proj_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    db_project = Project(
        id=project_id,
        name=project.name,
        description=project.description,
        quality=project.quality,
        mode=project.mode,
        status="queued",
        createdAt=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        progress=0,
        filesCount=0
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@app.get("/api/projects", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_session)):
    statement = select(Project).order_by(Project.createdAt.desc())
    results = db.exec(statement).all()
    return results

@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_session)):
    db_project = db.get(Project, project_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return db_project

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_session)):
    db_project = db.get(Project, project_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    
    # Excluir físico
    proj_dir = os.path.join(PROJECTS_DIR, project_id)
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir)
        
    db.delete(db_project)
    db.commit()
    return {"message": "Projeto excluído com sucesso", "id": project_id}

@app.post("/api/projects/{project_id}/upload", status_code=200)
def upload_files(project_id: str, files: List[UploadFile] = File(...), db: Session = Depends(get_session)):
    db_project = db.get(Project, project_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    
    uploads_dir = os.path.join(PROJECTS_DIR, project_id, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    saved_count = 0
    for file in files:
        if not file.filename:
            continue
        
        file_path = os.path.join(uploads_dir, file.filename)
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_count += 1
        except Exception:
            pass
            
    db_project.filesCount += saved_count
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    return {
        "message": f"Upload realizado com sucesso: {saved_count} arquivos salvos",
        "filesCount": db_project.filesCount
    }
