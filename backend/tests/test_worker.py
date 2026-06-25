import os
import shutil
import subprocess
from unittest.mock import patch
from sqlmodel import Session, SQLModel
from main import Project, PROJECTS_DIR
from test_projects import test_engine
import worker

# Aponta o motor do worker para o banco de testes em memória
worker.engine = test_engine
# Força o fallback para o modo simulado nos testes isolados
worker.USE_MOCK_MODEL = True

def test_worker_process_project():
    project_id = "proj-test-worker"

    # Cria diretório de upload e imagem fake para a reconstrução simulada rodar
    uploads_dir = os.path.join(PROJECTS_DIR, project_id, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    with open(os.path.join(uploads_dir, "photo.jpg"), "w") as f:
        f.write("dummy data")

    # Inicializa o banco de testes e insere projeto na fila
    with Session(test_engine) as session:
        SQLModel.metadata.create_all(test_engine)
        
        project = Project(
            id=project_id,
            name="Projeto Teste Worker",
            quality="low",
            mode="mesh",
            status="queued",
            createdAt="2026-06-24 10:00:00",
            progress=0,
            filesCount=1
        )
        session.add(project)
        session.commit()

    # Executa a função de processamento de forma síncrona para testar
    worker.process_project(project_id)

    # Verifica se o projeto transitou para 'completed' com progresso 100%
    with Session(test_engine) as session:
        db_project = session.get(Project, project_id)
        assert db_project is not None
        assert db_project.status == "completed"
        assert db_project.progress == 100

    # Limpa arquivos criados
    proj_dir = os.path.join(PROJECTS_DIR, project_id)
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir)

def test_worker_video_frame_extraction():
    project_id = "proj-video-test"
    
    # 1. Configurar diretório e arquivo de vídeo falso
    uploads_dir = os.path.join(PROJECTS_DIR, project_id, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    video_file_path = os.path.join(uploads_dir, "test_flight.mp4")
    
    with open(video_file_path, "w") as f:
        f.write("mock mp4 binary data")

    # 2. Inserir no banco de testes
    with Session(test_engine) as session:
        SQLModel.metadata.create_all(test_engine)
        project = Project(
            id=project_id,
            name="Mapeamento com Video",
            quality="low",
            mode="ortho",
            status="queued",
            createdAt="2026-06-24 10:30:00",
            progress=0,
            filesCount=1
        )
        session.add(project)
        session.commit()

    # Mock de subprocess.run do FFMPEG
    def mock_ffmpeg_run(cmd, *args, **kwargs):
        output_pattern = cmd[-1]
        dir_name = os.path.dirname(output_pattern)
        base_name = "frame_test_flight"
        # Cria 3 imagens fake
        for i in range(1, 4):
            img_path = os.path.join(dir_name, f"{base_name}_{i:04d}.jpg")
            with open(img_path, "w") as img_file:
                img_file.write("fake jpeg data")
        return subprocess.CompletedProcess(cmd, returncode=0)

    # 3. Executar o worker coberto pelo mock de subprocess.run
    with patch("subprocess.run", side_effect=mock_ffmpeg_run) as mock_run:
        worker.process_project(project_id)
        assert mock_run.called

    # 4. Validar resultados
    # O vídeo original deve ter sido movido para a pasta 'videos'
    videos_dir = os.path.join(PROJECTS_DIR, project_id, "videos")
    assert os.path.exists(os.path.join(videos_dir, "test_flight.mp4"))
    assert not os.path.exists(video_file_path)

    # Os frames devem ter sido extraídos na pasta uploads
    assert os.path.exists(os.path.join(uploads_dir, "frame_test_flight_0001.jpg"))
    assert os.path.exists(os.path.join(uploads_dir, "frame_test_flight_0002.jpg"))
    assert os.path.exists(os.path.join(uploads_dir, "frame_test_flight_0003.jpg"))
    
    # O banco de dados deve refletir a nova contagem de arquivos e status completo
    with Session(test_engine) as session:
        db_project = session.get(Project, project_id)
        assert db_project is not None
        assert db_project.status == "completed"
        # A contagem deve ser de 3 frames (já que o vídeo original foi movido)
        assert db_project.filesCount == 3

    # Limpar arquivos criados
    proj_dir = os.path.join(PROJECTS_DIR, project_id)
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir)
