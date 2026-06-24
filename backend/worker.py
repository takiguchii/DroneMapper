import os
import shutil
import uuid
import time
import glob
import subprocess
from sqlmodel import Session, create_engine, select
from main import Project

# Configurações de Armazenamento
STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")
PROJECTS_DIR = os.path.join(STORAGE_DIR, "projects")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://dronemapper:dronemapper_password@db:5432/dronemapper")
engine = create_engine(DATABASE_URL)

def extract_video_frames(project_id: str, uploads_dir: str) -> int:
    """Procura por vídeos e extrai seus frames usando ffmpeg (1 frame por segundo)"""
    videos_dir = os.path.join(os.path.dirname(uploads_dir), "videos")
    
    # Procura vídeos com as extensões suportadas
    video_extensions = ["*.mp4", "*.mov", "*.avi", "*.mkv", "*.MP4", "*.MOV", "*.AVI", "*.MKV"]
    video_files = []
    for ext in video_extensions:
        video_files.extend(glob.glob(os.path.join(uploads_dir, ext)))
        
    if not video_files:
        return 0
        
    os.makedirs(videos_dir, exist_ok=True)
    extracted_total = 0
    
    for video_path in video_files:
        video_basename = os.path.basename(video_path)
        video_name = os.path.splitext(video_basename)[0]
        dest_video_path = os.path.join(videos_dir, video_basename)
        
        print(f"[*] Vídeo detectado: {video_basename}. Iniciando FFMPEG frame extraction...")
        
        # Padrão de saída: frame_nomevideo_0001.jpg, frame_nomevideo_0002.jpg, etc.
        output_pattern = os.path.join(uploads_dir, f"frame_{video_name}_%04d.jpg")
        cmd = [
            "ffmpeg",
            "-y",                   # Sobrescrever se já existir
            "-i", video_path,       # Entrada
            "-vf", "fps=1",         # Filtro: extrair 1 frame por segundo
            output_pattern          # Saída
        ]
        
        try:
            # Executa o comando do FFMPEG
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            # Move o vídeo original para a pasta de vídeos
            shutil.move(video_path, dest_video_path)
            
            # Conta frames extraídos
            extracted_frames = glob.glob(os.path.join(uploads_dir, f"frame_{video_name}_*.jpg"))
            extracted_total += len(extracted_frames)
            print(f"[*] FFMPEG concluiu: extraídos {len(extracted_frames)} frames de {video_basename}")
        except Exception as e:
            print(f"[!] Erro ao processar ffmpeg para {video_basename}: {e}")
            
    return extracted_total

def process_project(project_id: str):
    print(f"[*] Iniciando processamento do projeto: {project_id}")
    try:
        with Session(engine) as session:
            project = session.get(Project, project_id)
            if not project:
                print(f"[!] Projeto {project_id} não encontrado.")
                return
            
            project.status = "processing"
            project.progress = 0
            session.add(project)
            session.commit()

        uploads_dir = os.path.join(PROJECTS_DIR, project_id, "uploads")
        
        # 1. Extrair quadros de vídeos (Etapa 7)
        extracted_count = extract_video_frames(project_id, uploads_dir)
        if extracted_count > 0:
            with Session(engine) as session:
                project = session.get(Project, project_id)
                if project:
                    # Recalcula contagem de arquivos e atualiza banco de dados
                    total_files = len([f for f in os.listdir(uploads_dir) if os.path.isfile(os.path.join(uploads_dir, f))])
                    project.filesCount = total_files
                    session.add(project)
                    session.commit()
                    print(f"[*] Total de mídias atualizado no banco: {total_files} arquivos")

        # 2. Simulação de processamento de fotogrametria (Etapa 6)
        # O processamento real com ODM será implementado na Etapa 8
        for i in range(1, 11):
            time.sleep(1)
            progress = i * 10
            
            with Session(engine) as session:
                project = session.get(Project, project_id)
                if not project or project.status != "processing":
                    print(f"[!] Cancelando processamento de {project_id} (projeto deletado/alterado).")
                    return
                
                project.progress = progress
                if progress == 100:
                    project.status = "completed"
                    print(f"[*] Projeto {project_id} processado com sucesso!")
                
                session.add(project)
                session.commit()
                print(f"[*] Projeto {project_id} - Progresso: {progress}%")

    except Exception as e:
        print(f"[!] Erro ao processar projeto {project_id}: {e}")
        try:
            with Session(engine) as session:
                project = session.get(Project, project_id)
                if project:
                    project.status = "failed"
                    session.add(project)
                    session.commit()
        except Exception:
            pass

def worker_loop():
    print("[*] Worker iniciado. Aguardando novos projetos na fila...")
    while True:
        try:
            with Session(engine) as session:
                statement = select(Project).where(Project.status == "queued").order_by(Project.createdAt)
                project = session.exec(statement).first()
                if project:
                    project_id = project.id
                else:
                    project_id = None

            if project_id:
                process_project(project_id)
            else:
                time.sleep(2)
        except Exception as e:
            print(f"[!] Erro no loop principal do worker: {e}")
            time.sleep(5)

if __name__ == "__main__":
    worker_loop()
