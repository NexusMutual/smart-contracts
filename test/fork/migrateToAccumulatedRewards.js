const { artifacts, accounts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const fetch = require('node-fetch');
const { assert } = require('chai');
const BN = require('web3').utils.BN;

const { encode1 } = require('./external');
const { expectRevert, logEvents, hex } = require('../utils').helpers;

const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStaking');
const TokenFunctions = artifacts.require('TokenFunctions');
const UpgradeabilityProxy = artifacts.require('UpgradeabilityProxy');

const upgradeProxyImplementationCategoryId = 5;
const newContractAddressUpgradeCategoryId = 29;
const addNewInternalContractCategoryId = 34;

async function submitGovernanceProposal (categoryId, actionHash, members, gv, submitter) {

  const proposalTitle = 'proposal';
  const proposalSD = 'proposal';
  const proposalDescHash = 'proposal';
  const incentive = 0;
  const proposalId = await gv.getProposalLength();
  console.log(`Creating proposal ${proposalId}`);

  await gv.createProposal(proposalTitle, proposalSD, proposalDescHash, 0, { from: submitter });
  await gv.categorizeProposal(proposalId, categoryId, incentive, { from: submitter });
  await gv.submitProposalWithSolution(proposalId, 'proposal', actionHash, { from: submitter });

  console.log(`Voting for proposal ${proposalId}`);

  for (let i = 0; i < members.length; i++) {
    await gv.submitVote(proposalId, 1, { from: members[i] });
  }

  console.log(`Closing proposal`);
  await time.increase(604800);
  logEvents(await gv.closeProposal(proposalId, { from: submitter }));

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3);
}

