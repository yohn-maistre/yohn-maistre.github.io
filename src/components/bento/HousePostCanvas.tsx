import React from 'react'

import ThreeCanvas from './ThreeCanvas'

export default function HousePostCanvas() {
  return (
    <ThreeCanvas
      modelPath='/iatmul_house_post.glb'
      cameraZ={18}
      autoRotate={false}
      playAnimation={false}
      lighting='studio'
      initialRotationY={0}
      // initialRotationY={Math.PI}
    />
  )
}
