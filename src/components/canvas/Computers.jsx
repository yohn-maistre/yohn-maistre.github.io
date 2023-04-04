import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Preload, useGLTF, Float } from '@react-three/drei';

import CanvasLoader from '../Loader';

const Computers = ({ isMobile }) => {
  const computer = useGLTF('./zd16-v1.glb')
  // const [mixer] = useState(() => new AnimationMixer(computer.scene));

  // // Update the AnimationMixer on each frame
  // useFrame((state) => {
  //   mixer.update(state.clock.getDelta());
  // });

  // useEffect(() => {
  //   console.log(computer.animations);
  //   // Play all animations once
  //   computer.animations.forEach((clip) => {
  //     const action = mixer.clipAction(clip);
  //     action.setLoop(THREE.LoopOnce);
  //     action.clampWhenFinished = true;
  //     action.timeScale = 180;
  //     action.play();
  //   });
  // }, [computer.animations, mixer]);

  return (
    <Float>
      <mesh>
        <hemisphereLight intensity={1} groundColor="black" />
        <pointLight intensity={0.5} />
        <spotLight
          position={[-20, 50, -10]}
          angle={0.12}
          penumbra={1}
          intensity={0.1}
          castShadow
          shadow-mapSize={1024}
        />
        <primitive
          object={computer.scene}
          scale={isMobile ? 10 : 15.5}
          position={isMobile ? [0, -0.6, 0] : [0, -0.7, 0]}
          rotation={[0.9, 0.7, -0.4]}
        />
      </mesh>
      </Float>
  )
}

const ComputersCanvas = () => {
  const [isMobile, setIsMobile] = useState(false);


  useEffect(() => {
    // Add a listener for changes to the screen size
    const mediaQuery = window.matchMedia('(max-width: 500px)');

    // Set the initial value of the 'isMobile' state available
    setIsMobile(mediaQuery.matches);

    // Define a callback function to handle state variable
    const handleMediaQueryChange = (event) => {
      setIsMobile(event.matches);
    }

    // Add the callback function as listener for changes to the media query
    mediaQuery.addEventListener('change', handleMediaQueryChange, {passive: true});

    // Remove the listener when the component is unmounted
    return () => {
      mediaQuery.removeEventListener('change', handleMediaQueryChange);
    };
  }, []);


  return (
    <Canvas
      frameloop='always'
      shadows
      camera={{ position: [20, 3, 5], fov: 25 }}
      gl={{ preserveDrawingBuffer: true }}
    >
      <Suspense fallback={<CanvasLoader />}>
        <OrbitControls
          enableZoom={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
        <Computers isMobile={isMobile} />
      </Suspense>

      <Preload all />
    </Canvas>
  )
}

export default ComputersCanvas;