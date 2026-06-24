import os
import time
from sqlmodel import Session, create_engine, select
from main import Project

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://dronemapper:dronemapper_password@db:5432/dronemapper")
engine = create_engine(DATABASE_URL)

def process_project(project_id: str):
    print(f"[*] Iniciando processamento do projeto: {project_id}")
    try:
        with Session(engine) as session:
            project = session.get(Project, project_id)
            if not project:
                print(f"[!] Projeto {project_id} não encontrado no banco.")
                return
            
            project.status = "processing"
            project.progress = 0
            session.add(project)
            session.commit()

        # Simulação de progresso do processamento de fotogrametria (Etapa 6)
        # O processamento real será implementado nas Etapas 7 e 8
        for i in range(1, 11):
            time.sleep(1)  # Simula tempo de processamento
            progress = i * 10
            
            with Session(engine) as session:
                project = session.get(Project, project_id)
                if not project or project.status != "processing":
                    print(f"[!] Cancelando processamento de {project_id} (projeto deletado ou alterado).")
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
