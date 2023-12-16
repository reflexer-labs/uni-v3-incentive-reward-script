import { RewardEvent, UserAccount, UserList } from "./types";
import { subgraphQueryPaginated } from "./subgraph";

import * as fs from "fs";
import { config } from "./config";
import { getInstadappOwnerMapping } from "./bigquery";

export const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

export const getOrCreateUser = (
  address: string,
  userList: UserList
): UserAccount => {
  if (userList[address]) {
    return userList[address];
  } else {
    const newUser: UserAccount = {
      debt: 0,
      lpPositions: [],
      stakingWeight: 0,
      earned: 0,
      rewardPerWeightStored: 0
    };
    userList[address] = newUser;
    return newUser;
  }
};

export const roundToZero = (num: number) => (Math.abs(num) < 1e-8 ? 0 : num);

// Export results in a CSV file
export const exportResults = (users: UserList) => {
  // Export results in an array
  let userReward: [string, number][] = Object.entries(users).map(kv => [
    kv[0],
    kv[1].earned
  ]);

  // Remove users with 0 rewards
  userReward = userReward.filter(x => x[1] > 0);

  // Sort by decreasing reward
  userReward = userReward.sort((a, b) =>
    a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1
  );

  // CSV dump
  let w = "";
  for (let u of userReward) {
    w += `${u[0]},${u[1]}\n`;
  }
  fs.writeFileSync("rewards.csv", w);
};

export const getExclusionList = async () => {
  const f = await fs.readFileSync("exclusion-list.csv", "utf-8");
  return f.split("\n").filter(x => x !== "");
};

export const getSafeOwnerMapping = async (block: number) => {
  let owners = new Map<string, string>();
  const query = `{
      safeHandlerOwners(first: 1000, skip: [[skip]], block: {number: ${block}}) {
        id
        owner {
          address
        }
      }
    }`;

  const res: {
    id: string;
    owner: { address: string };
  }[] = await subgraphQueryPaginated(
    query,
    "safeHandlerOwners",
    config().GEB_SUBGRAPH_URL
  );

  const instaAccounts = await getInstadappOwnerMapping();

  console.log(`  Fetched ${instaAccounts.size} Instadapp accounts`);

  for (let a of res) {
    if (instaAccounts.has(a.owner.address)) {
      // It's an Instadapp account use its owner
      owners.set(a.id, instaAccounts.get(a.owner.address));
    } else {
      owners.set(a.id, a.owner.address);
    }
  }
  return owners;
};
