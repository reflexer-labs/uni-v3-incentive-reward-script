import { LpPosition } from "./types";

export const getStakingWeight = (
  debt: number,
  positions: LpPosition[],
  sqrtPrice: number,
  redemptionPrice: number
): number => {
  const totalLiquidity = positions.reduce((acc, p) => acc + p.liquidity, 0);
  return totalLiquidity;
};
