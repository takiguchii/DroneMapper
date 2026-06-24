import os
import shutil
import io
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from main import app, get_session, PROJECTS_DIR

# Configura banco de dados SQLite temporário para testes
TEST_DB_FILE = "test.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_FILE}"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})

def override_get_session():
    with Session(test_engine) as session:
        yield session

# Sobrescreve a dependência do FastAPI
app.dependency_overrides[get_session] = override_get_session

client = TestClient(app)

def setup_module(module):
    # Remove DB de teste antigo se existir por segurança
    if os.path.exists(TEST_DB_FILE):
        os.remove(TEST_DB_FILE)
    # Inicializa tabelas e diretório temporário
    SQLModel.metadata.create_all(test_engine)
    os.makedirs(PROJECTS_DIR, exist_ok=True)

def teardown_module(module):
    # Remove tabelas e arquivos temporários de teste
    SQLModel.metadata.drop_all(test_engine)
    if os.path.exists(PROJECTS_DIR):
        shutil.rmtree(PROJECTS_DIR)
    # Remove o arquivo físico do banco SQLite
    if os.path.exists(TEST_DB_FILE):
        os.remove(TEST_DB_FILE)

def test_project_lifecycle():
    # Cria o Projeto
    payload = {
        "name": "Mapeamento Canavial",
        "description": "Voo de drone sobre canavial de teste",
        "quality": "high",
        "mode": "ortho"
    }
    response = client.post("/api/projects", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Mapeamento Canavial"
    assert data["quality"] == "high"
    assert data["mode"] == "ortho"
    assert data["status"] == "queued"
    assert data["progress"] == 0
    assert data["filesCount"] == 0
    assert "id" in data
    
    project_id = data["id"]

    # Listar Projetos
    response = client.get("/api/projects")
    assert response.status_code == 200
    projects_list = response.json()
    assert len(projects_list) == 1
    assert projects_list[0]["id"] == project_id

    # Obter Detalhes do Projeto
    response = client.get(f"/api/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["id"] == project_id

    # Obter Detalhes de ID Inválido (404)
    response = client.get("/api/projects/proj-invalid-id")
    assert response.status_code == 404
    assert response.json()["detail"] == "Projeto não encontrado"

    # Upload de arquivos simulados
    file1 = ("image1.jpg", io.BytesIO(b"dummy image 1 content"), "image/jpeg")
    file2 = ("image2.png", io.BytesIO(b"dummy image 2 content"), "image/png")
    
    response = client.post(
        f"/api/projects/{project_id}/upload",
        files=[("files", file1), ("files", file2)]
    )
    assert response.status_code == 200
    upload_data = response.json()
    assert "2 arquivos salvos" in upload_data["message"]
    assert upload_data["filesCount"] == 2

    # Verificar física do upload
    uploads_path = os.path.join(PROJECTS_DIR, project_id, "uploads")
    assert os.path.exists(uploads_path)
    assert len(os.listdir(uploads_path)) == 2
    assert "image1.jpg" in os.listdir(uploads_path)

    # Excluir Projeto
    response = client.delete(f"/api/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["message"] == "Projeto excluído com sucesso"

    # Verificar exclusão física
    proj_path = os.path.join(PROJECTS_DIR, project_id)
    assert not os.path.exists(proj_path)

    # Verificar lista vazia
    response = client.get("/api/projects")
    assert response.status_code == 200
    assert len(response.json()) == 0
