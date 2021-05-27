const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { expectRevert, constants: { ZERO_ADDRESS }, ether, time } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');

const { submitGovernanceProposal, submitMemberVoteGovernanceProposal } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, Role } = require('../utils').constants;
const { setNextBlockTime } = require('../utils').evm;
const { bnEqual } = require('../utils').helpers;

const {
  calculateRelativeError,
} = require('../utils').tokenPrice;
const { quoteAuthAddress } = require('../utils').getQuote;
const { buyCover, buyCoverWithDai } = require('../utils').buyCover;

const { toBN } = web3.utils;

const MemberRoles = artifacts.require('MemberRoles');
const Pool = artifacts.require('Pool');
const OldPool = artifacts.require('P1MockOldPool');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const ClaimsReward = artifacts.require('ClaimsReward');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const Claims = artifacts.require('Claims');
const MCR = artifacts.require('MCR');
const LegacyMCR = artifacts.require('LegacyMCR');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ERC20 = artifacts.require('@openzeppelin/contracts-v4/token/ERC20/ERC20.sol:ERC20');
const SwapOperator = artifacts.require('SwapOperator');
const LegacyPoolData = artifacts.require('LegacyPoolData');
const TwapOracle = artifacts.require('TwapOracle');
const Incidents = artifacts.require('Incidents');
const Gateway = artifacts.require('Gateway');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const ProposalCategoryContract = artifacts.require('ProposalCategory');

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  SAI: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
  WNXM: '0x0d438F3b5175Bebc262bF23753C1E53d03432bDE',
  DAIFEED: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  UNIFACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
  stETH: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
};

const UserAddress = {
  NXM_WHALE_1: '0x25783b67b5e29c48449163db19842b8531fdde43',
  NXM_WHALE_2: '0x598dbe6738e0aca4eabc22fed2ac737dbd13fb8f',
  NXM_AB_MEMBER: '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
};

const DAI_HOLDER = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';

const ybDAIProductId = '0x000000000000000000000000000000000000000d';
const ybETHProductId = '0x000000000000000000000000000000000000000e';

const ratioScale = toBN('10000');

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

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const fund = async to => web3.eth.sendTransaction({ from: accounts[0], to, value: ether('1000000') });
const unlock = async member => hardhatRequest({ method: 'hardhat_impersonateAccount', params: [member] });
const bnToNumber = bn => parseInt(bn.toString(), 10);

describe('fix steth investment', function () {

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
    const oldMCR = await LegacyMCR.at(getAddressByCode('MC'));
    const oldPoolData = await LegacyPoolData.at(getAddressByCode('PD'));
    const quotationData = await QuotationData.at(getAddressByCode('QD'));
    const oldSwapOperator = await SwapOperator.at('0xcafea7191d1B8538076feB019B092a53Dc4dCdFe');
    const proposalCategory = await ProposalCategoryContract.at(getAddressByCode('PC'));

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.pool = pool1;
    this.oldMCR = oldMCR;
    this.master = await NXMaster.at(masterAddress);
    this.poolData = oldPoolData;
    this.quotationData = quotationData;
    this.oldSwapOperator = oldSwapOperator;
    this.proposalCategory = proposalCategory;
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

  it('add Pool category', async function () {
    const { governance, voters, proposalCategory, pool } = this;

    const parameters = [
      ['string', 'Update Address Parameters for Pool'], // name
      ['uint256', Role.AdvisoryBoard], // member role that votes
      ['uint256', 60], // majority vote percentage
      ['uint256', 15], // quorum percentage
      ['uint256[]', [Role.AdvisoryBoard]], // allowed to create proposal
      ['uint256', 3 * 24 * 3600], // closing time 3 days
      ['string', ''], // action hash - probably ipfs hash
      ['address', '0x0000000000000000000000000000000000000000'], // contract address: used only if next is "EX"
      ['bytes2', hex('P1')], // contract name
      // "incentives" is [min stake, incentive, ab voting req, special resolution]
      ['uint256[]', [0, 0, 1, 0]],
      ['string', 'updateAddressParameters(bytes8,address)'], // function signature
    ];

    const addCategory = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    const totalCategories = await proposalCategory.totalCategories();
    this.setPoolAddressParameters = totalCategories;

    await submitGovernanceProposal(ProposalCategory.addCategory, addCategory, voters, governance);
  });

  it('upgrade contracts', async function () {
    const { master, oldSwapOperator, pool, voters, governance, setPoolAddressParameters } = this;

    console.log('Deploying contracts');

    const twapOracle = await TwapOracle.at(await oldSwapOperator.twapOracle());
    const swapController = await oldSwapOperator.swapController();

    await fund(swapController);
    await unlock(swapController);
    await (swapController);

    const stETHToken = await ERC20.at(Address.stETH);
    const swapOperator = await SwapOperator.new(
      master.address, twapOracle.address, swapController, stETHToken.address,
    );

    const parameters = [
      ['bytes8', hex('SWP_OP')],
      ['address', swapOperator.address],
    ];

    const addSwapOperator = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );
    const poolValueInEthBefore = pool.getPoolValueInEth();

    // add new category for sendClaimPayout call
    await submitGovernanceProposal(setPoolAddressParameters, addSwapOperator, voters, governance);

    const storedSwapOperatorAddress = await pool.swapOperator();
    assert.equal(storedSwapOperatorAddress, swapOperator.address);

    const poolValueInEthAfter = pool.getPoolValueInEth();

    assert.equal(poolValueInEthAfter.toString(), poolValueInEthBefore.toString());

    this.swapOperator = swapOperator;
    this.swapController = swapController;
    this.stETHToken = stETHToken;
  });

  it('triggers small StEth investment', async function () {
    const { swapOperator, swapController, stETHToken, pool } = this;

    const poolValueInEthBefore = await pool.getPoolValueInEth();

    const balanceBefore = await stETHToken.balanceOf(pool.address);

    const amountIn = ether('100');
    await swapOperator.swapETHForStETH(amountIn, {
      from: swapController,
    });

    const balanceAfter = await stETHToken.balanceOf(pool.address);

    const dustDifference = 1;
    assert.equal(balanceAfter.sub(balanceBefore).toString(), amountIn.subn(dustDifference).toString());

    const poolValueInEthAfter = await pool.getPoolValueInEth();

    const poolValueDelta = poolValueInEthBefore.sub(poolValueInEthAfter);

    assert(poolValueDelta.ltn(20), 'poolValueDelta exceeds 20 wei');

    console.log({
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
    });
  });

  it('triggers large StEth investment', async function () {
    const { swapOperator, swapController, stETHToken, pool } = this;

    const balanceBefore = await stETHToken.balanceOf(pool.address);
    const poolValueInEthBefore = await pool.getPoolValueInEth();

    const amountIn = ether('15000');
    await swapOperator.swapETHForStETH(amountIn, {
      from: swapController,
    });

    const balanceAfter = await stETHToken.balanceOf(pool.address);

    assert.equal(balanceAfter.sub(balanceBefore).toString(), amountIn.toString());

    const poolValueInEthAfter = await pool.getPoolValueInEth();

    const poolValueDelta = poolValueInEthBefore.sub(poolValueInEthAfter);

    console.log({
      balanceAfter: balanceAfter.toString(),
    });

    assert(poolValueDelta.ltn(20), 'poolValueDelta exceeds 20 wei');
  });
});
