import React, { useMemo, useRef, useState } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { generateNACAShape, generateFreeformShape } from '../utils/naca';
import { AirfoilParams } from '../types';

interface AirfoilProps {
  params: AirfoilParams;
  setParams?: React.Dispatch<React.SetStateAction<AirfoilParams>>;
  setOrbitEnabled?: (enabled: boolean) => void;
  onDragStart?: () => void;
  onDeletePoint?: (index: number) => void;
}

const Airfoil: React.FC<AirfoilProps> = ({ params, setParams, setOrbitEnabled, onDragStart, onDeletePoint }) => {
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

  // Memoize Spline Lines for Visualization
  const splineLines = useMemo(() => {
    if (params.mode !== 'freeform') return null;
    
    // Find TE index
    let teIndex = 0;
    let maxX = -Infinity;
    params.controlPoints.forEach((p, i) => {
        if (p.x > maxX) { maxX = p.x; teIndex = i; }
    });

    const upperPoints = params.controlPoints.slice(0, teIndex + 1).map(p => new THREE.Vector3(p.x, p.y, 2.01));
    // Lower surface path for visualization: LE -> ...Lower -> TE
    const le = params.controlPoints[0];
    const te = params.controlPoints[teIndex];
    const lowerMids = params.controlPoints.slice(teIndex + 1);
    const lowerPoints = [
        new THREE.Vector3(le.x, le.y, 2.01),
        ...lowerMids.map(p => new THREE.Vector3(p.x, p.y, 2.01)),
        new THREE.Vector3(te.x, te.y, 2.01)
    ];

    return { upperPoints, lowerPoints };
  }, [params.controlPoints, params.mode]);


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
        
        // Find TE dynamically for constraint logic
        let teIndex = 0;
        let maxX = -Infinity;
        newPoints.forEach((p, i) => { if(p.x > maxX) { maxX = p.x; teIndex = i; } });

        let newX = localPos.x;
        let newY = localPos.y;
        
        // Constraint Logic:
        // Index 0 is LE -> Pin to 0,0 strictly
        if (draggedIdx === 0) { 
            newX = 0; 
            newY = 0; 
        } 
        // TE is the max X point -> Pin X to 1, allow Y movement? Or Pin strict?
        // Usually TE is strict (1,0) for normalized airfoils, but freeform might allow lift/drop.
        // Let's keep TE X pinned to 1 but allow Y slightly if user wants asymmetric TE?
        // For now, standard behavior: Pin TE to (1,0) to keep chord = 1
        else if (draggedIdx === teIndex) { 
            newX = 1; 
            newY = 0; 
        } 
        else {
           // Loose bounding box
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

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>, index: number) => {
      e.stopPropagation();
      if (onDeletePoint) onDeletePoint(index);
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
            onDoubleClick={(e) => handleDoubleClick(e, i)}
            onPointerOver={() => document.body.style.cursor = 'grab'}
            onPointerOut={() => document.body.style.cursor = 'auto'}
          >
             <sphereGeometry args={[0.025, 16, 16]} />
             <meshBasicMaterial color={draggedIdx === i ? "yellow" : "white"} depthTest={false} />
          </mesh>
        ))}

        {/* Spline Visualization Lines */}
        {isFreeformEdit && splineLines && (
            <>
                <Line points={splineLines.upperPoints} color="cyan" opacity={0.5} transparent lineWidth={1} depthTest={false} />
                <Line points={splineLines.lowerPoints} color="cyan" opacity={0.5} transparent lineWidth={1} depthTest={false} />
            </>
        )}

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