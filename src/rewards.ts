import { config } from "./config";
import { getAccumulatedRate } from "./initial-state";
import { LpPosition, RewardEvent, RewardEventType, UserAccount, UserList } from "./types";
import { getOrCreateUser } from "./utils";
import { provider } from "./chain";
import { sanityCheckAllUsers } from "./sanity-checks";
import { getStakingWeight } from "./staking-weight";
import { getPoolState } from "./subgraph";

export const processRewardEvent = async (users: UserList, events: RewardEvent[]): Promise<UserList> => {
  // Starting and ending of the campaign
  const startBlock = config().START_BLOCK;
  const endBlock = config().END_BLOCK;
  const startTimestamp = (await provider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await provider.getBlock(endBlock)).timestamp;

  // Constant amount of reward distributed per second
  const rewardRate = config().REWARD_AMOUNT / (endTimestamp - startTimestamp);

  // Ongoing Total supply of weight
  let totalStakingWeight = sumAllWeights(users);

  // Ongoing cumulative reward per weight over time
  let rewardPerWeight = 0;

  let updateRewardPerWeight = (evtTime) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;
      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;
    }
  };

  // Ongoing time
  let timestamp = startTimestamp;

  // Ongoing accumulated rate
  let accumulatedRate = await getAccumulatedRate(startBlock);

  // Ongoing uni v3 sqrtPrice
  let sqrtPrice = (await getPoolState(startBlock, config().UNISWAP_POOL_ADDRESS)).sqrtPrice;

  // ===== Main processing loop ======

  console.log(
    `Distributing ${
      config().REWARD_AMOUNT
    } at a reward rate of ${rewardRate}/sec between ${startTimestamp} and ${endTimestamp}`
  );
  console.log("Applying all events...");
  // Main processing loop processing events in chronologic order that modify the current reward rate distribution for each user.

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    updateRewardPerWeight(event.timestamp);

    // Increment time
    timestamp = event.timestamp;

    // The way the rewards are credited is different for each event type
    switch (event.type) {
      case RewardEventType.DELTA_DEBT: {
        const user = getOrCreateUser(event.address, users);
        earn(user, rewardPerWeight);

        // Convert to real debt after interests and update the debt balance
        const adjustedDeltaDebt = (event.value as number) * accumulatedRate;
        user.debt += adjustedDeltaDebt;

        // Ignore Dusty debt 
        if(user.debt < 0 && user.debt > -0.02) {
          user.debt = 0
        }

        user.stakingWeight = getStakingWeight(user.debt, user.lpPositions, sqrtPrice);
        break;
      }
      case RewardEventType.POOL_POSITION_UPDATE: {
        const updatedPosition = event.value as LpPosition;
        const user = getOrCreateUser(event.address, users);
        earn(user, rewardPerWeight);

        // Detect the special of a simple NFT transfer (not form a mint/burn/modify position)
        for (let u of Object.keys(users)) {
          for (let p in users[u].lpPositions) {
            if (users[u].lpPositions[p].tokenId === updatedPosition.tokenId && u !== event.address) {
              console.log("ERC721 transfer");
              // We found the source address of an ERC721 transfer
              earn(users[u], rewardPerWeight);
              users[u].lpPositions = users[u].lpPositions.filter(x => x.tokenId !== updatedPosition.tokenId);
              users[u].stakingWeight = getStakingWeight(users[u].debt, users[u].lpPositions, sqrtPrice);
            }
          }
        }
        // Create or update the position
        const index = user.lpPositions.findIndex((p) => p.tokenId === updatedPosition.tokenId);
        if (index === -1) {
          user.lpPositions.push({
            tokenId: updatedPosition.tokenId,
            lowerTick: updatedPosition.lowerTick,
            upperTick: updatedPosition.upperTick,
            liquidity: updatedPosition.liquidity,
          });
        } else {
          user.lpPositions[index].liquidity = updatedPosition.liquidity;

          // Sanity check
          if (
            user.lpPositions[index].lowerTick !== updatedPosition.lowerTick ||
            user.lpPositions[index].upperTick !== updatedPosition.upperTick
          ) {
            throw Error("Tick value can't be updated");
          }
        }

        // Update that user staking weight
        user.stakingWeight = getStakingWeight(user.debt, user.lpPositions, sqrtPrice);

        break;
      }
      case RewardEventType.POOL_SWAP: {
        // Pool swap changes the price which affects everyone's staking weight

        // First credit all users
        Object.values(users).map((u) => earn(u, rewardPerWeight));

        sqrtPrice = event.value as number;

        // Then update everyone weight
        Object.values(users).map(
          (u) => (u.stakingWeight = getStakingWeight(u.debt, u.lpPositions, sqrtPrice))
        );

        break;
      }
      case RewardEventType.UPDATE_ACCUMULATED_RATE: {
        // Update accumulated rate increases everyone's debt by the rate multiplier
        const rateMultiplier = event.value as number;
        accumulatedRate += rateMultiplier;

        // First credit all users
        Object.values(users).map((u) => earn(u, rewardPerWeight));

        // Update everyone's debt
        Object.values(users).map((u) => (u.debt *= rateMultiplier + 1));

        Object.values(users).map(
          (u) => (u.stakingWeight = getStakingWeight(u.debt, u.lpPositions, sqrtPrice))
        );
        break;
      }
      default:
        throw Error("Unknown event");
    }

    sanityCheckAllUsers(users, event);

    // Recalculate the sum of weights since the events the weights
    totalStakingWeight = sumAllWeights(users);

    if (totalStakingWeight === 0) {
      console.log(`Zero weight at event ${i} time ${event.timestamp}`);
    }
  }

  // Final crediting of all rewards
  updateRewardPerWeight(endTimestamp);
  Object.values(users).map((u) => earn(u, rewardPerWeight));

  return users;
};

// Credit reward to a user
const earn = (user: UserAccount, rewardPerWeight: number) => {
  // Credit to the user his due rewards
  user.earned += (rewardPerWeight - user.rewardPerWeightStored) * user.stakingWeight;

  // Store his cumulative credited rewards for next time
  user.rewardPerWeightStored = rewardPerWeight;
};

// Simply sum all the stakingWeight of all users
const sumAllWeights = (users: UserList) =>
  Object.values(users).reduce((acc, user) => acc + user.stakingWeight, 0);
