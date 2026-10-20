// Corpo anatômico 3D (Z-Anatomy, CC BY-SA 4.0 — ver public/models/CREDITS.md).
// Carregado sob demanda (React.lazy) para não pesar no bundle inicial.
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, Html } from '@react-three/drei'
import * as THREE from 'three'

export const MODEL_URL = (import.meta.env.BASE_URL || '/') + 'models/corpo.glb'
const MUSCLE = new THREE.Color('#a3241c'), TENDON = new THREE.Color('#e9e0d0')
const HERO = new THREE.Color('#3b5f86'), HERO_T = new THREE.Color('#6d8db0')
const ACC = new THREE.Color('#20f51b')

function labelOf(o) { while (o) { if (o.userData?.label) return o.userData.label; o = o.parent } return null }

const HEAT = ['#2b3644', '#1f6f63', '#1c9c84', '#1fbf9a', '#20f51b'].map(c => new THREE.Color(c))
function Model({ hero, selected, heat, onPick, onHover }) {
  const { scene } = useGLTF(MODEL_URL)
  const root = useRef()
  const meshes = useMemo(() => {
    const list = []
    scene.traverse(o => {
      if (!o.isMesh) return
      const tendon = o.userData.kind ? o.userData.kind === 'tendon' : o.material?.name === 'tendon'
      o.material = new THREE.MeshStandardMaterial({ roughness: tendon ? .35 : .55, metalness: hero ? .15 : 0 })
      o.userData.kind = tendon ? 'tendon' : 'muscle'
      o.userData.meshLabel = labelOf(o)
      list.push(o)
    })
    return list
  }, [scene, hero])
  useEffect(() => {
    const sel = new Set(selected || [])
    for (const o of meshes) {
      const m = o.material, t = o.userData.kind === 'tendon', on = sel.has(o.userData.meshLabel)
      const lv = heat ? (heat[o.userData.meshLabel] || 0) : null
      m.color.copy(hero ? (t ? HERO_T : HERO) : lv != null ? (t ? TENDON : HEAT[lv]) : (t ? TENDON : MUSCLE))
      m.emissive.copy(on ? ACC : hero ? new THREE.Color('#0b2a4a') : new THREE.Color('#000'))
      m.emissiveIntensity = on ? .85 : hero ? .35 : 0
      m.needsUpdate = true
    }
  }, [meshes, selected, hero, heat])
  useFrame((_, dt) => { if (hero && root.current) root.current.rotation.y += dt * 0.25 })
  return <group ref={root}>
    <primitive object={scene} scale={0.01} position={[0, -0.86, 0]}
      onPointerMove={hero ? undefined : e => { e.stopPropagation(); onHover?.(e.object.userData.meshLabel) }}
      onPointerOut={hero ? undefined : () => onHover?.(null)}
      onClick={hero ? undefined : e => { e.stopPropagation(); onPick?.(e.object.userData.meshLabel) }} />
  </group>
}

export default function Body3D({ hero = false, selected, heat, onPick, onHover, onMiss, background }) {
  return (
    <Canvas camera={{ position: [0, .1, hero ? 2.9 : 2.6], fov: 40 }} dpr={[1, hero ? 1.5 : 2]}
      onPointerMissed={() => onMiss?.()} gl={{ alpha: !background, antialias: true }}
      style={{ touchAction: hero ? 'auto' : 'none', pointerEvents: hero ? 'none' : 'auto' }}>
      {background && <color attach="background" args={[background]} />}
      <hemisphereLight args={['#cfe3ff', '#0b1220', .8]} />
      <directionalLight position={[2, 3, 4]} intensity={1.6} />
      <directionalLight position={[-3, 2, -4]} intensity={1.1} color={hero ? '#20f51b' : '#ffffff'} />
      <Suspense fallback={hero ? null : <Html center style={{ color: '#9fb3c8', whiteSpace: 'nowrap' }}>Carregando modelo…</Html>}>
        <Model hero={hero} selected={selected} heat={heat} onPick={onPick} onHover={onHover} />
      </Suspense>
      {!hero && <OrbitControls enableDamping minDistance={.6} maxDistance={6} />}
    </Canvas>
  )
}
