const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { expectRevert, constants: { ZERO_ADDRESS }, ether, time } = require('@openzeppelin/test-helpers');

const {
  submitGovernanceProposal,
  getAddressByCodeFactory,
  Address,
  fund,
  unlock,
  UserAddress,
} = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, Role, ContractTypes } = require('../utils').constants;

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Quotation = artifacts.require('Quotation');
const TokenController = artifacts.require('TokenController');
const Gateway = artifacts.require('Gateway');
const Incidents = artifacts.require('Incidents');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const Pool = artifacts.require('Pool');
const MCR = artifacts.require('MCR');
const QuotationData = artifacts.require('QuotationData');
const ClaimsReward = artifacts.require('ClaimsReward');
const ProposalCategoryContract = artifacts.require('ProposalCategory');
const LegacyNXMaster = artifacts.require('ILegacyNXMaster');
const MMockNewContract = artifacts.require('MMockNewContract');
const Claims = artifacts.require('Claims');

describe('sample test', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const versionDataURL = 'https://api.nexusmutual.io/version-data/data.json';
    const { mainnet: { abis } } = await fetch(versionDataURL).then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    const masterAddress = getAddressByCode('NXMASTER');
    const token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    const memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    const governance = await Governance.at(getAddressByCode('GV'));
    const pool1 = await Pool.at(getAddressByCode('P1'));
    const mcr = await MCR.at(getAddressByCode('MC'));
    const incidents = await Incidents.at(getAddressByCode('IC'));
    const quotationData = await QuotationData.at(getAddressByCode('QD'));
    const proposalCategory = await ProposalCategoryContract.at(getAddressByCode('PC'));
    const claims = await ProposalCategoryContract.at(getAddressByCode('CL'));

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.pool = pool1;
    this.mcr = mcr;
    this.master = await NXMaster.at(masterAddress);
    this.quotationData = quotationData;
    this.incidents = incidents;
    this.getAddressByCode = getAddressByCode;
    this.proposalCategory = proposalCategory;
    this.claims = claims;
  });

  it('fetches board members and funds accounts', async function () {

    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(0, 3);

    const whales = [UserAddress.NXM_WHALE_1, UserAddress.NXM_WHALE_2];

    for (const member of [...voters, Address.NXMHOLDER, ...whales]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
    this.whales = whales;
  });

  it('upgrade master', async function () {
    const { master, voters, governance, getAddressByCode } = this;

    const legacyMaster = await LegacyNXMaster.at(master.address);

    const newMaster = await NXMaster.new();

    const upgradeMaster = web3.eth.abi.encodeParameters(
      ['address'],
      [
        newMaster.address,
      ],
    );

    const {
      contractsName,
      contractsAddress,
    } = await legacyMaster.getVersionData();

    const prevTokenAddress = await legacyMaster.tokenAddress();

    await submitGovernanceProposal(
      ProposalCategory.upgradeMaster,
      upgradeMaster,
      voters,
      governance,
    );

    const proxy = await OwnedUpgradeabilityProxy.at(master.address);
    const implementation = await proxy.implementation();

    assert.equal(implementation, newMaster.address);

    const { _contractCodes, _contractAddresses } = await master.getInternalContracts();

    assert.equal(contractsName.length, _contractCodes.length);
    assert.equal(contractsAddress.length, _contractAddresses.length);

    console.log({
      _contractCodes,
      _contractAddresses,
    });

    for (let i = 0; i < contractsName.length; i++) {
      assert.equal(contractsName[i], _contractCodes[i]);
      assert.equal(contractsAddress[i], _contractAddresses[i]);
    }

    const tokenAddress = await master.tokenAddress();
    assert.equal(tokenAddress, prevTokenAddress);
  });

  it('upgrade contracts', async function () {
    const { master, voters, governance, incidents, mcr } = this;

    const newMaster = await NXMaster.new();

    const newIncidents = await Incidents.new();
    const newClaimsReward = await ClaimsReward.new(master.address, Address.DAI);
    const newMCR = await MCR.new(master.address);
    const quotation = await Quotation.new();
    const claims = await Claims.new();

    const previousMaxMCRFloorIncrement = await mcr.maxMCRFloorIncrement();
    const previousStoredMCR = await mcr.mcr();
    const previousDesiredMCR = await mcr.desiredMCR();
    const previousLastUpdateTime = await mcr.lastUpdateTime();
    const previousMcrFloor = await mcr.mcrFloor();

    const contractCodes = ['IC', 'CR', 'MC', 'QT', 'CL'];
    const newAddresses = [newIncidents.address, newClaimsReward.address, newMCR.address, quotation.address, claims.address];

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        contractCodes.map(code => hex(code)),
        newAddresses,
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      upgradeContractsData,
      voters,
      governance,
    );

    const proxy = await OwnedUpgradeabilityProxy.at(incidents.address);
    const incidentsImplementation = await proxy.implementation();
    assert.equal(incidentsImplementation, newIncidents.address);

    assert.equal(newMCR.address, await master.getLatestAddress(hex('MC')));
    assert.equal(newClaimsReward.address, await master.getLatestAddress(hex('CR')));

    const maxMCRFloorIncrement = await newMCR.maxMCRFloorIncrement();
    const storedMCR = await newMCR.mcr();
    const desiredMCR = await newMCR.desiredMCR();
    const lastUpdateTime = await newMCR.lastUpdateTime();
    const mcrFloor = await mcr.mcrFloor();

    assert.equal(maxMCRFloorIncrement.toString(), previousMaxMCRFloorIncrement.toString());
    assert.equal(storedMCR.toString(), previousStoredMCR.toString());
    assert.equal(desiredMCR.toString(), previousDesiredMCR.toString());
    assert.equal(lastUpdateTime.toString(), previousLastUpdateTime.toString());
    assert.equal(mcrFloor.toString(), previousMcrFloor.toString());

    this.mcr = newMCR;
    this.claims = claims;
    this.quotation = quotation;
  });

  it('check getClaimByIndex', async function () {
    const { claims } = this;
    await claims.getClaimbyIndex(0);
  });

  it('adds category for adding new contracts', async function () {
    const { governance, voters, proposalCategory } = this;

    // withdraw assets proposal category
    const parameters = [
      ['string', 'Add new internal contracts'], // name
      ['uint256', Role.AdvisoryBoard], // member role that votes
      ['uint256', 60], // majority vote percentage
      ['uint256', 15], // quorum percentage
      ['uint256[]', [Role.AdvisoryBoard]], // allowed to create proposal
      ['uint256', 3 * 24 * 3600], // closing time 3 days
      ['string', ''], // action hash - probably ipfs hash
      ['address', '0x0000000000000000000000000000000000000000'], // contract address: used only if next is "EX"
      ['bytes2', hex('MS')], // contract name
      // "incentives" is [min stake, incentive, ab voting req, special resolution]
      ['uint256[]', [0, 0, 1, 0]],
      ['string', 'addNewInternalContracts(bytes2[],address[],uint256[])'], // function signature
    ];

    const actionData = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    const categoryIndex = await proposalCategory.totalCategories();

    await submitGovernanceProposal(ProposalCategory.addCategory, actionData, voters, governance);

    this.newContractCategory = categoryIndex;
  });

  it('adds category for removing contracts', async function () {
    const { governance, voters, proposalCategory } = this;

    // withdraw assets proposal category
    const parameters = [
      ['string', 'Remove contracts'], // name
      ['uint256', Role.AdvisoryBoard], // member role that votes
      ['uint256', 60], // majority vote percentage
      ['uint256', 15], // quorum percentage
      ['uint256[]', [Role.AdvisoryBoard]], // allowed to create proposal
      ['uint256', 3 * 24 * 3600], // closing time 3 days
      ['string', ''], // action hash - probably ipfs hash
      ['address', '0x0000000000000000000000000000000000000000'], // contract address: used only if next is "EX"
      ['bytes2', hex('MS')], // contract name
      // "incentives" is [min stake, incentive, ab voting req, special resolution]
      ['uint256[]', [0, 0, 1, 0]],
      ['string', 'removeContracts(bytes2[])'], // function signature
    ];

    const actionData = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    const categoryIndex = await proposalCategory.totalCategories();

    await submitGovernanceProposal(ProposalCategory.addCategory, actionData, voters, governance);

    this.removeContractsCategory = categoryIndex;
  });

  it('adds new test internal contract', async function () {
    const { governance, voters, master } = this;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();
    const actionData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [ContractTypes.Replaceable]],
    );

    await submitGovernanceProposal(this.newContractCategory, actionData, voters, governance);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);
  });

  it('removes previously added internal contract', async function () {
    const { governance, voters, master } = this;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();
    const actionData = web3.eth.abi.encodeParameters(['bytes2[]'], [[code]]);
    await submitGovernanceProposal(this.removeContractsCategory, actionData, voters, governance);

    const address = await master.getLatestAddress(code);
    assert.equal(address, ZERO_ADDRESS);
    assert.equal(false, await master.isInternal(newContract.address));
  });

  it('sets emergency admin', async function () {
    const { governance, voters, master } = this;

    const emergencyAdmin = UserAddress.HUGH;

    const parameters = [
      ['bytes8', hex('EMADMIN')],
      ['address', emergencyAdmin],
    ];
    const actionData = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    await submitGovernanceProposal(ProposalCategory.updateOwnerParameters, actionData, voters, governance);

    const storedEmergencyAdmin = await master.emergencyAdmin();

    console.log({
      storedEmergencyAdmin,
    });

    assert.equal(storedEmergencyAdmin.toLowerCase(), emergencyAdmin.toLowerCase());

    this.emergencyAdmin = emergencyAdmin;
  });

  it('pauses system', async function () {
    const { master, emergencyAdmin, pool } = this;

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    assert.equal(await master.paused(), true);

    await expectRevert(
      pool.buyNXM('0', { value: '0', from: Address.NXMHOLDER }),
      'System is paused',
    );

  });

  it('unpauses system', async function () {
    const { master, emergencyAdmin } = this;

    await master.setEmergencyPause(false, {
      from: emergencyAdmin,
    });

    assert.equal(await master.paused(), false);
  });

  require('./basic-functionality-tests');
});
