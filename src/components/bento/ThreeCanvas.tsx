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
    // Capture the mount node up front. React 19 strict mode runs effects
    // twice in dev, and `mountRef.current` may have been swapped out by the
    // time the cleanup function fires.
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const clock = new THREE.Clock()
    let mixer: THREE.AnimationMixer | null = null
    let model: THREE.Group | null = null
    let rafId = 0
    let isDisposed = false

    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    )
    camera.position.z = cameraZ

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableZoom = false
    controls.enablePan = false
    controls.autoRotate = autoRotate

    if (lighting === 'basic') {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
      scene.add(ambientLight)
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
      directionalLight.position.set(5, 5, 5)
      scene.add(directionalLight)
    } else if (lighting === 'studio') {
      const spotLight = new THREE.SpotLight(0xffffff, 1000, 20, Math.PI / 4, 0.5)
      spotLight.position.set(0, 50, 50)
      scene.add(spotLight)

      const frontSpotLight = new THREE.SpotLight(0xffffff, 10000, 20, Math.PI / 4, 0.5)
      frontSpotLight.position.set(0, 0, 50)
      scene.add(frontSpotLight)
    }

    const loader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    loader.setDRACOLoader(dracoLoader)
    loader.load(
      modelPath,
      (gltf) => {
        // The component may have unmounted while the model was loading. If so,
        // dispose what we just built so we don't leak GPU memory.
        if (isDisposed) {
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry?.dispose()
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose())
              } else {
                child.material?.dispose()
              }
            }
          })
          return
        }

        model = gltf.scene
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = false
            child.receiveShadow = false
          }
        })
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

    const handleResize = () => {
      if (isDisposed) return
      const { clientWidth, clientHeight } = mount
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', handleResize)

    const animate = () => {
      if (isDisposed) return
      rafId = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      if (mixer) mixer.update(delta)
      if (model) {
        model.rotation.y += Math.sin(clock.getElapsedTime()) * 0.001
        model.rotation.x += Math.cos(clock.getElapsedTime()) * 0.001
      }
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      isDisposed = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)

      // Dispose every loaded GPU resource so navigating away/back doesn't
      // leak WebGL contexts (browsers cap us at ~16).
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material?.dispose()
          }
        }
      })

      controls.dispose()
      dracoLoader.dispose()
      renderer.dispose()
      renderer.forceContextLoss?.()

      // Null-guard: removeChild throws if the node isn't a child anymore,
      // which can happen in React 19 strict-mode double-invocation.
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [modelPath, cameraZ, autoRotate, playAnimation, lighting, initialRotationY])

  return <div ref={mountRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
}

export default ThreeCanvas
