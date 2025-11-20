import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import '../types';

interface FlowParticlesProps {
  count?: number;
  speed?: number;
  angle: number; // Angle of attack in degrees
  thickness: number; // To estimate deflection magnitude
  flowType: 'discrete' | 'steam';
  showVortices: boolean;
  showHeatmap: boolean; // Toggle for heatmap coloring
  turbulenceIntensity?: number;
  paused?: boolean; // New prop to pause/hide flow
}

const FlowParticles: React.FC<FlowParticlesProps> = ({ 
  count = 4000, 
  speed = 0.15, 
  angle, 
  thickness, 
  flowType, 
  showVortices,
  showHeatmap,
  turbulenceIntensity = 1.0,
  paused = false
}) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  
  // Helper object for positioning and color
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorHelper = useMemo(() => new THREE.Color(), []);

  // Initial positions
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      temp.push({
        x: (Math.random() - 0.5) * 25, // Spread along flow direction
        y: (Math.random() - 0.5) * 12, // Vertical spread
        z: (Math.random() - 0.5) * 4,  // Depth spread
        speedOffset: Math.random() * 0.02,
        baseY: (Math.random() - 0.5) * 12, // Memorize original flow line height
        phase: Math.random() * Math.PI * 2 // Random phase for oscillation
      });
    }
    return temp;
  }, [count]);

  useFrame((state) => {
    if (!mesh.current || paused) return;

    const time = state.clock.getElapsedTime();
    const angleRad = THREE.MathUtils.degToRad(angle);
    
    // Aerodynamic Constants
    const absAngle = Math.abs(angle);
    const isStalled = absAngle > 15;
    const separationPoint = isStalled ? 0.2 : 0.95; 
    
    const interactionRadius = 1.2 + (thickness / 25); 
    const liftFactor = Math.sin(angleRad) * 3.5;

    const BOUND_START = -10;
    const BOUND_END = 12;
    const FADE_DIST = 3;

    particles.forEach((p, i) => {
      // 1. BASE MOVEMENT
      const currentSpeed = speed + p.speedOffset;
      p.x += currentSpeed;

      if (p.x > BOUND_END) {
        p.x = BOUND_START - (Math.random() * 2); 
        p.y = p.baseY; 
      }

      // Variables for heatmap calculation
      let velocityScalar = 0; // 0 = laminar base, >0 = accelerated/turbulent
      let isTurbulent = false;

      // 2. POTENTIAL FLOW DEFLECTION
      const dx = p.x - 0.3; 
      const dy = p.y; 
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      if (dist < interactionRadius * 2.5) {
        const influence = Math.exp(-distSq * 1.5); 
        const thicknessPush = (Math.sign(p.y) || 1) * influence * (thickness / 100) * 0.6;
        let liftPush = 0;
        if (dx < 0) {
             liftPush = influence * liftFactor * 0.15; 
        } else {
             liftPush = -influence * liftFactor * 0.15; 
        }

        p.y += thicknessPush + liftPush;

        // Increase visual velocity near the wing due to Bernoulli acceleration
        // especially over the top surface (liftPush interaction)
        velocityScalar += influence * 0.8; 
      }

      // 3. WAKE TURBULENCE
      if (showVortices && p.x > separationPoint) {
        const distBehind = p.x - separationPoint;
        const wakeWidth = (thickness / 100) + (absAngle / 30) + (distBehind * 0.25);
        
        if (Math.abs(p.y) < wakeWidth) {
            // Scale turbulence effects by the intensity slider
            const wakeIntensity = Math.min(1.0, (absAngle / 10) + 0.2) * Math.exp(-distBehind * 0.1) * turbulenceIntensity;
            const vortexFreq = 12.0;
            const vortexSpeed = 15.0;
            const vortexAmp = (absAngle / 40) * 0.5 * turbulenceIntensity; 
            const sign = Math.sign(p.y) || 1;
            const oscillation = Math.sin(distBehind * vortexFreq - time * vortexSpeed + p.phase) * vortexAmp * sign;
            const jitterX = (Math.random() - 0.5) * 0.05 * wakeIntensity;
            const jitterY = (Math.random() - 0.5) * 0.05 * wakeIntensity;
            
            if (isStalled) {
                p.y += oscillation * 2.0 + jitterY * 2.0;
                p.x += jitterX * 2.0; 
            } else {
                p.y += oscillation * Math.exp(-Math.abs(p.y)*2) + jitterY * 0.5;
            }

            if (wakeIntensity > 0.1) {
               velocityScalar += wakeIntensity * 1.2; // Heat up the wake
               isTurbulent = true;
            }
        }
      }
      
      // Update Instance Matrix
      dummy.position.set(p.x, p.y, p.z);
      
      let scaleX = Math.min(0.4, 0.15 + currentSpeed);
      let scaleY = 0.02;
      let scaleZ = 0.02;

      if (flowType === 'steam') {
        scaleX = 0.08;
        scaleY = 0.08;
        scaleZ = 0.08;
      }
      
      const fadeIn = THREE.MathUtils.smoothstep(p.x, BOUND_START, BOUND_START + FADE_DIST);
      const fadeOut = THREE.MathUtils.smoothstep(p.x, BOUND_END - FADE_DIST, BOUND_END);
      const visibility = fadeIn * (1.0 - fadeOut);
      
      dummy.scale.set(scaleX * visibility, scaleY * visibility, scaleZ * visibility); 
      
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);

      // COLOR UPDATE LOGIC
      if (showHeatmap) {
         // Map scalar to HSL
         // Low (0) -> Blue/Cyan (200-220 deg)
         // Medium -> Green/Yellow
         // High (1+) -> Red/Orange (0-30 deg)
         
         // Clamp scalar roughly 0 to 1.5
         const t = Math.min(1.5, Math.max(0, velocityScalar));
         
         // Hue mapping: start at 0.6 (216 deg Blue), go down to 0.0 (Red)
         // Non-linear mapping often looks better
         const hue = 0.6 - (t * 0.5); 
         
         // Saturation: High for turbulent/fast, lower for laminar
         const sat = 0.5 + (t * 0.5);
         
         // Lightness:
         const light = 0.5 + (t * 0.1);
         
         colorHelper.setHSL(Math.max(0, hue), Math.min(1, sat), Math.min(0.9, light));
      } else {
         // Default Colors
         if (flowType === 'steam') {
            colorHelper.set("#e2e8f0");
         } else {
            colorHelper.set("#93c5fd");
         }
      }
      mesh.current!.setColorAt(i, colorHelper);
    });

    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });

  // If paused, we simply do not render anything
  if (paused) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial 
        color={showHeatmap ? "#ffffff" : (flowType === 'steam' ? "#e2e8f0" : "#93c5fd")}
        transparent 
        opacity={flowType === 'steam' ? 0.2 : 0.5} 
        blending={THREE.AdditiveBlending} 
        depthWrite={false} 
      />
    </instancedMesh>
  );
};

export default FlowParticles;