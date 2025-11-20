import React, { useMemo, useRef, useState } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { generateNACAShape, generateFreeformShape } from '../utils/naca';
import { AirfoilParams } from '../types';

interface AirfoilProps {
  params: AirfoilParams;
  setParams?: React.Dispatch<React.SetStateAction<AirfoilParams>>;
  setOrbitEnabled?: (enabled: boolean) => void;
  onDragStart?: () => void;
}

const Airfoil: React.FC<AirfoilProps> = ({ params, setParams, setOrbitEnabled, onDragStart }) => {
  const mesh = useRef<THREE.Mesh>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const planeRef = useRef<THREE.Mesh>(null);

  const shape = useMemo(() => {
    if (params.mode === 'freeform') {
      return generateFreeformShape(params.controlPoints);
    }
    return generateNACAShape(params.camber, params.position, params.thickness);
  }, [params.camber, params.position, params.thickness, params.mode, params.controlPoints]);

  const geometry = useMemo(() => {
    const extrudeSettings = {
      steps: 1,
      depth: 4, // Span of the wing
      bevelEnabled: false,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center(); // Center the geometry
    return geo;
  }, [shape]);

  useFrame(() => {
    if (mesh.current) {
      // Smoothly interpolate rotation
      const targetRotation = THREE.MathUtils.degToRad(-params.angle); 
      mesh.current.rotation.z = THREE.MathUtils.lerp(mesh.current.rotation.z, targetRotation, 0.1);
    }
  });

  // Handle Drag Logic
  const handlePointerDown = (e: ThreeEvent<PointerEvent>, index: number) => {
    if (params.mode !== 'freeform' || !params.isEditing) return;
    e.stopPropagation();
    
    // Snapshot history before dragging starts
    if (onDragStart) onDragStart();
    
    setDraggedIdx(index);
    if (setOrbitEnabled) setOrbitEnabled(false);
  };

  const handlePlanePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (draggedIdx !== null && setParams && mesh.current && params.isEditing) {
      e.stopPropagation();
      const point = e.point; 
      const localPos = mesh.current.worldToLocal(point.clone());
      
      setParams(prev => {
        const newPoints = [...prev.controlPoints];
        let newX = localPos.x;
        let newY = localPos.y;
        
        const teIndex = Math.floor(newPoints.length / 2);

        // Constraint Logic:
        // Index 0 is LE (Leading Edge) -> Pin to 0,0 if desired or just restrict X
        if (draggedIdx === 0) { 
            newX = 0; 
            newY = 0; 
        } 
        // TE (Trailing Edge) is roughly the middle index
        else if (draggedIdx === teIndex) { 
            newX = 1; 
            newY = 0; 
        } 
        else {
           // Restrict others roughly within bounding box for sanity
           newX = Math.max(0, Math.min(1, newX));
           newY = Math.max(-0.5, Math.min(0.5, newY));
        }

        newPoints[draggedIdx] = { x: newX, y: newY };
        return { ...prev, controlPoints: newPoints };
      });
    }
  };

  const handlePointerUp = () => {
    setDraggedIdx(null);
    if (setOrbitEnabled) setOrbitEnabled(true);
  };

  const isFreeformEdit = params.mode === 'freeform' && params.isEditing;

  return (
    <group>
       {/* The main airfoil mesh */}
      <mesh 
        ref={mesh} 
        geometry={geometry} 
        castShadow 
        receiveShadow
      >
        <meshPhysicalMaterial 
          color={isFreeformEdit ? "#ef4444" : "#cbd5e1"} 
          metalness={0.7}
          roughness={0.2}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          wireframe={params.showWireframe}
        />
        
        {/* Render Handles if Freeform AND Editing */}
        {isFreeformEdit && params.controlPoints.map((p, i) => (
          <mesh 
            key={i} 
            position={[p.x, p.y, 2.01]} // Slightly in front
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => handlePointerDown(e, i)}
            onPointerOver={() => document.body.style.cursor = 'grab'}
            onPointerOut={() => document.body.style.cursor = 'auto'}
          >
             <sphereGeometry args={[0.025, 16, 16]} />
             <meshBasicMaterial color={draggedIdx === i ? "yellow" : "white"} depthTest={false} />
          </mesh>
        ))}

        {/* Invisible Plane for Dragging */}
        {isFreeformEdit && (
            <mesh 
                ref={planeRef}
                visible={false}
                position={[0.5, 0, 0]} 
                rotation={[0, 0, 0]}
                onPointerMove={handlePlanePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                <planeGeometry args={[10, 10]} />
                <meshBasicMaterial side={THREE.DoubleSide} />
            </mesh>
        )}
      </mesh>
    </group>
  );
};

export default Airfoil;