const { artifacts, accounts, web3, network } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const fetch = require('node-fetch');
const { assert } = require('chai');
const BN = require('web3').utils.BN;

const { encode1 } = require('./external');
const { logEvents, hex } = require('../utils').helpers;

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

const day = 24 * 60 * 60;

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

let isHardhat;
const hardhatRequest = async (...params) => {

  if (isHardhat === undefined) {
    const nodeInfo = await web3.eth.getNodeInfo();
    isHardhat = !!nodeInfo.match(/Hardhat/);
  }

  if (isHardhat) {
    return network.provider.request(...params);
  }
};

const unlock = async member => hardhatRequest({ method: 'hardhat_impersonateAccount', params: [member] });

describe.only('lock time migration', function () {

  this.timeout(0);

  it('performs contract upgrades', async function () {

    const versionData = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
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
      await web3.eth.sendTransaction({ from: funder, to: member, value: ether('100000') });
      await unlock(member);
    }

    console.log(`Deploying new contracts`);
    const newPS = await PooledStaking.new();
    const newPSAddress = newPS.address;

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

    console.log(`Successfully deployed new contracts`);

    this.firstBoardMember = firstBoardMember;
    this.secondBoardMember = secondBoardMember;
    this.master = master;
    this.tk = tk;
    this.tf = await TokenFunctions.at(await master.getLatestAddress(hex('TF')));
    this.ps = await PooledStaking.at(await master.getLatestAddress(hex('PS')));
  });

  async function readCurrentUnstakes ({ ps }) {
    await ps.read;
  }

  it(`users can't unstake until migration is not finished`, async function () {
    const { ps, firstBoardMember } = this;

    const firstContract = await ps.stakerContractAtIndex(firstBoardMember, 0);
    const minUnstake = await ps.MIN_UNSTAKE();
    console.log({
      message: 'Attempting unstake..',
      firstContract,
      firstBoardMember,
      minUnstake: minUnstake.toString(),
    });
    expectRevert(
      ps.requestUnstake([firstContract], [minUnstake], '0', {
        from: firstBoardMember,
      }),
      'PooledStaking: Migration in progress',
    );
  });

  it('migrates pending unstakes to new lock time', async function () {
    const { ps } = this;
    // TODO

    console.log('rerruning migration re-initialization. (no-op)');
    await ps.initializeLockTimeMigration();

    const newLockTime = await ps.UNSTAKE_LOCK_TIME();
    assert.equal(newLockTime.toString(), (30 * day).toString());

    const MAX_ITERATIONS = 1000;

    let finished = false;
    let totalGasUsed = 0;
    let callCount = 0;
    while (!finished) {
      const tx = await ps.migratePendingUnstakesToNewLockTime(MAX_ITERATIONS);
      console.log('tx.receipt.gasUsed', tx.receipt.gasUsed);
      totalGasUsed += tx.receipt.gasUsed;
      const [lockTimeMigrationCompleted] = tx.logs.filter(log => log.event === 'LockTimeMigrationCompleted');
      finished = lockTimeMigrationCompleted.args.finished;
      console.log('startUnstakeIndex', lockTimeMigrationCompleted.args.startUnstakeIndex.toString());
      console.log('endUnstakeIndex', lockTimeMigrationCompleted.args.endUnstakeIndex.toString());
      console.log(`Processing migration finished: ${finished}`);
      callCount++;
    }

    await expectRevert(
      ps.migratePendingUnstakesToNewLockTime(1),
      'PooledStaking: Migration finished or uninitialized',
    );

    console.log({
      totalGasUsed,
      callCount,
    });
  });

  it(`users can unstake after migration is finished and get 30 day lock time`, async function () {
    const { ps, firstBoardMember } = this;

    const firstContract = await ps.stakerContractAtIndex(firstBoardMember, 0);
    const minUnstake = await ps.MIN_UNSTAKE();
    console.log({
      message: 'Attempting unstake..',
      firstContract,
      firstBoardMember,
      minUnstake: minUnstake.toString(),
    });

    const lastUnstakeRequestId = await ps.lastUnstakeRequestId();
    console.log({
      lastUnstakeRequestId: lastUnstakeRequestId.toString(),
    });
    const tx = await ps.requestUnstake([firstContract], [minUnstake], lastUnstakeRequestId, {
      from: firstBoardMember,
    });

    const block = await web3.eth.getBlock(tx.receipt.blockNumber);
    const expectedUnstakeAt = block.timestamp + 30 * day;

    console.log('Unstake request succesful');
    const lastUnstakeRequestIdPostUnstake = await ps.lastUnstakeRequestId();
    const unstake = await ps.unstakeRequests(lastUnstakeRequestIdPostUnstake);

    assert.equal(unstake.amount.toString(), minUnstake.toString());
    assert.equal(unstake.unstakeAt.toString(), expectedUnstakeAt.toString());
    assert.equal(unstake.contractAddress, firstContract);
    assert.equal(unstake.stakerAddress, firstBoardMember);
    assert.equal(unstake.next, '0');
  });

  it('processes pending actions to clear out all ready unstakes', async function () {
    const { ps } = this;

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
      // firstReward = await ps.firstReward();
      // lastRewardId = await ps.lastRewardId();
      console.log({
        i,
        gasUsed,
        processPendingActionsTotalGasUsed,
        // firstReward: firstReward.toString(),
        // lastRewardId: lastRewardId.toString(),
      });
      totalCalls++;
      i++;
    }

    console.log({
      processPendingActionsTotalGasUsed,
      totalCalls,
    });
  });
});
