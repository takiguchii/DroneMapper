import os
from sqlmodel import Session, SQLModel
from main import Project
from test_projects import test_engine
import worker

# Aponta o motor do worker para o banco de testes em memória
worker.engine = test_engine

def test_worker_process_project():
    # Inicializa o banco de testes e insere projeto na fila
    with Session(test_engine) as session:
        SQLModel.metadata.create_all(test_engine)
        
        project = Project(
            id="proj-test-worker",
            name="Projeto Teste Worker",
            quality="low",
            mode="mesh",
            status="queued",
            createdAt="2026-06-24 10:00:00",
            progress=0,
            filesCount=3
        )
        session.add(project)
        session.commit()

    # Executa a função de processamento de forma síncrona para testar
    worker.process_project("proj-test-worker")

    # Verifica se o projeto transitou para 'completed' com progresso 100%
    with Session(test_engine) as session:
        db_project = session.get(Project, "proj-test-worker")
        assert db_project is not None
        assert db_project.status == "completed"
        assert db_project.progress == 100
