const fetch = require('node-fetch');
const {
  artifacts,
  web3,
  network: { provider },
} = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');

const { submitGovernanceProposal } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory } = require('../utils').constants;

const VERSION_DATA = 'https://api.nexusmutual.io/version-data/data.json';

const NXMaster = artifacts.require('NXMaster');
const Governance = artifacts.require('Governance');
const MemberRoles = artifacts.require('MemberRoles');
const TokenFunctions = artifacts.require('TokenFunctions');
const Gateway = artifacts.require('Gateway');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const unlock = async account => provider.request({ method: 'hardhat_impersonateAccount', params: [account] });

const moneymoney = '0x' + ether('1000000').toString(16);
const fund = async to => provider.request({ method: 'hardhat_setBalance', params: [to, moneymoney] });

describe('deploy governance fixes', function () {
  this.timeout(0);
  this.bail(true);

  it('initializes contracts', async function () {
    const {
      mainnet: { abis },
    } = await fetch(VERSION_DATA).then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    this.gvProxyAddress = getAddressByCode('GV');
    this.memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    this.master = await NXMaster.at(getAddressByCode('NXMASTER'));
    this.governance = await Governance.at(getAddressByCode('GV'));
  });

  it('funds accounts', async function () {
    console.log('Funding 3 AB accounts');

    const AB_ROLE = '1';
    const { memberArray: boardMembers } = await this.memberRoles.members(AB_ROLE);
    const voters = boardMembers.slice(0, 3);

    for (const member of voters) {
      await unlock(member);
      await fund(member);
    }

    this.voters = voters;
  });

  it('upgrades contracts', async function () {
    const { governance, voters } = this;

    console.log('Upgrading GV');

    const newGV = await Governance.new();
    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [['GV'].map(hex), [newGV].map(c => c.address)],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy, // == 29 upgradeMultipleContracts
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const gvProxy = await OwnedUpgradeabilityProxy.at(this.gvProxyAddress);
    const gvImplementation = await gvProxy.implementation();
    assert.equal(newGV.address, gvImplementation);

    this.governance = await Governance.at(this.gvProxyAddress);

    console.log('GV upgrade successful.');
  });

  it('sets actions status of proposal 135 as ActionRejected', async function () {
    const { governance, voters } = this;

    const proposalId = 135;
    const actionStatusBefore = await governance.proposalActionStatus(proposalId);
    assert.equal(actionStatusBefore, 1); // ActionAccepted

    for (const ab of voters) {
      await governance.rejectAction(135, { from: ab });
    }

    const actionStatusAfter = await governance.proposalActionStatus(proposalId);
    assert.equal(actionStatusAfter, 2); // ActionRejected
  });

  it("can't call triggerAction() if proposal 135 has action status ActionRejected", async function () {
    const { governance, voters } = this;

    const proposalId = 135;
    const actionStatus = await governance.proposalActionStatus(proposalId);
    assert.equal(actionStatus, 2); // ActionRejected

    await expectRevert.unspecified(governance.triggerAction(proposalId, { from: voters[0] }));
  });

  it("can't call rejectAction() on proposals with action status != ActionAccepted", async function () {
    const { governance, voters } = this;

    const proposalIds = [
      159, // NoAction
      161, // Executed
      162, // Pending
    ];

    for (const proposalId of proposalIds) {
      const actionStatus = await governance.proposalActionStatus(proposalId);
      assert.notEqual(actionStatus, 1); // ActionAccepted
      await expectRevert.unspecified(governance.rejectAction(proposalId, { from: voters[0] }));
    }
  });

  it('reverts when calling triggerAction() and action fails due to low gas', async function () {
    const { voters, governance, master } = this;

    const gatewayImplementation = await Gateway.new();
    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [['GW'].map(hex), [gatewayImplementation].map(c => c.address)],
    );

    const id = await governance.getProposalLength();
    console.log(`Creating proposal ${id}`);

    // Create proposal and open it for voting
    const from = voters[0];
    await governance.createProposal('', '', '', 0, { from });
    await governance.categorizeProposal(id, ProposalCategory.upgradeNonProxy, 0, { from });
    await governance.submitProposalWithSolution(id, '', upgradesActionDataProxy, { from });

    // Vote on proposal
    for (let i = 0; i < 3; i++) {
      await governance.submitVote(id, 1, { from: voters[i] });
    }

    // Close proposal reverts if not enough gas is provided
    console.log(`Closing proposal ${id} reverts with 300k gas`);
    await time.increase(604800);
    await expectRevert(
      governance.closeProposal(id, { from, gas: 300000 }), // 300K gas
      'Action failed without revert reason',
    );

    // Close proposal succeeds if enough gas is provided
    console.log(`Closing proposal ${id} succeeds with 2M gas`);
    await governance.closeProposal(id, { from, gas: 2000000 }); // 2M gas

    const actionStatus = await governance.proposalActionStatus(id);
    assert.equal(actionStatus, 3); // ActionExecuted

    const gwProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('GW')));
    const gwImplementation = await gwProxy.implementation();
    assert.equal(gwImplementation, gatewayImplementation.address);
  });

  it('reverts when calling triggerAction() and action fails due to wrong action', async function () {
    const { voters, governance } = this;

    // addEmergencyPause(bool,bytes4) in NXMaster.sol
    // The category exists, but the `addEmergencyPause` function doesn't exist anymore in NXMaster.sol
    // All member vote
    const upgradesActionData = web3.eth.abi.encodeParameters(['bool', 'bytes4'], [true, hex('abcd')]);

    const proposalId = await governance.getProposalLength();
    console.log(`Creating proposal ${proposalId}`);

    // Create proposal and open it for voting
    const from = voters[0];
    await governance.createProposal('', '', '', 0, { from });
    await governance.categorizeProposal(proposalId, ProposalCategory.addEmergencyPause, 0, { from });
    await governance.submitProposalWithSolution(proposalId, '', upgradesActionData, { from });

    // Vote on proposal
    for (let i = 0; i < 3; i++) {
      await governance.submitVote(proposalId, 1, { from: voters[i] });
    }

    await time.increase(604800); // 7 days

    // Close proposal
    await governance.closeProposal(proposalId, { from, gas: 300000 }); // 300K gas

    // Trigger action should revert
    console.log(`Trigger action on proposal ${proposalId} reverts`);
    await time.increase(25 * 60 * 60); // 25h - past cooldown period
    await expectRevert(
      governance.triggerAction(proposalId, { from, gas: 2000000 }), // 2M gas
      'Action failed without revert reason',
    );

    // AB should be able to reject the action
    console.log(`AB rejects proposal ${proposalId}`);
    for (let i = 0; i < 3; i++) {
      await governance.rejectAction(proposalId, { from: voters[i] });
    }

    console.log(`Actions status after AB reject proposal ${proposalId} is ActionRejected`);
    const actionStatusAfterReject = await governance.proposalActionStatus(proposalId);
    assert.equal(actionStatusAfterReject, 2); // ActionRejected
  });

  it('performs hypothetical future proxy upgrade', async function () {
    const { voters, governance, master } = this;

    const gatewayImplementation = await Gateway.new();
    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [['GW'].map(hex), [gatewayImplementation].map(c => c.address)],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy, // == 29 upgradeMultipleContracts
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const gwProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('GW')));
    const gwImplementation = await gwProxy.implementation();

    assert.equal(gwImplementation, gatewayImplementation.address);
  });

  it('performs hypothetical future non-proxy upgrade', async function () {
    const { voters, governance, master } = this;

    const tokenFunctionsImplementation = await TokenFunctions.new();
    const upgradesActionDataNonProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [['TF'].map(hex), [tokenFunctionsImplementation].map(c => c.address)],
    );

    await submitGovernanceProposal(ProposalCategory.upgradeNonProxy, upgradesActionDataNonProxy, voters, governance);

    const tfStoredAddress = await master.getLatestAddress(hex('TF'));

    assert.equal(tfStoredAddress, tokenFunctionsImplementation.address);
  });

  it('performs hypothetical future master upgrade', async function () {
    const { voters, governance, master } = this;

    const masterProxy = await OwnedUpgradeabilityProxy.at(master.address);

    // upgrade to new master
    const masterImplementation = await NXMaster.new();

    // vote and upgrade
    const upgradeMaster = web3.eth.abi.encodeParameters(['address'], [masterImplementation.address]);
    await submitGovernanceProposal(ProposalCategory.upgradeMaster, upgradeMaster, voters, governance);

    // check implementation
    const actualMasterImplementation = await masterProxy.implementation();
    assert.strictEqual(actualMasterImplementation, masterImplementation.address);
  });
});
