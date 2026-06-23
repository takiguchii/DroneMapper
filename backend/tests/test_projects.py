import os
import shutil
import io
from fastapi.testclient import TestClient
from main import app, PROJECTS_DB, PROJECTS_DIR

client = TestClient(app)

def setup_module(module):
    # Garante que os diretórios temporários estejam prontos e limpos para testes
    os.makedirs(PROJECTS_DIR, exist_ok=True)

def teardown_module(module):
    # Limpa a pasta de projetos temporária dos testes
    if os.path.exists(PROJECTS_DIR):
        shutil.rmtree(PROJECTS_DIR)

def test_project_lifecycle():
    # 1. Limpar DB em memória antes do teste
    PROJECTS_DB.clear()

    # 2. Criar Projeto
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

    # 3. Listar Projetos
    response = client.get("/api/projects")
    assert response.status_code == 200
    projects_list = response.json()
    assert len(projects_list) == 1
    assert projects_list[0]["id"] == project_id

    # 4. Obter Detalhes do Projeto
    response = client.get(f"/api/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["id"] == project_id

    # 5. Obter Detalhes do Projeto Inválido (404)
    response = client.get("/api/projects/proj-invalid-id")
    assert response.status_code == 404
    assert response.json()["detail"] == "Projeto não encontrado"

    # 6. Upload de arquivos simulados
    # Simula o envio de 2 imagens
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

    # Verificar se os arquivos foram salvos no disco
    uploads_path = os.path.join(PROJECTS_DIR, project_id, "uploads")
    assert os.path.exists(uploads_path)
    assert len(os.listdir(uploads_path)) == 2
    assert "image1.jpg" in os.listdir(uploads_path)

    # 7. Excluir Projeto
    response = client.delete(f"/api/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["message"] == "Projeto excluído com sucesso"

    # Verificar exclusão física
    proj_path = os.path.join(PROJECTS_DIR, project_id)
    assert not os.path.exists(proj_path)

    # Verificar que lista está vazia
    response = client.get("/api/projects")
    assert response.status_code == 200
    assert len(response.json()) == 0
