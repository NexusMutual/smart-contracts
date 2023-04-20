const { ethers, network } = require('hardhat');

const evm = require('./evm')();

const { parseEther, toUtf8Bytes } = ethers.utils;

const V2Addresses = {
  SwapOperator: '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D842',
  PriceFeedOracle: '0xcafeaf0a0672360941b7f0b6d015797292e842c6',
  Pool: '0xcafea112Db32436c2390F5EC988f3aDB96870627',
  NXMaster: '0xcafea0047591B979c714A63283B8f902554deB66',
  ProductsV1: '0xcafeab02966FdC69Ce5aFDD532DD51466892E32B',
  CoverNFTDescriptor: '0xcafead1E31Ac8e4924Fc867c2C54FAB037458cb9',
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingPool: '0xcafeacf62FB96fa1243618c4727Edf7E04D1D4Ca',
  CoverImpl: '0xcafeaCbabeEd884AE94046d87C8aAB120958B8a6',
  StakingProductsImpl: '0xcafea524e89514e131eE9F8462536793d49d8738',
  IndividualClaimsImpl: '0xcafeaC308bC9B49d6686897270735b4Dc11Fa1Cf',
  YieldTokenIncidentsImpl: '0xcafea7F77b63E995aE864dA9F36c8012666F8Fa4',
  AssessmentImpl: '0xcafea40dE114C67925BeB6e8f0F0e2ee4a25Dd88',
  LegacyClaimsReward: '0xcafeaDcAcAA2CD81b3c54833D6896596d218BFaB',
  TokenController: '0xcafea53357c11b3967A8C7167Fb4973C75063DbB',
  MCR: '0xcafea444db21dc06f34570185cF0014701c7D62e',
  MemberRoles: '0xcafea22Faff6aEc1d1bfc146b2e2EABC73Fa7Acc',
  LegacyPooledStaking: '0xcafea16366682a6c0083c38b2a731BC223c53D27',
  CoverMigrator: '0xcafeac41b010299A9bec5308CCe6aFC2c4DF8D39',
  LegacyGateway: '0xcafeaD694A05815f03F19c357200c6D95968e205',
  Governance: '0xcafeafA258Be9aCb7C0De989be21A8e9583FBA65',
  CoverViewer: '0xcafea84e199C85E44F34CD75374188D33FB94B4b',
  StakingViewer: '0xcafea2B7904eE0089206ab7084bCaFB8D476BD04',
};

const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
const NXM_TOKEN_ADDRESS = '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B';
const ENZYMEV4_VAULT_PROXY_ADDRESS = '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD';

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};

describe('Run Basic Functionality Tests', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    await getSigner('0x1eE3ECa7aEF17D1e74eD7C447CcBA61aC76aDbA9');

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.log(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.log('Snapshot ID: ', await evm.snapshot());
      }
    }
  });

  it('load contracts', async function () {
    this.master = await ethers.getContractAt('NXMaster', '0x01BFd82675DBCc7762C84019cA518e701C0cD07e');
    this.productsV1 = await ethers.getContractAt('ProductsV1', V2Addresses.ProductsV1);
    this.gateway = await ethers.getContractAt('LegacyGateway', '0x089Ab1536D032F54DFbC194Ba47529a4351af1B5');
    this.quotationData = await ethers.getContractAt(
      'LegacyQuotationData',
      '0x1776651F58a17a50098d31ba3C3cD259C1903f7A',
    );
    this.individualClaims = await ethers.getContractAt(
      'IndividualClaims',
      await this.master.getLatestAddress(toUtf8Bytes('CI')),
    );
    this.coverMigrator = await ethers.getContractAt(
      'CoverMigrator',
      await this.master.getLatestAddress(toUtf8Bytes('CL')),
    );
    this.coverViewer = await ethers.getContractAt('CoverViewer', V2Addresses.CoverViewer);
    this.assessment = await ethers.getContractAt('Assessment', await this.master.getLatestAddress(toUtf8Bytes('AS')));
    this.dai = await ethers.getContractAt('ERC20Mock', DAI_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', STETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.cover = await ethers.getContractAt('Cover', await this.master.getLatestAddress(toUtf8Bytes('CO')));
    this.memberRoles = await ethers.getContractAt('MemberRoles', await this.master.getLatestAddress(toUtf8Bytes('MR')));
    this.governance = await ethers.getContractAt('Governance', await this.master.getLatestAddress(toUtf8Bytes('GV')));
    this.nxm = await ethers.getContractAt('NXMToken', NXM_TOKEN_ADDRESS);
    this.pool = await ethers.getContractAt('Pool', V2Addresses.Pool);
    this.mcr = await ethers.getContractAt('MCR', V2Addresses.MCR);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', V2Addresses.StakingNFT);
    this.coverNFT = await ethers.getContractAt('CoverNFT', V2Addresses.CoverNFT);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', await this.master.getLatestAddress(toUtf8Bytes('PS')));
    this.yieldTokenIncidents = await ethers.getContractAt(
      'YieldTokenIncidents',
      await this.master.getLatestAddress(toUtf8Bytes('CG')),
    );

    this.tokenController = await ethers.getContractAt(
      'TokenController',
      await this.master.getLatestAddress(toUtf8Bytes('TC')),
    );
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  require('./basic-functionality-tests');
});
