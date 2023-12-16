import { config } from "./config";
import { getStakingWeight } from "./staking-weight";
import {
  getPoolState,
  getRedemptionPriceFromBlock,
  subgraphQuery,
  subgraphQueryPaginated
} from "./subgraph";
import { LpPosition, UserList } from "./types";
import {
  getExclusionList,
  getOrCreateUser,
  getSafeOwnerMapping
} from "./utils";

export const getInitialState = async (
  startBlock: number,
  endBlock: number,
  owners: Map<string, string>
) => {
  console.log("Fetch initial state...");

  // Get all LP token balance
  const positions = await getInitialLpPosition(startBlock);

  // Get all debts
  const debts = await getInitialSafesDebt(startBlock, owners);

  console.log(`  Fetched ${debts.length} debt balances`);

  // Add positions
  const users: UserList = {};
  for (let addr of Object.keys(positions)) {
    const user = getOrCreateUser(addr, users);
    user.lpPositions = positions[addr].positions;
  }

  for (let debt of debts) {
    const user = getOrCreateUser(debt.address, users);
    user.debt += debt.debt;
    users[debt.address] = user;
  }

  // Remove accounts from the exclusion list
  const exclusionList = await getExclusionList();
  for (let e of exclusionList) {
    delete users[e];
  }

  const poolState = await getPoolState(
    startBlock,
    config().UNISWAP_POOL_ADDRESS
  );
  const redemptionPrice = await getRedemptionPriceFromBlock(startBlock);

  // Set the initial staking weights
  Object.values(users).map(u => {
    u.stakingWeight = getStakingWeight(
      u.debt,
      u.lpPositions,
      poolState.sqrtPrice,
      redemptionPrice
    );
    // console.log("u.stakingWeight", u.stakingWeight);
  });

  // Sanity checks
  for (let user of Object.values(users)) {
    if (
      user.debt == undefined ||
      user.earned == undefined ||
      user.lpPositions == undefined ||
      user.rewardPerWeightStored == undefined ||
      user.stakingWeight == undefined
    ) {
      throw Error(`Inconsistent initial state user ${user}`);
    }
  }

  console.log(
    `Finished loading initial state for ${Object.keys(users).length} users`
  );
  return users;
};

const getInitialSafesDebt = async (
  startBlock: number,
  ownerMapping: Map<string, string>
) => {
  const debtQuery = `{safes(where: {debt_gt: 0}, first: 1000, skip: [[skip]],block: {number:${startBlock}}) {debt, safeHandler}}`;
  const debtsGraph: {
    debt: number;
    safeHandler: string;
  }[] = await subgraphQueryPaginated(
    debtQuery,
    "safes",
    config().GEB_SUBGRAPH_URL
  );

  // We need the adjusted debt after accumulated rate for the initial state
  const accumulatedRate = await getAccumulatedRate(startBlock);

  let debts: { address: string; debt: number }[] = [];
  for (let u of debtsGraph) {
    if (!ownerMapping.has(u.safeHandler)) {
      console.log(`Safe handler ${u.safeHandler} has no owner`);
      continue;
    }

    debts.push({
      address: ownerMapping.get(u.safeHandler),
      debt: Number(u.debt) * accumulatedRate
    });
  }

  return debts;
};

export const getAccumulatedRate = async (block: number) => {
  return Number(
    (
      await subgraphQuery(
        `{collateralType(id: "ETH-A", block: {number: ${block}}) {accumulatedRate}}`,
        config().GEB_SUBGRAPH_URL
      )
    ).collateralType.accumulatedRate
  );
};

const getInitialLpPosition = async (startBlock: number) => {
  const query = `{
    positions(block: {number: ${startBlock}}, where: { pool : "${
    config().UNISWAP_POOL_ADDRESS
  }"}, first: 1000, skip: [[skip]]) {
      id
      owner
      liquidity
      tickLower {
        tickIdx
      }
      tickUpper {
        tickIdx
      }
    }
  }`;

  const positions: {
    id: string;
    owner: string;
    liquidity: string;
    tickLower: {
      tickIdx: string;
    };
    tickUpper: {
      tickIdx: string;
    };
  }[] = await subgraphQueryPaginated(
    query,
    "positions",
    config().UNISWAP_SUBGRAPH_URL
  );

  console.log(`  Fetched ${positions.length} LP position`);

  let userPositions = positions.reduce((acc, p) => {
    if (acc[p.owner]) {
      acc[p.owner].positions.push({
        lowerTick: parseInt(p.tickLower.tickIdx),
        upperTick: parseInt(p.tickUpper.tickIdx),
        liquidity: parseInt(p.liquidity),
        tokenId: parseInt(p.id)
      });
    } else {
      acc[p.owner] = {
        positions: [
          {
            lowerTick: parseInt(p.tickLower.tickIdx),
            upperTick: parseInt(p.tickUpper.tickIdx),
            liquidity: parseInt(p.liquidity),
            tokenId: parseInt(p.id)
          }
        ]
      };
    }
    return acc;
  }, {} as { [key: string]: { positions: LpPosition[] } });

  return userPositions;
};