describe.only('rewards migration', function () {

  this.timeout(0);

  it('performs contract upgrades', async function () {

    const { data: versionData } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const [{ address: masterAddress }] = versionData.mainnet.abis.filter(({ code }) => code === 'NXMASTER');

    const master = await NXMaster.at(masterAddress);
    const { contractsName, contractsAddress } = await master.getVersionData();

    const nameToAddressMap = {
      NXMTOKEN: await master.dAppToken(),
    };

    for (let i = 0; i < contractsName.length; i++) {
      nameToAddressMap[web3.utils.toAscii(contractsName[i])] = contractsAddress[i];
    }

    const mr = await MemberRoles.at(nameToAddressMap['MR']);
    const tk = await NXMToken.at(nameToAddressMap['NXMTOKEN']);
    const gv = await Governance.at(nameToAddressMap['GV']);

    const owners = await mr.members('3');
    const firstBoardMember = owners.memberArray[0];

    const members = await mr.members('1');
    const boardMembers = members.memberArray;
    const secondBoardMember = boardMembers[1];

    assert.equal(boardMembers.length, 5);
    console.log('Board members:', boardMembers);

    const [funder] = accounts;

    for (const member of boardMembers) {
      console.log(`Topping up ${member}`);
      await web3.eth.sendTransaction({ from: funder, to: member, value: ether('100') });
    }

    console.log(`Deploying new contracts`);
    // const newPS = await PooledStaking.new();

    const newPSAddress = '0x4D1328BaBaeA16f9A8F43237a8270a73619F11fA';

    const txData = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('PS')], [newPSAddress]],
    );

    console.log(`Proposal tx data: ${txData}`);

    await submitGovernanceProposal(
      upgradeProxyImplementationCategoryId,
      txData, boardMembers, gv, firstBoardMember,
    );

    const psProxy = await UpgradeabilityProxy.at(await master.getLatestAddress(hex('PS')));
    const storedNewPSAddress = await psProxy.implementation();
    assert.equal(storedNewPSAddress, newPSAddress);

    // const newTF = await TokenFunctions.new();
    const newTFAddress = '0x38B704Ba216C762565Da03D1603935d0f579Ef01';
    const upgradeMultipleContractsActionHash = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('TF')], [newTFAddress]],
    );

    await submitGovernanceProposal(
      newContractAddressUpgradeCategoryId, upgradeMultipleContractsActionHash, boardMembers, gv, secondBoardMember,
    );
    const storedTFAddress = await master.getLatestAddress(hex('TF'));

    assert.equal(storedTFAddress, newTFAddress);

    console.log(`Successfully deployed new contracts`);

    this.firstBoardMember = firstBoardMember;
    this.secondBoardMember = secondBoardMember;
    this.master = master;
    this.tk = tk;
    this.tf = await TokenFunctions.at(await master.getLatestAddress(hex('TF')));
    this.ps = await PooledStaking.at(await master.getLatestAddress(hex('PS')));
  });

  async function assertAccumulatedRewards (staking, rewards) {

    const expectedAggregated = {};
    let totalRewardsMigrated = new BN('0');
    for (const reward of rewards) {
      if (!expectedAggregated[reward.contractAddress]) {
        expectedAggregated[reward.contractAddress] = new BN('0');
      }
      expectedAggregated[reward.contractAddress] = expectedAggregated[reward.contractAddress].add(reward.amount);
    }

    for (const contractAddress of Object.keys(expectedAggregated)) {
      const expectedAccumulatedReward = expectedAggregated[contractAddress];
      const accumulated = await staking.accumulatedRewards(contractAddress);
      totalRewardsMigrated = totalRewardsMigrated.add(accumulated.amount);
      const stakerCount = await staking.contractStakerCount(contractAddress);
      console.log({
        contractAddress,
        stakerCount,
        expectedAccumulatedReward: expectedAccumulatedReward.toString() / 1e18
      });

      assert.strictEqual(
        accumulated.amount.toString(), expectedAccumulatedReward.toString(), `accumulatedRewards does not match for ${contractAddress}`,
      );
      assert.strictEqual(
        accumulated.lastDistributionRound.toString(), '0', `accumulatedRewards does not match for ${contractAddress}`,
      );
    }

    console.log({
      totalRewardsMigrated: totalRewardsMigrated.toString(),
    });

    return {
      expectedAggregated,
      totalRewardsMigrated
    };

  }

  it('migrates rewards to accumulated rewards', async function () {

    const { ps, tk } = this;

    const roundsStart = await ps.REWARD_ROUNDS_START();
    const roundsDuration = await ps.REWARD_ROUND_DURATION();

    const oneWeek = 7 * 24 * 60 * 60;
    assert.strictEqual(roundsDuration.toNumber(), oneWeek);
    assert.strictEqual(roundsStart.toNumber(), 1600074000);

    let firstReward = await ps.firstReward();
    let lastRewardId = await ps.lastRewardId();
    console.log({
      firstReward: firstReward.toString(),
      lastRewardId: lastRewardId.toString(),
    });

    // process partials
    const partialIterations = '60';
    console.log(`using partial iterations: ${partialIterations}`);
    await ps.processPendingActions('60');
    const processedToStakerIndex = await ps.processedToStakerIndex();
    assert.equal(processedToStakerIndex.toString(), '0');
    const isContractStakeCalculated = await ps.isContractStakeCalculated();
    assert.equal(isContractStakeCalculated, false);

    const balancePreMigration = await tk.balanceOf(ps.address);

    const existingRewards = [];
    for (let i = firstReward.toNumber(); i <= lastRewardId.toNumber(); i++) {
      const reward = await ps.rewards(i);
      existingRewards.push(reward);
    }
    console.log(`Detected ${existingRewards.length}`);


    let maxGasUsagePerCall = 0;
    let totalGasUsage = 0;
    let totalCallCount = 0;
    let finished = false;
    while (!finished) {
      const iterations = 209;
      console.log(`migrating with ${iterations} iterations`);
      const tx = await ps.migrateRewardsToAccumulatedRewards(iterations);

      logEvents(tx);

      const [rewardsMigrationCompleted] = tx.logs.filter(log => log.event === 'RewardsMigrationCompleted');
      finished = rewardsMigrationCompleted.args.finished;
      console.log(`Processing migration finished: ${finished}`);
      totalCallCount++;
      const gasUsed = tx.receipt.gasUsed;
      totalGasUsage += gasUsed;

      if (maxGasUsagePerCall < gasUsed) {
        maxGasUsagePerCall = gasUsed;
      }

      firstReward = await ps.firstReward();
      lastRewardId = await ps.lastRewardId();
      console.log({
        gasUsed,
        maxGasUsagePerCall,
        totalGasUsage,
        firstReward: firstReward.toString(),
        lastRewardId: lastRewardId.toString(),
      });
    }

    console.log({
      maxGasUsagePerCall,
      totalGasUsage,
      totalCallCount,
    });

    await expectRevert(
      ps.migrateRewardsToAccumulatedRewards(10),
      'Nothing to migrate',
    );

    console.log(`Asserting reward accumulation..`);
    const { expectedAggregated, totalRewardsMigrated } = await assertAccumulatedRewards(ps, existingRewards);
    const contracts = Object.keys(expectedAggregated);
    console.log(`Done for ${contracts.length} contracts`);

    console.log(`Moving on to the next round..`);
    await time.increase(oneWeek);


    console.log(`Pushing rewards for ${JSON.stringify(contracts)}`);
    const pushTx = await ps.pushRewards(contracts);
    console.log({
      gasUsedByPushRewards: pushTx.receipt.gasUsed
    });

    firstReward = await ps.firstReward();
    lastRewardId = await ps.lastRewardId();
    console.log({
      firstReward: firstReward.toString(),
      lastRewardId: lastRewardId.toString()
    });

    await expectRevert(
      ps.migrateRewardsToAccumulatedRewards(10),
      'Exceeded last migration id',
    );

    console.log(`Processing pending actions..`);

    let processPendingActionsTotalGasUsed = 0;
    let totalCalls = 0;
    let i = 0;
    while (true) {
      console.log(`ps.processPendingActions('100');`);

      const hasActions = await ps.hasPendingActions();
      if (!hasActions) {
        console.log(`Done processing.`);
        break;
      }

      const processTx = await ps.processPendingActions('100');
      const gasUsed = processTx.receipt.gasUsed;
      processPendingActionsTotalGasUsed += gasUsed;
      firstReward = await ps.firstReward();
      lastRewardId = await ps.lastRewardId();
      console.log({
        i,
        gasUsed,
        processPendingActionsTotalGasUsed,
        firstReward: firstReward.toString(),
        lastRewardId: lastRewardId.toString()
      });
      totalCalls++;
      i++;
    }

    const balancePostMigration = await tk.balanceOf(ps.address);
    const diff = balancePostMigration.sub(balancePreMigration);

    console.log({
      balancePostMigration: balancePostMigration.toString() / 1e18,
      balancePreMigration: balancePreMigration.toString() / 1e18,
      diff: diff.toString() / 1e18
    });

    console.log({
      totalCalls,
      processPendingActionsTotalGasUsed
    });

    assert.strictEqual(diff.toString(), totalRewardsMigrated.toString());
  });
});
