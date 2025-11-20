
import * as THREE from 'three';
import { Point } from '../types';

/**
 * Generates a NACA 4-digit airfoil shape.
 */
export const generateNACAShape = (
  camber: number, 
  position: number, 
  thickness: number, 
  chord: number = 1, 
  points: number = 100
): THREE.Shape => {
  const m = camber / 100;
  const p = position / 10;
  const t = thickness / 100;
  
  const shape = new THREE.Shape();
  
  const upperPoints: [number, number][] = [];
  const lowerPoints: [number, number][] = [];

  for (let i = 0; i <= points; i++) {
    const beta = (i / points) * Math.PI;
    const x = (1 - Math.cos(beta)) / 2 * chord;

    const yt = 5 * t * chord * (
      0.2969 * Math.sqrt(x / chord) -
      0.1260 * (x / chord) -
      0.3516 * Math.pow(x / chord, 2) +
      0.2843 * Math.pow(x / chord, 3) -
      0.1015 * Math.pow(x / chord, 4)
    );

    let yc = 0;
    let dyc_dx = 0;

    if (p === 0 || m === 0) {
      yc = 0;
      dyc_dx = 0;
    } else {
      if (x <= p * chord) {
        yc = (m / Math.pow(p, 2)) * (2 * p * (x / chord) - Math.pow(x / chord, 2));
        dyc_dx = (2 * m / Math.pow(p, 2)) * (p - x / chord);
      } else {
        yc = (m / Math.pow(1 - p, 2)) * ((1 - 2 * p) + 2 * p * (x / chord) - Math.pow(x / chord, 2));
        dyc_dx = (2 * m / Math.pow(1 - p, 2)) * (p - x / chord);
      }
    }

    const theta = Math.atan(dyc_dx);

    const xu = x - yt * Math.sin(theta);
    const yu = yc + yt * Math.cos(theta);
    
    const xl = x + yt * Math.sin(theta);
    const yl = yc - yt * Math.cos(theta);

    upperPoints.push([xu, yu]);
    lowerPoints.push([xl, yl]);
  }

  shape.moveTo(upperPoints[points][0], upperPoints[points][1]);
  for (let i = points - 1; i >= 0; i--) {
    shape.lineTo(upperPoints[i][0], upperPoints[i][1]);
  }
  for (let i = 0; i <= points; i++) {
    shape.lineTo(lowerPoints[i][0], lowerPoints[i][1]);
  }

  return shape;
};

/**
 * Generates a shape from control points.
 * Expects points to define Upper Surface then Lower Surface.
 */
export const generateFreeformShape = (controlPoints: Point[]): THREE.Shape => {
  const shape = new THREE.Shape();

  if (controlPoints.length < 3) return shape;

  // Split points into upper and lower surfaces
  // Assuming standard structure: 
  // Index 0 is Leading Edge (0,0)
  // Last Index is Trailing Edge
  // We need to construct curves.
  
  // For this specific implementation, we expect:
  // LE, Upper1, Upper2, Upper3, TE, Lower1, Lower2, Lower3
  // But let's make it robust. We'll create a single loop or two curves.
  
  // Let's assume the points are ordered: LE -> Upper Surface -> TE -> Lower Surface (back to LE conceptually)
  
  // To get smooth curves, we use SplineCurve (2D)
  const vectorPoints = controlPoints.map(p => new THREE.Vector2(p.x, p.y));
  
  // Close the loop if needed, but usually we draw LE -> TE (Upper) then TE -> LE (Lower)
  // Let's split the points based on our known structure in App.tsx
  // 0: LE
  // 1, 2, 3: Upper intermediates
  // 4: TE
  // 5, 6, 7: Lower intermediates
  
  const le = vectorPoints[0];
  const te = vectorPoints[4];
  
  const upperCurvePoints = [le, vectorPoints[1], vectorPoints[2], vectorPoints[3], te];
  const lowerCurvePoints = [le, vectorPoints[5], vectorPoints[6], vectorPoints[7], te]; // Note: Curve usually goes left to right
  
  const upperCurve = new THREE.SplineCurve(upperCurvePoints);
  const lowerCurve = new THREE.SplineCurve(lowerCurvePoints);
  
  const divisions = 50;
  const upperSpaced = upperCurve.getPoints(divisions);
  const lowerSpaced = lowerCurve.getPoints(divisions);
  
  // Draw Shape
  shape.moveTo(upperSpaced[upperSpaced.length - 1].x, upperSpaced[upperSpaced.length - 1].y); // Start at TE
  
  // Draw Upper (backwards from TE to LE)
  for (let i = upperSpaced.length - 1; i >= 0; i--) {
    shape.lineTo(upperSpaced[i].x, upperSpaced[i].y);
  }
  
  // Draw Lower (from LE to TE)
  for (let i = 0; i < lowerSpaced.length; i++) {
     shape.lineTo(lowerSpaced[i].x, lowerSpaced[i].y);
  }

  return shape;
};
