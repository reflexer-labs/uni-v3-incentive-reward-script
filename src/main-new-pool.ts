import { config } from "./config";
import { getEvents } from "./get-events";
import { getInitialState } from "./initial-state";
import { processRewardEvent } from "./rewards";
import { UserList } from "./types";
import { exportResults, getSafeOwnerMapping } from "./utils";

const fs = require("fs");

const main = async () => {
  // Get end user owners of safe handle
  const owners = await getSafeOwnerMapping(config().END_BLOCK);

  console.log(`  Fetched ${owners.size} owners`);

  // List of all users with their parameters
  const users: UserList = await getInitialState(
    config().START_BLOCK,
    config().END_BLOCK,
    owners
  );

  try {
    // Write the content to the file
    fs.writeFileSync("users.json", JSON.stringify(users));

    console.log("File written successfully");
  } catch (error) {
    // Handle any errors that might occur
    console.error("An error occurred:", error);
  }

  // All event modifying the reward state
  const events = await getEvents(
    config().START_BLOCK,
    config().END_BLOCK,
    owners
  );

  try {
    // Write the content to the file
    fs.writeFileSync("events.json", JSON.stringify(events));

    console.log("File written successfully");
  } catch (error) {
    // Handle any errors that might occur
    console.error("An error occurred:", error);
  }

  //   Apply all reward event to users
  await processRewardEvent(users, events);

  //   // Write results in file
  exportResults(users);
};

// Start..
main();
