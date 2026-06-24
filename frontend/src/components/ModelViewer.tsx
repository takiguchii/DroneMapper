import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface ModelViewerProps {
  modelUrl: string
  onClose: () => void
  projectName: string
}

export const ModelViewer: React.FC<ModelViewerProps> = ({
  modelUrl,
  onClose,
  projectName,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRotate, setAutoRotate] = useState(true)

  // Controle de rotação externa
  const autoRotateRef = useRef(autoRotate)
  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  const resetCameraRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // 1. Criar Cena
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020617) // Slate-950

    // Adicionar Grid Helper sutil
    const gridHelper = new THREE.GridHelper(30, 30, 0x4f46e5, 0x1e293b)
    gridHelper.position.y = -2
    scene.add(gridHelper)

    // 2. Criar Câmera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 5, 10)

    // 3. Criar Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)

    // 4. Luzes
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight1.position.set(10, 20, 15)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 0.4) // Luz roxa sutil para profundidade
    dirLight2.position.set(-10, -10, -10)
    scene.add(dirLight2)

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI / 2 + 0.1 // Não afundar totalmente abaixo do grid
    controls.minDistance = 1
    controls.maxDistance = 100

    // Referência para resetar câmera
    let loadedObject: THREE.Group | null = null
    const resetCamera = () => {
      if (loadedObject) {
        const box = new THREE.Box3().setFromObject(loadedObject)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())

        // Ajusta foco dos controles
        controls.target.copy(center)

        // Posiciona a câmera em uma distância ideal baseada no tamanho
        const maxDim = Math.max(size.x, size.y, size.z)
        const fov = camera.fov * (Math.PI / 180)
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
        cameraZ *= 1.8 // Adiciona margem de folga

        camera.position.set(center.x, center.y + maxDim * 0.5, center.z + cameraZ)
        camera.lookAt(center)
        controls.update()
      }
    };
    resetCameraRef.current = resetCamera

    // 6. Carregar Modelo OBJ
    const loader = new OBJLoader()
    setIsLoading(true)
    setError(null)

    loader.load(
      modelUrl,
      (obj) => {
        loadedObject = obj

        // Ajustar materiais padrão caso não haja MTL associado
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = new THREE.MeshStandardMaterial({
              color: 0xa5b4fc, // Indigo-300
              roughness: 0.4,
              metalness: 0.1,
              flatShading: true,
              side: THREE.DoubleSide
            })
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        // Centralizar o objeto na cena
        const box = new THREE.Box3().setFromObject(obj)
        const center = box.getCenter(new THREE.Vector3())
        obj.position.sub(center) // Move o centro do modelo para (0,0,0)
        
        // Reposicionar o grid ligeiramente abaixo do menor ponto do modelo
        const newBox = new THREE.Box3().setFromObject(obj)
        gridHelper.position.y = newBox.min.y - 0.1

        scene.add(obj)
        setIsLoading(false)
        
        // Focar a câmera
        resetCamera()
      },
      (xhr) => {
        if (xhr.total > 0) {
          setLoadingProgress((xhr.loaded / xhr.total) * 100)
        } else {
          // Fallback se lengthComputable for falso
          setLoadingProgress((prev) => Math.min(prev + 5, 95))
        }
      },
      (err) => {
        console.error('Erro ao carregar modelo 3D:', err)
        setError('Não foi possível renderizar o arquivo 3D. Certifique-se de que o arquivo model.obj é válido.')
        setIsLoading(false)
      }
    )

    // 7. Loop de Animação
    let reqId: number
    const animate = () => {
      reqId = requestAnimationFrame(animate)

      // Rotação automática sutil
      if (loadedObject && autoRotateRef.current) {
        loadedObject.rotation.y += 0.003
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // 8. Redimensionamento do Canvas
    const handleResize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    // Limpeza ao desmontar
    return () => {
      cancelAnimationFrame(reqId)
      window.removeEventListener('resize', handleResize)
      container.removeChild(renderer.domElement)
      
      // Dispose de geometrias e materiais para prevenir memory leak
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose())
          } else {
            object.material.dispose()
          }
        }
      })
      gridHelper.geometry.dispose()
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((mat) => mat.dispose())
      } else {
        gridHelper.material.dispose()
      }
      renderer.dispose()
    }
  }, [modelUrl])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-5xl h-[80vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header do Visualizador */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Visualizador 3D Interativo
            </div>
            <h3 className="text-sm font-bold text-white truncate max-w-md">{projectName}</h3>
          </div>

          <div className="flex items-center gap-3">
            {/* Botões de Controle */}
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${
                autoRotate
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              🔄 Rotação Auto: {autoRotate ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => resetCameraRef.current?.()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950/60 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 cursor-pointer transition-colors"
            >
              🎯 Resetar Câmera
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-all"
              title="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Área Principal de Render */}
        <div className="relative flex-grow min-h-0 w-full" ref={containerRef}>
          
          {/* Overlay de Carregamento */}
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4 z-10">
              <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <div className="space-y-1 text-center">
                <p className="text-sm font-semibold text-slate-200">Carregando malha tridimensional...</p>
                <p className="text-xs text-slate-500 font-mono">{Math.round(loadingProgress)}%</p>
              </div>
            </div>
          )}

          {/* Estado de Erro */}
          {error && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center z-10">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="space-y-1 max-w-md">
                <p className="text-sm font-semibold text-slate-200">Falha ao carregar modelo</p>
                <p className="text-xs text-slate-400">{error}</p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer transition-colors"
              >
                Voltar ao Painel
              </button>
            </div>
          )}

          {/* Dicas de Navegação (Flutuando no canto inferior esquerdo) */}
          {!isLoading && !error && (
            <div className="absolute bottom-4 left-4 p-3 bg-slate-950/70 border border-slate-800/50 backdrop-blur-md rounded-xl text-[10px] text-slate-400 pointer-events-none space-y-1 max-w-xs font-sans">
              <div className="font-semibold text-slate-200 mb-0.5">Navegação 3D:</div>
              <div className="flex gap-1.5">🖱️ <span className="font-medium text-slate-300">Botão Esquerdo:</span> Rotacionar</div>
              <div className="flex gap-1.5">🖐️ <span className="font-medium text-slate-300">Botão Direito:</span> Mover Câmera (Pan)</div>
              <div className="flex gap-1.5">🔍 <span className="font-medium text-slate-300">Scrolar:</span> Zoom In/Out</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
