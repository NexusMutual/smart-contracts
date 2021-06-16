const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const {
  Address,
  UserAddress,
  getAddressByCodeFactory,
  fund,
  unlock,
  submitGovernanceProposal,
} = require('./utils');
const { ProposalCategory, CoverStatus } = require('../utils').constants;
const { quoteAuthAddress } = require('../utils').getQuote;
const { toBN } = web3.utils;
const { buyCover, buyCoverWithDai } = require('../utils').buyCover;

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Quotation = artifacts.require('Quotation');
const TokenController = artifacts.require('TokenController');
const Gateway = artifacts.require('Gateway');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');

const ybDAIProductId = '0x000000000000000000000000000000000000000d';
const ybETHProductId = '0x000000000000000000000000000000000000000e';
let ybDAI, ybETH;

describe('basic functionality tests', async function () {
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
      ProposalCategory.upgradeProxy,
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

  it('change quotation engine address to sign quotes', async function () {
    const { governance, voters } = this;

    const parameters = [
      ['bytes8', hex('QUOAUTH')], // changeAuthQuoteEngine code
      ['address', quoteAuthAddress], // authQuoteEngine
    ];
    const actionData = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    await submitGovernanceProposal(ProposalCategory.updateOwnerParameters, actionData, voters, governance);
  });

  it('add ybDAI yield token cover', async function () {
    const { incidents, dai } = this;
    ybDAI = await ERC20MintableDetailed.new('yield bearing DAI', 'ybDAI', 18);

    await unlock(UserAddress.NXM_AB_MEMBER);
    await incidents.addProducts([ybDAIProductId], [ybDAI.address], [dai.address], { from: UserAddress.NXM_AB_MEMBER });
  });

  it('buy ybDAI yield token cover', async function () {
    const { dai } = this;
    const generationTime = await time.latest();
    await time.increase(toBN('1'));
    const ybDAICover = {
      amount: 30000, // 1 dai or eth
      price: '3000000000000000', // 0.003
      priceNXM: '1000000000000000000', // 1 nxm
      expireTime: '2000000000', // year 2033
      generationTime: generationTime.toString(),
      currency: hex('DAI'),
      period: 60,
      contractAddress: ybDAIProductId,
    };
    const coverHolder = UserAddress.NXM_WHALE_1;
    await unlock(UserAddress.DAI_HOLDER);
    await unlock(coverHolder);
    await dai.transfer(coverHolder, '3000000000000000', { from: UserAddress.DAI_HOLDER, gasPrice: 0 });
    await buyCoverWithDai({ ...this, qt: this.quotation, p1: this.pool, cover: ybDAICover, coverHolder });
  });
});
