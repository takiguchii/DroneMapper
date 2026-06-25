import os
import shutil
import uuid
import time
import glob
import subprocess
import zipfile
import httpx
from sqlmodel import Session, create_engine, select
from main import Project

# Configurações de Armazenamento
STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")
PROJECTS_DIR = os.path.join(STORAGE_DIR, "projects")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://dronemapper:dronemapper_password@db:5432/dronemapper")
engine = create_engine(DATABASE_URL)

ODM_URL = os.getenv("ODM_URL")  # Ex: http://node-odm:3000
USE_MOCK_MODEL = os.getenv("USE_MOCK_MODEL", "false").lower() == "true"

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
        
        output_pattern = os.path.join(uploads_dir, f"frame_{video_name}_%04d.jpg")
        cmd = [
            "ffmpeg",
            "-y",                   # Sobrescrever se já existir
            "-i", video_path,       # Entrada
            "-vf", "fps=1",         # Filtro: extrair 1 frame por segundo
            output_pattern          # Saída
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            shutil.move(video_path, dest_video_path)
            
            extracted_frames = glob.glob(os.path.join(uploads_dir, f"frame_{video_name}_*.jpg"))
            extracted_total += len(extracted_frames)
            print(f"[*] FFMPEG concluiu: extraídos {len(extracted_frames)} frames de {video_basename}")
        except subprocess.CalledProcessError as e:
            print(f"[!] Erro ao processar ffmpeg para {video_basename}. Retorno: {e.returncode}")
            print(f"[!] FFmpeg Stderr: {e.stderr}")
        except Exception as e:
            print(f"[!] Erro genérico ao processar ffmpeg para {video_basename}: {e}")
            
    return extracted_total

def run_odm_reconstruction(project_id: str, uploads_dir: str, mode: str, quality: str, progress_callback) -> bool:
    """Executa a reconstrução 3D via API do Node-ODM ou executa uma simulação estruturada"""
    outputs_dir = os.path.join(PROJECTS_DIR, project_id, "outputs")
    os.makedirs(outputs_dir, exist_ok=True)

    # 1. Coleta arquivos de fotos para processar
    image_extensions = ["*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"]
    image_files = []
    for ext in image_extensions:
        image_files.extend(glob.glob(os.path.join(uploads_dir, ext)))

    if not image_files:
        print(f"[!] Erro: Nenhuma imagem disponível para reconstrução em {uploads_dir}")
        return False

    # 2. Executa Integração Real se a URL do Node-ODM estiver disponível
    if ODM_URL and not USE_MOCK_MODEL:
        print(f"[*] Modo ODM Real ativado via Node-ODM API: {ODM_URL}")
        try:
            # Prepara payload com as imagens
            files_payload = []
            for file_path in image_files:
                files_payload.append(
                    ("images", (os.path.basename(file_path), open(file_path, "rb"), "image/jpeg"))
                )

            # Define parâmetros
            options = [
                {"name": "orthophoto", "value": "true" if mode in ["ortho", "both"] else "false"},
                {"name": "mesh", "value": "true" if mode in ["mesh", "both"] else "false"},
                {"name": "dsm", "value": "true"}
            ]

            # Parâmetros agressivos para otimização em hardwares fracos caso qualidade seja "low"
            if quality == "low":
                options.extend([
                    {"name": "resize-to", "value": "800"},         # Redimensiona fotos para 800px (acelera tudo drasticamente)
                    {"name": "feature-quality", "value": "lowest"}, # Extração rápida de features
                    {"name": "pc-quality", "value": "lowest"},      # Nuvem de pontos pouco densa
                    {"name": "mesh-size", "value": "50000"},        # Malha 3D mais simples
                    {"name": "mesh-octree-depth", "value": "8"},    # Profundidade menor na reconstrução 3D
                    {"name": "fast-orthophoto", "value": "true"}    # Otimiza o passo de ortofoto caso ativado
                ])

            # Inicia tarefa no Node-ODM
            with httpx.Client(timeout=None) as client:
                print("[*] Enviando mídias para o container do Node-ODM...")
                import json
                data = {"options": json.dumps(options)}
                response = client.post(f"{ODM_URL}/task/new", files=files_payload, data=data)

                if response.status_code != 200 or "error" in response.json():
                    print(f"[!] Falha ao submeter tarefa para o Node-ODM: {response.text}")
                    return False

                task_uuid = response.json().get("uuid")
                if not task_uuid:
                    print(f"[!] Falha: UUID não retornado. Resposta: {response.text}")
                    return False
                    
                print(f"[*] Tarefa criada no Node-ODM. UUID: {task_uuid}")

                # Monitora tarefa (Polling)
                while True:
                    time.sleep(5)
                    info_res = client.get(f"{ODM_URL}/task/{task_uuid}/info")
                    if info_res.status_code != 200:
                        print(f"[!] Erro ao recuperar progresso da tarefa: {info_res.text}")
                        continue

                    info = info_res.json()
                    status_code = info.get("status", {}).get("code")
                    progress = int(info.get("progress", 0))

                    print(f"[*] Progresso do Node-ODM: {progress}% (Status Code: {status_code})")
                    progress_callback(progress)

                    # Sucesso
                    if status_code == 2:
                        print("[*] Node-ODM concluiu com sucesso! Baixando resultados...")
                        zip_res = client.get(f"{ODM_URL}/task/{task_uuid}/download/all.zip")
                        if zip_res.status_code == 200:
                            zip_path = os.path.join(outputs_dir, "results.zip")
                            with open(zip_path, "wb") as f_zip:
                                f_zip.write(zip_res.content)

                            # Descompacta assets úteis do ZIP
                            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                                for info_file in zip_ref.infolist():
                                    filename = info_file.filename
                                    if "orthophoto.tif" in filename or "orthophoto.png" in filename:
                                        # Ortofoto
                                        out_name = "orthophoto.tif" if filename.endswith(".tif") else "orthophoto.png"
                                        with open(os.path.join(outputs_dir, out_name), "wb") as f_out:
                                            f_out.write(zip_ref.read(info_file))
                                    elif "odm_textured_model_geo.obj" in filename:
                                        # Modelo 3D OBJ
                                        with open(os.path.join(outputs_dir, "model.obj"), "wb") as f_out:
                                            f_out.write(zip_ref.read(info_file))
                                    elif "odm_textured_model_geo.mtl" in filename:
                                        # Material MTL
                                        with open(os.path.join(outputs_dir, "model.mtl"), "wb") as f_out:
                                            f_out.write(zip_ref.read(info_file))
                                    elif filename.endswith(".jpg") and "odm_textured_model" in filename:
                                        # Textura JPG
                                        with open(os.path.join(outputs_dir, os.path.basename(filename)), "wb") as f_out:
                                            f_out.write(zip_ref.read(info_file))

                            os.remove(zip_path)
                            print("[*] Resultados reais extraídos com sucesso!")
                            return True
                        else:
                            print(f"[!] Erro no download dos resultados do Node-ODM: {zip_res.text}")
                            return False

                    # Falha / Cancelado
                    elif status_code in [3, 4]:
                        print(f"[!] Processamento falhou no container Node-ODM. Status: {status_code}")
                        return False

        except Exception as e:
            print(f"[!] Erro ao se conectar com Node-ODM: {e}.")
            return False

    # 3. Modo Simulado / Fallback
    if not USE_MOCK_MODEL:
        print("[!] Reconstrução simulada desabilitada e modo real falhou/não configurado.")
        return False
        
    print("[*] Inicializando Modo Simulado do OpenDroneMap...")
    steps = [
        ("Estrutura do Movimento (SfM) - Estimando posições das câmeras...", 15),
        ("Multi-View Stereo (MVS) - Gerando nuvem densa de pontos...", 45),
        ("Meshing - Reconstruindo a malha 3D de polígonos...", 70),
        ("Texturização - Projetando fotografias na malha...", 85),
        ("Geração da Ortofoto (2D Geotagged) & DSM...", 95)
    ]

    for label, progress_val in steps:
        time.sleep(1.5)
        print(f"[*] ODM SIMULATOR: {label}")
        progress_callback(progress_val)

    # Cria arquivos mockados para visualização no frontend
    # 1. Ortofoto mock (PNG 1x1 vermelho sutil para indicar processamento)
    dummy_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    with open(os.path.join(outputs_dir, "orthophoto.png"), "wb") as f:
        f.write(dummy_png)

    # 2. Modelo 3D mock (Pirâmide OBJ válida)
    dummy_obj = (
        "# Wavefront OBJ file representing a 3D pyramid\n"
        "v 0.0 1.0 0.0\n"
        "v -1.0 -1.0 1.0\n"
        "v 1.0 -1.0 1.0\n"
        "v 1.0 -1.0 -1.0\n"
        "v -1.0 -1.0 -1.0\n"
        "f 1 2 3\n"
        "f 1 3 4\n"
        "f 1 4 5\n"
        "f 1 5 2\n"
        "f 2 5 4 3\n"
    )
    with open(os.path.join(outputs_dir, "model.obj"), "w") as f:
        f.write(dummy_obj)

    time.sleep(1)
    progress_callback(100)
    print("[*] Reconstrução simulada do OpenDroneMap concluída.")
    return True

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
            mode = project.mode
            quality = project.quality

        uploads_dir = os.path.join(PROJECTS_DIR, project_id, "uploads")
        
        # 1. Extrair quadros de vídeos (Etapa 7)
        extracted_count = extract_video_frames(project_id, uploads_dir)
        if extracted_count > 0:
            with Session(engine) as session:
                project = session.get(Project, project_id)
                if project:
                    total_files = len([f for f in os.listdir(uploads_dir) if os.path.isfile(os.path.join(uploads_dir, f))])
                    project.filesCount = total_files
                    session.add(project)
                    session.commit()
                    print(f"[*] Total de mídias atualizado no banco: {total_files} arquivos")

        # 2. Processamento de fotogrametria via OpenDroneMap (Etapa 8)
        def update_progress(val):
            with Session(engine) as session:
                project = session.get(Project, project_id)
                if project:
                    project.progress = val
                    session.add(project)
                    session.commit()

        success = run_odm_reconstruction(project_id, uploads_dir, mode, quality, update_progress)
        
        with Session(engine) as session:
            project = session.get(Project, project_id)
            if project:
                if success:
                    project.status = "completed"
                    project.progress = 100
                else:
                    project.status = "failed"
                session.add(project)
                session.commit()

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
