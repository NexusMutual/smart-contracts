require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('node:fs/promises');
const { Sema } = require('async-sema');
const deployments = require('@nexusmutual/deployments');

async function pushCoverNotes({ tc }, data, semaLimit) {
  const semaphore = new Sema(semaLimit, { capacity: data.length });
  let processed = 0;

  const promises = data.map(async (item, index) => {
    await semaphore.acquire();
    try {
      const { member, coverIds, lockReasonIndexes } = item;
      await tc.withdrawCoverNote(member, coverIds, lockReasonIndexes);
      processed++;
      process.stdout.write(`\rProcessed Cover Note ${processed} of ${data.length}`);
    } catch (e) {
      console.error(`\nError processing Cover Note for ${item.member}:`, e);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
  console.log('\nFinished processing Cover Notes');
}

async function pushClaimsAssessment({ tc }, data) {
  const users = data.map(item => item.member);
  try {
    await tc.withdrawClaimAssessmentTokens(users);
    console.log('Processed Claims Assessment tokens');
  } catch (e) {
    console.error('Error processing Claims Assessment tokens:', e);
  }
}

async function pushV1StakingStake({ ps }, data, semaLimit) {
  const semaphore = new Sema(semaLimit, { capacity: data.length });
  let processed = 0;

  const promises = data.map(async (item, index) => {
    await semaphore.acquire();
    try {
      await ps.withdrawForUser(item.member);
      processed++;
      process.stdout.write(`\rProcessed Staking Stake ${processed} of ${data.length}`);
    } catch (e) {
      console.error(`\nError processing Staking Stake for ${item.member}:`, e);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
  console.log('\nFinished processing Staking Stakes');
}

async function pushV1StakingRewards({ ps }, data, semaLimit) {
  const semaphore = new Sema(semaLimit, { capacity: data.length });
  let processed = 0;

  const promises = data.map(async (item, index) => {
    await semaphore.acquire();
    try {
      await ps.withdrawReward(item.member);
      processed++;
      process.stdout.write(`\rProcessed Staking Reward ${processed} of ${data.length}`);
    } catch (e) {
      console.error(`\nError processing Staking Reward for ${item.member}:`, e);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
  console.log('\nFinished processing Staking Rewards');
}

module.exports = {
  pushCoverNotes,
  pushClaimsAssessment,
  pushV1StakingStake,
  pushV1StakingRewards
};

