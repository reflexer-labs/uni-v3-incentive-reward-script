import { expect } from "chai";
import { type } from "node:os";
import { ImportMock } from "ts-mock-imports";

import { processRewardEvent } from "../rewards";
import { RewardEvent, RewardEventType, UserList } from "../types";
import * as Config from "../config";
import * as Subgraph from "../subgraph";
import * as InitialState from "../initial-state";
import * as Chain from "../chain";
import { getStakingWeight, getTokenAmountsFromLp } from "../staking-weight";

describe("processRewardEvent", async () => {
  const configStub = ImportMock.mockFunction(Config, "config", {
    GEB_SUBGRAPH_URL: "",
    RPC_URL: "",
    START_BLOCK: 5,
    END_BLOCK: 15,
    REWARD_AMOUNT: 10,
  });

  ImportMock.mockOther(InitialState, "getAccumulatedRate", async (b) => 1);
  ImportMock.mockOther(Subgraph, "getPoolState", async (b) => ({
    sqrtPrice: 8.123373146178294e28, // Tick 500
  }));

  ImportMock.mockOther(Chain, "provider", {
    // @ts-ignore
    getBlock: async (b) => ({
      timestamp: b,
    }),
  });

  it("Constant distribution with 2 users", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 30,
        lpPositions: [
          {
            tokenId: 2,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 3e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );
    users["Bob"].stakingWeight = getStakingWeight(
      users["Bob"].debt,
      users["Bob"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    const events: RewardEvent[] = [];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].earned).approximately(2.5, 0.00001);
    expect(users["Bob"].earned).approximately(7.5, 0.00001);
    expect(users["Alice"].stakingWeight * 3).approximately(users["Bob"].stakingWeight, 0.00001);
  });

  it("Remove debt affects rewards", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    const events: RewardEvent[] = [
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: -10,
        timestamp: 10,
        logIndex: 0,
      },
    ];

    expect(users["Alice"].stakingWeight).greaterThan(0);

    users = await processRewardEvent(users, events);

    expect(Object.values(users).length).equal(1);
    expect(users["Alice"].debt).equal(0);
    expect(users["Alice"].stakingWeight).equal(0);
    expect(users["Alice"].earned).equal(5);
  });

  it("A User outside of price range ", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 1000,
            upperTick: 2000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 2,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );
    users["Bob"].stakingWeight = getStakingWeight(
      users["Bob"].debt,
      users["Bob"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    expect(users["Alice"].stakingWeight).equal(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);

    const events: RewardEvent[] = [];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].earned).approximately(0, 0.00001);
    expect(users["Bob"].earned).approximately(10, 0.00001);
  });

  it("Price move across LP positions", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 1000,
            upperTick: 2000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 2,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );
    users["Bob"].stakingWeight = getStakingWeight(
      users["Bob"].debt,
      users["Bob"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    expect(users["Alice"].stakingWeight).equals(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);

    const events: RewardEvent[] = [
      // Price move by 1000 ticks
      {
        type: RewardEventType.POOL_SWAP,
        value: 8.539846045435763e28, // Tick 1500
        timestamp: 10,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].earned).approximately(5, 0.00001);
    expect(users["Bob"].earned).approximately(5, 0.00001);
    expect(users["Alice"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).equals(0);
  });

  it("A User add lp position ", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 2,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );
    users["Bob"].stakingWeight = getStakingWeight(
      users["Bob"].debt,
      users["Bob"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    expect(users["Alice"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).equals(users["Alice"].stakingWeight);

    const events: RewardEvent[] = [
      {
        type: RewardEventType.POOL_POSITION_UPDATE,
        value: {
          tokenId: 3,
          lowerTick: 0,
          upperTick: 1000,
          liquidity: 1e6,
        },
        address: "Alice",
        timestamp: 10,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].lpPositions.length).equal(2);
    expect(users["Alice"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight * 2).equals(users["Alice"].stakingWeight);
    expect(users["Alice"].earned).approximately(5.833333333333332, 0.00001);
    expect(users["Bob"].earned).approximately(4.166666666666666, 0.00001);
  });

  it("A User remove lp position ", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 2,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );
    users["Bob"].stakingWeight = getStakingWeight(
      users["Bob"].debt,
      users["Bob"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    expect(users["Alice"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).equals(users["Alice"].stakingWeight);

    const events: RewardEvent[] = [
      {
        type: RewardEventType.POOL_POSITION_UPDATE,
        value: {
          tokenId: 1,
          lowerTick: 0,
          upperTick: 1000,
          liquidity: 0,
        },
        address: "Alice",
        timestamp: 10,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].lpPositions.length).equal(1);
    expect(users["Alice"].stakingWeight).equal(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);
    expect(users["Alice"].earned).approximately(2.5, 0.00001);
    expect(users["Bob"].earned).approximately(7.5, 0.00001);
  });

  it("A User transfers lp position ", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 2,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );
    users["Bob"].stakingWeight = getStakingWeight(
      users["Bob"].debt,
      users["Bob"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    expect(users["Alice"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).equals(users["Alice"].stakingWeight);

    const events: RewardEvent[] = [
      {
        type: RewardEventType.POOL_POSITION_UPDATE,
        value: {
          tokenId: 1,
          lowerTick: 0,
          upperTick: 1000,
          liquidity: 1e6,
        },
        address: "Bob",
        timestamp: 10,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Bob"].lpPositions.length).equal(2);
    expect(users["Alice"].lpPositions.length).equal(0);
    expect(users["Alice"].stakingWeight).equal(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);
    expect(users["Alice"].earned).approximately(2.5, 0.00001);
    expect(users["Bob"].earned).approximately(7.5, 0.00001);
  });

  it("Change in accumulated rate reduce rewards", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 1,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpPositions: [
          {
            tokenId: 2,
            lowerTick: 0,
            upperTick: 1000,
            liquidity: 1e6,
          },
        ],
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    users["Alice"].stakingWeight = getStakingWeight(
      users["Alice"].debt,
      users["Alice"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );
    users["Bob"].stakingWeight = getStakingWeight(
      users["Bob"].debt,
      users["Bob"].lpPositions,
      (await Subgraph.getPoolState(0, "")).sqrtPrice
    );

    expect(users["Alice"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).greaterThan(0);
    expect(users["Bob"].stakingWeight).equals(users["Alice"].stakingWeight);

    const events: RewardEvent[] = [
      {
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
        value: -0.1,
        timestamp: 10,
        logIndex: 0,
      },
      {
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
        value: -0.1,
        timestamp: 10,
        logIndex: 1,
      },
      {
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
        value: -0.1,
        timestamp: 10,
        logIndex: 2,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].debt).equal(7.29);
    expect(users["Bob"].debt).equal(7.29);
    expect(users["Alice"].earned).greaterThan(0);
    expect(users["Bob"].earned).greaterThan(0);
    expect(users["Bob"].earned).equal(users["Alice"].earned);
  });

  it("Uniswap v3 math in price range", () => {
    const tokensAmt = getTokenAmountsFromLp(
      {
        liquidity: 6669887711769083335609,
        lowerTick: -68280,
        upperTick: -65460,
        tokenId: 123,
      },
      2952324728441008265762276596
    );
    expect(tokensAmt[0]).to.approximately(2999.999999999999999932, 0.0001);
    expect(tokensAmt[1]).to.approximately(29.005071564000383981, 0.0001);
  });

  it("Uniswap v3 math above price range", () => {
    const tokensAmt = getTokenAmountsFromLp(
      {
        liquidity: 707857153197436338506,
        lowerTick: -68760,
        upperTick: -65520,
        tokenId: 123,
      },
      3006355430238031041338241866
    );
    expect(tokensAmt[0]).to.equal(0);
    expect(tokensAmt[1]).to.approximately(4.000000000001034, 0.0001);
  });

  it("Uniswap v3 math below price range", () => {
    const tokensAmt = getTokenAmountsFromLp(
      {
        liquidity: 7911135800609390384613,
        lowerTick: -50,
        upperTick: -20,
        tokenId: 123,
      },
      13719007701227188922991784751
    );
    expect(tokensAmt[0]).to.approximately(11.88689435332549, 0.0001);
    expect(tokensAmt[1]).to.equal(0);
  });
});
