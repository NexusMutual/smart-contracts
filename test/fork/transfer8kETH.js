const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');

const {
  Address,
  UserAddress,
  getAddressByCodeFactory,
  fund,
  unlock,
  submitGovernanceProposal,
  submitMemberVoteGovernanceProposal,
  ratioScale,
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
const QuotationData = artifacts.require('QuotationData');
const Distributor = artifacts.require('Distributor');
const SwapOperator = artifacts.require('SwapOperator');
const MCR = artifacts.require('MCR');

describe('transfer 8k ETH', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    this.token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    this.memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    this.master = await NXMaster.at(getAddressByCode(('NXMASTER')));
    this.governance = await Governance.at(getAddressByCode('GV'));
    this.tokenController = await TokenController.at(getAddressByCode('TC'));
    this.quotation = await Quotation.at(getAddressByCode('QT'));
    this.incidents = await Incidents.at(getAddressByCode('IC'));
    this.pool = await Pool.at(getAddressByCode('P1'));
    this.quotationData = await QuotationData.at(getAddressByCode('QD'));
    this.gateway = await Gateway.at(getAddressByCode('GW'));
    this.memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    this.mcr = await MCR.at(getAddressByCode('MC'));
    this.dai = await ERC20MintableDetailed.at(Address.DAI);
  });

  it('funds accounts', async function () {

    console.log('Funding accounts');

    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(1, 4);

    const whales = [UserAddress.NXM_WHALE_1, UserAddress.NXM_WHALE_2];

    for (const member of [...voters, Address.NXMHOLDER, ...whales]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
    this.whales = whales;
  });

  it('transfer 8k ETH', async function () {
    const { mcr, pool } = this;

    var governance = '0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900';

    // Impersonate GovernanceProxy contract
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [governance],
    },
    );

    // Need some ETH to send transactions as GovernanceProxy contract
    await network.provider.request({
      method: 'hardhat_setBalance',
      params: [governance, web3.utils.toHex(ether('1'))],
    },
    );

    const swapOperator = await SwapOperator.new(
      '0x01BFd82675DBCc7762C84019cA518e701C0cD07e',
      '0xcafea1C9f94e077DF44D95c4A1ad5a5747a18b5C',
      accounts[0],
      '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84');

    console.log(`communityBalanceInitial: ${await web3.eth.getBalance('0x586b9b2F8010b284A0197f392156f1A7Eb5e86e9')}`);
    console.log(`mcrFloor: ${await mcr.mcrFloor()}`);
    console.log(`MCR (1): ${await mcr.mcr()}`);

    await mcr.updateMCR();
    console.log(`MCR (2): ${await mcr.mcr()}`);

    await pool.updateAddressParameters(hex('SWP_OP'), swapOperator.address, {
      from: governance,
    });

    await swapOperator.transferToCommunityFund();

    const communityBalance = await web3.eth.getBalance('0x586b9b2F8010b284A0197f392156f1A7Eb5e86e9');
    console.log(`communityBalanceFinal: ${communityBalance}`);
    assert.equal(communityBalance, ether('8000').toString());

    await expectRevert.unspecified(swapOperator.transferToCommunityFund());

    await time.increase(time.duration.hours(12));

    await mcr.updateMCR();

    console.log(`MCR (3): ${await mcr.mcr()}`);

    await time.increase(time.duration.hours(12));

    await mcr.updateMCR();
    console.log(`MCR (4): ${await mcr.mcr()}`);

    console.log('done');
  });
});
