import os
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configurações de Armazenamento
STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")
PROJECTS_DIR = os.path.join(STORAGE_DIR, "projects")

@asynccontextmanager
async def lifespan(app: FastAPI):
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

# Banco de dados em memória temporário (substituído pelo Postgres na Etapa 5)
PROJECTS_DB: Dict[str, dict] = {}

# Pydantic Schemas
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    quality: str = "medium"  # low, medium, high
    mode: str = "both"       # mesh, ortho, both

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    quality: str
    mode: str
    status: str             # queued, processing, completed, failed
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
def create_project(project: ProjectCreate):
    project_id = f"proj-{uuid.uuid4().hex[:8]}"
    
    # Criar diretórios locais para o projeto
    proj_dir = os.path.join(PROJECTS_DIR, project_id)
    uploads_dir = os.path.join(proj_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    project_data = {
        "id": project_id,
        "name": project.name,
        "description": project.description,
        "quality": project.quality,
        "mode": project.mode,
        "status": "queued",
        "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "progress": 0,
        "filesCount": 0
    }

    PROJECTS_DB[project_id] = project_data
    return ProjectResponse(**project_data)

@app.get("/api/projects", response_model=List[ProjectResponse])
def list_projects():
    return [ProjectResponse(**p) for p in PROJECTS_DB.values()]

@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str):
    if project_id not in PROJECTS_DB:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return ProjectResponse(**PROJECTS_DB[project_id])

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    if project_id not in PROJECTS_DB:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    
    # Excluir arquivos físicos
    proj_dir = os.path.join(PROJECTS_DIR, project_id)
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir)
        
    del PROJECTS_DB[project_id]
    return {"message": "Projeto excluído com sucesso", "id": project_id}

@app.post("/api/projects/{project_id}/upload", status_code=200)
def upload_files(project_id: str, files: List[UploadFile] = File(...)):
    if project_id not in PROJECTS_DB:
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
        except Exception as e:
            # Em produção registraríamos em logs apropriadamente
            pass
            
    PROJECTS_DB[project_id]["filesCount"] += saved_count
    return {
        "message": f"Upload realizado com sucesso: {saved_count} arquivos salvos",
        "filesCount": PROJECTS_DB[project_id]["filesCount"]
    }
