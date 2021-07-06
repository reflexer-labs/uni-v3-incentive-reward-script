import { LpPosition, UserList } from "./types";

export const getStakingWeight = (debt: number, positions: LpPosition[], sqrtPrice: number): number => {
  const totalLiquidity = positions.reduce((acc, p) => acc + p.liquidity, 0);
  // const totalRaiLp =

  return 777;
};

// == Uniswap v3 math wizardry ==
export const getRaiAmountFromLp = (lp: LpPosition, sqrtPrice: number) => {
  const currentTick = sqrtPriceToTick(sqrtPrice);
  let token0Amt: number, token1Amt: number;

  if (currentTick < lp.lowerTick) {
    // Price is below range
    token0Amt = getAmount0Delta(lp.lowerTick, lp.upperTick, lp.liquidity);
    token1Amt = 0;
  } else if (currentTick < lp.upperTick) {
    // Price is in range
    token0Amt = getAmount0Delta(currentTick, lp.upperTick, lp.liquidity);
    token1Amt = getAmount1Delta(lp.lowerTick, currentTick, lp.liquidity);
  } else {
    // Price above range
    token0Amt = 0;
    token1Amt = getAmount1Delta(lp.lowerTick, lp.upperTick, lp.liquidity);
  }

  return [token0Amt, token1Amt];
};

const sqrtPriceToTick = (sqrtPrice) => Math.log(sqrtPrice / 2 ** 96) / Math.log(Math.sqrt(1.0001));

const tickToSqrtPrice = (tick: number) => Math.sqrt(1.0001 ** tick);

const getAmount0Delta = (lowerTick: number, upperTick: number, liquidity: number) =>
  (liquidity / tickToSqrtPrice(lowerTick) - liquidity / tickToSqrtPrice(upperTick)) / 1e18;

const getAmount1Delta = (lowerTick: number, upperTick: number, liquidity: number) =>
  (liquidity * (tickToSqrtPrice(upperTick) - tickToSqrtPrice(lowerTick))) / 1e18;
