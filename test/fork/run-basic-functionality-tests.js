const { ethers, network } = require('hardhat');

const evm = require('./evm')();

const { parseEther, toUtf8Bytes } = ethers.utils;

const V2Addresses = {
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingPool: '0xcafeacf62FB96fa1243618c4727Edf7E04D1D4Ca',
  CoverViewer: '0xcafea84e199C85E44F34CD75374188D33FB94B4b',
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
    this.pool = await ethers.getContractAt('Pool', await this.master.getLatestAddress(toUtf8Bytes('P1')));
    this.mcr = await ethers.getContractAt('MCR', await this.master.getLatestAddress(toUtf8Bytes('MC')));
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', V2Addresses.StakingNFT);
    this.coverNFT = await ethers.getContractAt('CoverNFT', V2Addresses.CoverNFT);
    this.pooledStaking = await ethers.getContractAt(
      'LegacyPooledStaking',
      await this.master.getLatestAddress(toUtf8Bytes('PS')),
    );
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
