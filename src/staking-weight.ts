import { LpPosition, UserList } from "./types";

const RAI_IS_TOKEN_0 = true;

export const getStakingWeight = (debt: number, positions: LpPosition[], sqrtPrice: number, redemptionPrice: number): number => {
  const totalLiquidity = positions.reduce((acc, p) => acc + (isInRange(p, redemptionPrice) ? p.liquidity : 0), 0);
  const totalRaiLp = positions.reduce((acc, p) => acc + getActiveRaiFromLp(p, sqrtPrice, redemptionPrice), 0);

  // Discount your liquidity if you haven't minted the full amount
  if (debt >= totalRaiLp) {
    return totalLiquidity;
  } else {
    return (debt / totalRaiLp) * totalLiquidity;
  }
};

export const getActiveRaiFromLp = (lp: LpPosition, sqrtPrice: number ,redemptionPrice: number) =>
  isInRange(lp, redemptionPrice) ? getTokenAmountsFromLp(lp, sqrtPrice)[RAI_IS_TOKEN_0 ? 0 : 1] : 0;

// == Uniswap v3 math wizardry ==
export const getTokenAmountsFromLp = (lp: LpPosition, sqrtPrice: number) => {
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

const isInRange = (lp: LpPosition, redemptionPrice: number) => {
  const tick = sqrtPriceToAdjustedTick(priceToSqrtPrice(redemptionPrice));
  return tick >= lp.lowerTick && tick <= lp.upperTick;
};

const sqrtPriceToTick = (sqrtPrice) => Math.log(sqrtPrice / 2 ** 96) / Math.log(Math.sqrt(1.0001));

const sqrtPriceToAdjustedTick = (sqrtPrice: number, tickSpacing = 10) =>{
  const flooredTick = Math.floor(sqrtPriceToTick(sqrtPrice))
  return flooredTick - flooredTick % tickSpacing
}

const tickToSqrtPrice = (tick: number) => (1.0001 ** (tick/2)) * 2**96

const getAmount0Delta = (lowerTick: number, upperTick: number, liquidity: number) =>
  (liquidity / tickToSqrtPrice(lowerTick) - liquidity / tickToSqrtPrice(upperTick)) / 1e18;

const getAmount1Delta = (lowerTick: number, upperTick: number, liquidity: number) =>
  (liquidity * (tickToSqrtPrice(upperTick) - tickToSqrtPrice(lowerTick))) / 1e18;

const priceToSqrtPrice = (price: number, token0Decimal = 18, token1Decimal = 18) => Math.sqrt(price * (10**token1Decimal) / (10**token0Decimal) * (2 ** 192))