from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="DroneMapper API",
    description="API para Plataforma Self-Hosted de Reconstrução 3D por Fotogrametria",
    version="0.1.0",
)

# Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Bem-vindo ao DroneMapper API!"}

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "backend"}
