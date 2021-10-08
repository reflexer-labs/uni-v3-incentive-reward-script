import { LpPosition, UserList } from "./types";

const RAI_IS_TOKEN_0 = true;

export const getStakingWeight = (
  debt: number,
  positions: LpPosition[],
  sqrtPrice: number,
  redemptionPrice: number
): number => {
  const totalLiquidity = positions.reduce(
    (acc, p) => acc + (isInRange(p, sqrtPrice, redemptionPrice) ? p.liquidity : 0),
    0
  );
  const totalLpPositionSize = positions.reduce(
    (acc, p) => acc + getPositionSize(p, sqrtPrice, redemptionPrice),
    0
  );

  // Discount your liquidity if you haven't minted the full amount
  if (debt >= totalLpPositionSize) {
    return totalLiquidity;
  } else {
    return (debt / totalLpPositionSize) * totalLiquidity;
  }
};

export const getPositionSize = (lp: LpPosition, sqrtPrice: number, redemptionPrice: number) => {
  if (!isInRange(lp, sqrtPrice, redemptionPrice)) {
    return 0;
  } else {
    const tokenAmounts = getTokenAmountsFromLp(lp, sqrtPrice);
    const [raiAMount, daiAmount] = RAI_IS_TOKEN_0
      ? [tokenAmounts[0], tokenAmounts[1]]
      : [tokenAmounts[1], tokenAmounts[0]];

    const raiValue = sqrtPriceToPrice(sqrtPrice) * raiAMount;
    return daiAmount + raiValue;
  }
};

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

const isInRange = (lp: LpPosition, sqrtPrice, redemptionPrice: number) => {
  const tickMarketPrice = sqrtPriceToTick(sqrtPrice);
  const tickRedemptionPrice = sqrtPriceToAdjustedTick(priceToSqrtPrice(redemptionPrice));
  return (
    tickMarketPrice >= lp.lowerTick &&
    tickMarketPrice <= lp.upperTick &&
    tickRedemptionPrice >= lp.lowerTick &&
    tickRedemptionPrice <= lp.upperTick
  );
};

const sqrtPriceToTick = (sqrtPrice) => Math.log(sqrtPrice / 2 ** 96) / Math.log(Math.sqrt(1.0001));

const tickToSqrtPrice = (tick: number) => 1.0001 ** (tick / 2);

const getAmount0Delta = (lowerTick: number, upperTick: number, liquidity: number) =>
  (liquidity / tickToSqrtPrice(lowerTick) - liquidity / tickToSqrtPrice(upperTick)) / 1e18;

const getAmount1Delta = (lowerTick: number, upperTick: number, liquidity: number) =>
  (liquidity * (tickToSqrtPrice(upperTick) - tickToSqrtPrice(lowerTick))) / 1e18;

const sqrtPriceToAdjustedTick = (sqrtPrice: number, tickSpacing = 10) => {
  const flooredTick = Math.floor(sqrtPriceToTick(sqrtPrice));
  return flooredTick - (flooredTick % tickSpacing);
};

const priceToSqrtPrice = (price: number, token0Decimal = 18, token1Decimal = 18) =>
  Math.sqrt(((price * 10 ** token1Decimal) / 10 ** token0Decimal) * 2 ** 192);

const sqrtPriceToPrice = (price: number, token0Decimal = 18, token1Decimal = 18) =>
  (price ** 2 * (10 ** token0Decimal / 10 ** token1Decimal)) / 2 ** 192;
