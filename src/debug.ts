import { state } from './state';
import { getSortedParticleIndices, polygonPerimeter, edgeLengths, optimalSprinklerCount, vertexLabel } from './geometry';
import { getInput } from './ui';

export function setupDebug() {
  (window as any).getState = () => {
    const sorted = getSortedParticleIndices(state.particles, state.boundaryPoints);
    const perim = state.boundaryClosed ? polygonPerimeter(state.boundaryPoints) : 0;
    const radius = getInput("radius");
    const lengths = state.boundaryClosed ? edgeLengths(state.boundaryPoints) : [];

    const edgeCounts: number[] = new Array(state.boundaryPoints.length).fill(0);
    for (const pt of state.particles) {
      if (pt.type === 'perimeter') edgeCounts[pt.edgeIndex]++;
    }

    const perimSorted = sorted.filter(i => state.particles[i].type === 'perimeter');
    const intSorted = sorted.filter(i => state.particles[i].type === 'interior');

    return {
      perimeter: +perim.toFixed(1),
      unit: 'ft',
      suggestedCount: state.boundaryClosed ? optimalSprinklerCount(state.boundaryPoints, radius) : 0,
      simulating: state.simulating,
      interiorPlaced: state.interiorPlaced,
      viewport: { ...state.viewport },
      vertices: state.boundaryPoints.map((p, i) => ({
        label: vertexLabel(i),
        x: +p.x.toFixed(2),
        y: +p.y.toFixed(2),
      })),
      edges: lengths.map((len, i) => ({
        label: `${vertexLabel(i)}-${vertexLabel((i + 1) % state.boundaryPoints.length)}`,
        length: +len.toFixed(1),
        optimal: Math.ceil(len / radius),
        actual: edgeCounts[i],
      })),
      sprinklers: perimSorted.map((pIdx, displayIdx) => {
        const pt = state.particles[pIdx];
        return {
          num: displayIdx + 1,
          x: +pt.pos.x.toFixed(2),
          y: +pt.pos.y.toFixed(2),
          settled: pt.settled,
          type: 'perimeter' as const,
          edge: `${vertexLabel(pt.edgeIndex)}-${vertexLabel((pt.edgeIndex + 1) % state.boundaryPoints.length)}`,
        };
      }),
      interior: intSorted.map((pIdx, displayIdx) => {
        const pt = state.particles[pIdx];
        return {
          num: perimSorted.length + displayIdx + 1,
          x: +pt.pos.x.toFixed(2),
          y: +pt.pos.y.toFixed(2),
          settled: pt.settled,
          type: 'interior' as const,
        };
      }),
      logs: [...state.simLogs],
    };
  };
}
