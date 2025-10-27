import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

interface ThreeCanvasProps {
  modelPath: string
  cameraZ?: number
  autoRotate?: boolean
  playAnimation?: boolean
  lighting?: 'basic' | 'studio'
  initialRotationY?: number
}

const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  modelPath,
  cameraZ = 5,
  autoRotate = false,
  playAnimation = false,
  lighting = 'basic',
  initialRotationY = 0
}) => {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mountRef.current) return

    const scene = new THREE.Scene()
    const clock = new THREE.Clock()
    let mixer: THREE.AnimationMixer | null = null
    let model: THREE.Group | null = null

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.z = cameraZ

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    mountRef.current.appendChild(renderer.domElement)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableZoom = false
    controls.enablePan = false
    controls.autoRotate = autoRotate

    // Lighting
    if (lighting === 'basic') {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
      scene.add(ambientLight)
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
      directionalLight.position.set(5, 5, 5)
      scene.add(directionalLight)
    } else if (lighting === 'studio') {
      const ambientLight = new THREE.AmbientLight(0xffffff, 10)
      scene.add(ambientLight)

      const spotLight = new THREE.SpotLight(0xffffff, 1000, 200, Math.PI / 4, 0.5)
      spotLight.position.set(0, 50, 50)
      scene.add(spotLight)

      const blueLight = new THREE.PointLight(0x0000ff, 5000, 200)
      blueLight.position.set(-50, 25, 50)
      scene.add(blueLight)

      const redLight = new THREE.PointLight(0xff0000, 5000, 200)
      redLight.position.set(50, 25, 50)
      scene.add(redLight)

      const frontSpotLight = new THREE.SpotLight(0xffffff, 10000, 200, Math.PI / 3, 0.5)
      frontSpotLight.position.set(0, 0, 50)
      scene.add(frontSpotLight)
    }

    // GLTF Loader
    const loader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    loader.setDRACOLoader(dracoLoader)
    loader.load(
      modelPath,
      (gltf) => {
        model = gltf.scene
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        model.position.sub(center)
        model.rotation.y = initialRotationY
        scene.add(model)

        if (playAnimation && gltf.animations && gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model)
          const action = mixer.clipAction(gltf.animations[0])
          action.play()
        }
      },
      undefined,
      (error) => {
        console.error(`An error happened while loading ${modelPath}:`, error)
      }
    )

    // Handle resize
    const handleResize = () => {
      if (mountRef.current) {
        const { clientWidth, clientHeight } = mountRef.current
        renderer.setSize(clientWidth, clientHeight)
        camera.aspect = clientWidth / clientHeight
        camera.updateProjectionMatrix()
      }
    }
    window.addEventListener('resize', handleResize)

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      const delta = clock.getDelta()
      if (mixer) {
        mixer.update(delta)
      }
      if (model) {
        model.rotation.y += Math.sin(clock.getElapsedTime()) * 0.001
        model.rotation.x += Math.cos(clock.getElapsedTime()) * 0.001
      }
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [modelPath, cameraZ, autoRotate, playAnimation, lighting])

  return <div ref={mountRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
}

export default ThreeCanvas
