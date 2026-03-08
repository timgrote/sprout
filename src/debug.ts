import { state } from './state';
import { getSortedParticleIndices, polygonPerimeter, edgeLengths, optimalSprinklerCount, vertexLabel } from './geometry';
import { getInput } from './ui';

export function setupDebug() {
  (window as any).getState = () => {
    const sorted = getSortedParticleIndices(state.particles, state.boundaryPoints);
    const perim = state.boundaryClosed ? Math.round(polygonPerimeter(state.boundaryPoints)) : 0;
    const radius = getInput("radius");
    const lengths = state.boundaryClosed ? edgeLengths(state.boundaryPoints) : [];

    const edgeCounts: number[] = new Array(state.boundaryPoints.length).fill(0);
    for (const pt of state.particles) {
      if (pt.type === 'perimeter') edgeCounts[pt.edgeIndex]++;
    }

    const perimSorted = sorted.filter(i => state.particles[i].type === 'perimeter');
    const intSorted = sorted.filter(i => state.particles[i].type === 'interior');

    return {
      perimeter: perim,
      suggestedCount: state.boundaryClosed ? optimalSprinklerCount(state.boundaryPoints, radius) : 0,
      simulating: state.simulating,
      interiorPlaced: state.interiorPlaced,
      vertices: state.boundaryPoints.map((p, i) => ({
        label: vertexLabel(i),
        x: Math.round(p.x),
        y: Math.round(p.y),
      })),
      edges: lengths.map((len, i) => ({
        label: `${vertexLabel(i)}-${vertexLabel((i + 1) % state.boundaryPoints.length)}`,
        length: Math.round(len),
        optimal: Math.ceil(len / radius),
        actual: edgeCounts[i],
      })),
      sprinklers: perimSorted.map((pIdx, displayIdx) => {
        const pt = state.particles[pIdx];
        return {
          num: displayIdx + 1,
          x: Math.round(pt.pos.x),
          y: Math.round(pt.pos.y),
          settled: pt.settled,
          type: 'perimeter' as const,
          edge: `${vertexLabel(pt.edgeIndex)}-${vertexLabel((pt.edgeIndex + 1) % state.boundaryPoints.length)}`,
        };
      }),
      interior: intSorted.map((pIdx, displayIdx) => {
        const pt = state.particles[pIdx];
        return {
          num: perimSorted.length + displayIdx + 1,
          x: Math.round(pt.pos.x),
          y: Math.round(pt.pos.y),
          settled: pt.settled,
          type: 'interior' as const,
        };
      }),
      logs: [...state.simLogs],
    };
  };
}
