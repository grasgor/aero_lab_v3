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
 * Supports dynamic number of points.
 * Assumes structure: LE -> Upper Surface Points -> TE -> Lower Surface Points
 */
export const generateFreeformShape = (controlPoints: Point[]): THREE.Shape => {
  const shape = new THREE.Shape();

  if (controlPoints.length < 3) return shape;

  // Dynamically find the Trailing Edge (TE) index.
  // We assume it's the point roughly in the middle of the array.
  // Usually LE is 0, TE is ceil(length/2) for equal points top/bottom
  const teIndex = Math.floor(controlPoints.length / 2);

  const le = new THREE.Vector2(controlPoints[0].x, controlPoints[0].y);
  const te = new THREE.Vector2(controlPoints[teIndex].x, controlPoints[teIndex].y);

  // Upper Surface: From LE (0) to TE (teIndex)
  const upperSurfacePoints = controlPoints.slice(0, teIndex + 1).map(p => new THREE.Vector2(p.x, p.y));
  
  // Lower Surface: From LE (0) -> Intermediates (teIndex+1 to end) -> TE (teIndex)
  // Note: Control points for lower surface typically move from LE towards TE in X.
  const lowerIntermediatePoints = controlPoints.slice(teIndex + 1).map(p => new THREE.Vector2(p.x, p.y));
  const lowerSurfacePoints = [le, ...lowerIntermediatePoints, te];
  
  const upperCurve = new THREE.SplineCurve(upperSurfacePoints);
  const lowerCurve = new THREE.SplineCurve(lowerSurfacePoints);
  
  const divisions = 50;
  const upperSpaced = upperCurve.getPoints(divisions);
  const lowerSpaced = lowerCurve.getPoints(divisions);
  
  // START DRAWING
  // Start at TE
  shape.moveTo(upperSpaced[upperSpaced.length - 1].x, upperSpaced[upperSpaced.length - 1].y); 
  
  // Draw Upper Surface (backwards from TE to LE)
  for (let i = upperSpaced.length - 1; i >= 0; i--) {
    shape.lineTo(upperSpaced[i].x, upperSpaced[i].y);
  }
  
  // Draw Lower Surface (from LE to TE)
  // We skip index 0 because it's LE, which we just drew to.
  for (let i = 1; i < lowerSpaced.length; i++) {
     shape.lineTo(lowerSpaced[i].x, lowerSpaced[i].y);
  }

  return shape;
};