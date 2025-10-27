import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'

export default function CubeCanvas() {
  return (
    <Canvas style={{ background: 'transparent' }} gl={{ alpha: true, antialias: true }}>
      <Suspense fallback={null}>
        <ambientLight intensity={1} />
        <spotLight position={[0, 50, 50]} angle={Math.PI / 3} penumbra={1} intensity={100} castShadow />
        <pointLight position={[-50, 25, 50]} color="#0000ff" intensity={500} castShadow />
        <pointLight position={[50, 25, 50]} color="#ff0000" intensity={500} castShadow />
        <mesh>
          <boxGeometry args={[10, 10, 10]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </Suspense>
    </Canvas>
  )
}
