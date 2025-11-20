import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FlowParticlesProps {
  count?: number;
  speed?: number;
  angle: number; // Angle of attack in degrees
  thickness: number; // To estimate deflection magnitude
  flowType: 'discrete' | 'steam';
  showVortices: boolean;
}

const FlowParticles: React.FC<FlowParticlesProps> = ({ count = 4000, speed = 0.15, angle, thickness, flowType, showVortices }) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  
  // Helper object for positioning
  const dummy = useMemo(() => new THREE.Object3D(), []);

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
    if (!mesh.current) return;

    const time = state.clock.getElapsedTime();
    const angleRad = THREE.MathUtils.degToRad(angle);
    
    // Aerodynamic Constants
    // Approximate airfoil chord is from x=0 to x=1
    
    // Stall detection
    const absAngle = Math.abs(angle);
    const isStalled = absAngle > 15;
    const separationPoint = isStalled ? 0.2 : 0.95; // Flow separates early if stalled
    
    // Interaction constants
    const interactionRadius = 1.2 + (thickness / 25); 
    const liftFactor = Math.sin(angleRad) * 3.5;

    // Boundary constants for fade logic
    const BOUND_START = -10;
    const BOUND_END = 12;
    const FADE_DIST = 3;

    particles.forEach((p, i) => {
      // 1. BASE MOVEMENT
      // Move particles from left to right
      const currentSpeed = speed + p.speedOffset;
      p.x += currentSpeed;

      // Reset if out of bounds with randomized re-entry for smoothness
      if (p.x > BOUND_END) {
        p.x = BOUND_START - (Math.random() * 2); // Random buffer to prevent "walls" of particles
        p.y = p.baseY; // Reset Y to original streamline
      }

      // 2. POTENTIAL FLOW DEFLECTION (Near airfoil)
      // Calculate distance to airfoil center (approx at 0.3, 0)
      const dx = p.x - 0.3; 
      const dy = p.y; // Relative to centerline
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      // Base streamline deflection
      if (dist < interactionRadius * 2.5) {
        const influence = Math.exp(-distSq * 1.5); // Gaussian influence
        
        // Thickness displacement (push outwards)
        const thicknessPush = (Math.sign(p.y) || 1) * influence * (thickness / 100) * 0.6;
        
        // Angle of Attack deflection (Lift/Downwash)
        // Flow curves UP before wing, DOWN after wing
        let liftPush = 0;
        if (dx < 0) {
             // Upwash in front
             liftPush = influence * liftFactor * 0.15; 
        } else {
             // Downwash behind
             liftPush = -influence * liftFactor * 0.15; 
        }

        p.y += thicknessPush + liftPush;
      }

      // 3. WAKE TURBULENCE & VORTEX SHEDDING
      // Only applies downstream of the separation point
      if (showVortices && p.x > separationPoint) {
        const distBehind = p.x - separationPoint;
        
        // Wake expands downstream
        // Base width + expansion factor
        const wakeWidth = (thickness / 100) + (absAngle / 30) + (distBehind * 0.25);
        
        // Check if particle is within the wake influence zone
        if (Math.abs(p.y) < wakeWidth) {
            // Intensity fades slightly with distance but increases with Angle of Attack
            const wakeIntensity = Math.min(1.0, (absAngle / 10) + 0.2) * Math.exp(-distBehind * 0.1);
            
            // A. Vortex Shedding (Oscillation)
            // Von Karman street approximation: Sine wave traveling downstream
            // Frequency increases with speed, Amplitude increases with AoA
            const vortexFreq = 12.0;
            const vortexSpeed = 15.0;
            const vortexAmp = (absAngle / 40) * 0.5; 
            
            // Alternating phase top/bottom
            const sign = Math.sign(p.y) || 1;
            const oscillation = Math.sin(distBehind * vortexFreq - time * vortexSpeed + p.phase) * vortexAmp * sign;
            
            // B. Turbulence (Random Jitter)
            // Chaotic motion, higher in stalled conditions
            const jitterX = (Math.random() - 0.5) * 0.05 * wakeIntensity;
            const jitterY = (Math.random() - 0.5) * 0.05 * wakeIntensity;
            
            if (isStalled) {
                // Massive turbulence in stall
                p.y += oscillation * 2.0 + jitterY * 2.0;
                p.x += jitterX * 2.0; // Drag slows flow
            } else {
                // Smooth vortex street
                p.y += oscillation * Math.exp(-Math.abs(p.y)*2) + jitterY * 0.5;
            }
        }
      }
      
      // Update Instance Matrix
      dummy.position.set(p.x, p.y, p.z);
      
      // Scale particles based on speed/turbulence to look like streaks or puffs
      let scaleX = Math.min(0.4, 0.15 + currentSpeed);
      let scaleY = 0.02;
      let scaleZ = 0.02;

      if (flowType === 'steam') {
        scaleX = 0.08;
        scaleY = 0.08;
        scaleZ = 0.08;
      }
      
      // 4. FADE IN/OUT LOGIC
      // Smooth fade in at start, smooth fade out at end
      // smoothstep returns 0..1
      const fadeIn = THREE.MathUtils.smoothstep(p.x, BOUND_START, BOUND_START + FADE_DIST);
      const fadeOut = THREE.MathUtils.smoothstep(p.x, BOUND_END - FADE_DIST, BOUND_END);
      const visibility = fadeIn * (1.0 - fadeOut);
      
      dummy.scale.set(scaleX * visibility, scaleY * visibility, scaleZ * visibility); 
      
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });

    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial 
        color={flowType === 'steam' ? "#e2e8f0" : "#93c5fd"} 
        transparent 
        opacity={flowType === 'steam' ? 0.2 : 0.5} 
        blending={THREE.AdditiveBlending} 
        depthWrite={false} // Improves transparency rendering
      />
    </instancedMesh>
  );
};

export default FlowParticles;