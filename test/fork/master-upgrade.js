const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');

const {
  submitGovernanceProposal,
  getAddressByCodeFactory,
  Address,
  fund,
  unlock,
  UserAddress,
} = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, CoverStatus } = require('../utils').constants;

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
const LegacyNXMaster = artifacts.require('ILegacyNXMaster');

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

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.oldPool = pool1;
    this.oldMCR = mcr;
    this.master = await NXMaster.at(masterAddress);
    this.quotationData = quotationData;
    this.incidents = incidents;
    this.getAddressByCode = getAddressByCode;
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
    const { master, voters, governance, incidents } = this;

    const newMaster = await NXMaster.new();

    const newIncidents = await Incidents.new();
    const newClaimsReward = await ClaimsReward.new(master.address, Address.DAI);
    const newMCR = await MCR.new(master.address);

    const contractCodes = ['IC', 'CR', 'MC'];
    const newAddresses = [newIncidents.address, newClaimsReward.address, newMCR.address];

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
  });

  // require('./basic-functionality-tests');
});
