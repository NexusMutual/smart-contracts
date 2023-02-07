const fetch = require('node-fetch');
const { artifacts, web3, network: { provider } } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');

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
    const { mainnet: { abis } } = await fetch(VERSION_DATA).then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    this.gvProxyAddress = getAddressByCode('GV');
    this.memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    this.master = await NXMaster.at(getAddressByCode(('NXMASTER')));
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

  it('can\'t call triggerAction() if proposal 135 has action status ActionRejected', async function () {
    const { governance, voters } = this;

    const proposalId = 135;
    const actionStatus = await governance.proposalActionStatus(proposalId);
    assert.equal(actionStatus, 2); // ActionRejected

    await expectRevert.unspecified(
      governance.triggerAction(proposalId, { from: voters[0] }),
    );
  });

  it('can\'t call rejectAction() on proposals with action status != ActionAccepted', async function () {
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

  it('performs hypothetical future proxy upgrade', async function () {

    const { voters, governance, master } = this;

    const gatewayImplementation = await Gateway.new();
    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['GW'].map(hex),
        [gatewayImplementation].map(c => c.address),
      ],
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
      [
        ['TF'].map(hex),
        [tokenFunctionsImplementation].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      upgradesActionDataNonProxy,
      voters,
      governance,
    );

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
