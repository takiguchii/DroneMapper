import os
import shutil
import uuid
import json
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import SQLModel, Field, Session, create_engine, select
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

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

# Servir arquivos estáticos do storage
app.mount("/api/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

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

# Helpers para extração de EXIF GPS
def get_decimal_from_dms(dms, ref):
    try:
        degrees = float(dms[0])
        minutes = float(dms[1])
        seconds = float(dms[2])
        decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
        if ref in ['S', 'W']:
            decimal = -decimal
        return decimal
    except Exception:
        return 0.0

def extract_gps_coords(image_path: str):
    try:
        with Image.open(image_path) as img:
            exif_data = img._getexif()
            if not exif_data:
                return None
                
            gps_info = {}
            for tag_id, value in exif_data.items():
                tag_name = TAGS.get(tag_id, tag_id)
                if tag_name == "GPSInfo":
                    for gps_tag_id in value:
                        gps_tag_name = GPSTAGS.get(gps_tag_id, gps_tag_id)
                        gps_info[gps_tag_name] = value[gps_tag_id]
                        
            if "GPSLatitude" in gps_info and "GPSLatitudeRef" in gps_info and \
               "GPSLongitude" in gps_info and "GPSLongitudeRef" in gps_info:
                
                lat = get_decimal_from_dms(gps_info["GPSLatitude"], gps_info["GPSLatitudeRef"])
                lon = get_decimal_from_dms(gps_info["GPSLongitude"], gps_info["GPSLongitudeRef"])
                return {"latitude": lat, "longitude": lon}
    except Exception:
        pass
    return None

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
    
    allowed_exts = {'jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi', 'mkv'}
    max_size = 200 * 1024 * 1024  # 200MB
    
    # 1. Validar todos os arquivos primeiro
    for file in files:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Nome de arquivo inválido")
        
        ext = file.filename.split('.')[-1].lower()
        if ext not in allowed_exts:
            raise HTTPException(
                status_code=400,
                detail=f"Extensão do arquivo {file.filename} não suportada. Apenas mídias (.JPG, .PNG, .MP4, .MOV, .AVI, .MKV) são permitidas."
            )
            
        # Obter e validar tamanho do arquivo
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0, 0)
        
        if file_size > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"O arquivo {file.filename} excede o limite máximo de 200MB."
            )
            
    uploads_dir = os.path.join(PROJECTS_DIR, project_id, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    # Carrega coordenadas existentes se houver
    coords_file = os.path.join(PROJECTS_DIR, project_id, "coordinates.json")
    coordinates_list = []
    if os.path.exists(coords_file):
        try:
            with open(coords_file, "r") as f_coords:
                coordinates_list = json.load(f_coords)
        except Exception:
            pass

    saved_count = 0
    for file in files:
        file_path = os.path.join(uploads_dir, file.filename)
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_count += 1
            
            # Extrair coordenadas GPS caso seja imagem
            ext = file.filename.split('.')[-1].lower()
            if ext in {'jpg', 'jpeg', 'png'}:
                coords = extract_gps_coords(file_path)
                if coords:
                    coordinates_list.append({
                        "filename": file.filename,
                        "latitude": coords["latitude"],
                        "longitude": coords["longitude"]
                    })
        except Exception:
            pass
            
    # Gravar coordenadas em coordinates.json
    if coordinates_list:
        try:
            with open(coords_file, "w") as f_coords:
                json.dump(coordinates_list, f_coords)
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
