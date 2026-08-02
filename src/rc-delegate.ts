import { loadConfig, loadRcDelegationConfig } from './config.js';
import { startWatchdog } from './watchdog.js';
import { initClient, logNodeHealth } from './hive/client.js';
import { buildEligibleContext } from './newbies/pool.js';
import { runRcDelegationCycle } from './rc/delegate.js';
import { todayUTC } from './scheduler.js';

async function main(): Promise<void> {
  // Force exit if the run hangs, so a blocked call can't dead-man future runs.
  // The normal RC run has taken ~14m, so keep well clear of that.
  startWatchdog(30);
  console.log('=== Hive Swarm RC Delegation ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // The lottery bot's posting key isn't required here — the RC delegator uses
  // its own key — so load config without demanding POSTING_KEY.
  const config = loadConfig({ requireKeys: false });
  const rcConfig = loadRcDelegationConfig();
  initClient(config);

  console.log(`Delegator: @${rcConfig.delegatorAccount || '(unset)'}`);
  console.log(`Amount: ${rcConfig.amount} RC  Dry run: ${rcConfig.dryRun}`);
  console.log(`Exempt accounts: ${rcConfig.exemptAccounts.join(', ') || '(none)'}`);
  console.log(`Reclaimable amounts: ${rcConfig.managedAmounts.join(', ')}`);

  if (!rcConfig.enabled) {
    console.log('RC delegation disabled (RC_DELEGATION_ENABLED=false). Exiting.');
    return;
  }

  const date = todayUTC();
  console.log(`Date: ${date}`);

  console.log('Building eligible newbie pool...');
  const ctx = await buildEligibleContext(config, date);
  if (!ctx) {
    console.log('No eligible context — nothing to delegate. Exiting.');
    return;
  }
  console.log(`Eligible newbies: ${ctx.eligible.length}`);

  await runRcDelegationCycle(rcConfig, config, ctx.eligible, date);

  console.log('=== Run complete ===');
}

main()
  .finally(() => logNodeHealth())
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
