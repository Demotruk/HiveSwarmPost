import { loadConfig } from './config.js';
import { initClient } from './hive/client.js';
import { getFollowing, syncFollows } from './hive/follows.js';

const config = loadConfig({ requireKeys: false });
initClient(config);

const mode = process.argv[2] || 'check';

if (mode === 'check') {
  // Just check current follows
  const following = await getFollowing(config.botAccount);
  console.log(`@${config.botAccount} following: ${following.length} accounts`);
  if (following.length > 0) console.log(following.join(', '));

} else if (mode === 'sync') {
  // Sync to test accounts
  const testAccounts = process.argv.slice(3);
  if (testAccounts.length === 0) {
    console.log('Usage: test-follows.ts sync account1 account2 ...');
    process.exit(1);
  }
  const currentFollows = await getFollowing(config.botAccount);
  console.log(`Current follows: ${currentFollows.length}`);
  console.log(`Desired: [${testAccounts.join(', ')}]`);
  const result = await syncFollows(testAccounts, currentFollows, config.botAccount, config.dryRun);
  console.log(`Done: +${result.followed.length} -${result.unfollowed.length}`);

} else if (mode === 'clear') {
  // Unfollow everyone
  const currentFollows = await getFollowing(config.botAccount);
  console.log(`Clearing ${currentFollows.length} follows...`);
  const result = await syncFollows([], currentFollows, config.botAccount, config.dryRun);
  console.log(`Unfollowed: ${result.unfollowed.length}`);
}
