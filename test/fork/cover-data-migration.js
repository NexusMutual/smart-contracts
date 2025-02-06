const { abis, addresses } = require('@nexusmutual/deployments');
const chai = require('chai');
const { ethers, network } = require('hardhat');

const { Address, EnzymeAdress, V2Addresses, getSigner, submitGovernanceProposal } = require('./utils');
const { ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { sleep } = require('../../lib/helpers');
const { BigNumber } = require('ethers');

const evm = require('./evm')();

const { expect } = chai;
const { deployContract } = ethers;

const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

const compareProxyImplementationAddress = async (proxyAddress, addressToCompare) => {
  const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
  const implementationAddress = await proxy.implementation();
  expect(implementationAddress).to.be.equal(addressToCompare);
};

describe('cover data migration', function () {
  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master ?? (await ethers.getContractAt('NXMaster', V2Addresses.NXMaster));
    const contractAddress = await this.master?.getLatestAddress(toUtf8Bytes(contractCode));
    return ethers.getContractAt(contractName, contractAddress);
  }

  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.info('Snapshot ID: ', await evm.snapshot());
      }
    }
    const [deployer] = await ethers.getSigners();
    await evm.setBalance(deployer.address, parseEther('1000'));
  });

  it('load contracts', async function () {
    this.mcr = await ethers.getContractAt(abis.MCR, addresses.MCR);
    this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
    this.coverProducts = await ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts);
    this.pool = await ethers.getContractAt(abis.Pool, addresses.Pool);
    this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
    this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
    this.stakingPool = await ethers.getContractAt(abis.StakingPool, V2Addresses.StakingPoolImpl);
    this.priceFeedOracle = await ethers.getContractAt(abis.PriceFeedOracle, addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
    this.individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt(abis.LegacyQuotationData, addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt(abis.LegacyClaimsReward, addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt(abis.ProposalCategory, addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
    this.pooledStaking = await ethers.getContractAt(abis.LegacyPooledStaking, addresses.LegacyPooledStaking);
    this.yieldTokenIncidents = await ethers.getContractAt(abis.YieldTokenIncidents, addresses.YieldTokenIncidents);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);

    this.governance = await getContractByContractCode(abis.Governance, ContractCode.Governance);
    this.memberRoles = await getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles);

    // Token Mocks
    this.cbBTC = await ethers.getContractAt('ERC20Mock', Address.CBBTC_ADDRESS);
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    const impersonatePromises = abMembers.map(async address => {
      await Promise.all([evm.impersonate(address), evm.setBalance(address, parseEther('1000'))]);
      return getSigner(address);
    });
    this.abMembers = await Promise.all(impersonatePromises);
  });

  it('Upgrade contracts', async function () {
    const newCover = await deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    ]);

    const upgradeContracts = [{ code: ContractCode.Cover, contract: newCover }];

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [upgradeContracts.map(c => toUtf8Bytes(c.code)), upgradeContracts.map(c => c.contract.address)],
      ),
      this.abMembers,
      this.governance,
    );

    this.cover = await getContractByContractCode('Cover', ContractCode.Cover);

    await compareProxyImplementationAddress(this.cover.address, newCover.address);
  });

  it.skip('estimate gas usage for cover data migration', async function () {
    const gasPriceWei = 1e9; // 1 gwei
    const totalCovers = 1868;
    const coversPerTx = 100;

    const coverIds = [];
    const startId = 1700;
    for (let i = 0; i < coversPerTx; i++) {
      coverIds.push(startId + i);
    }

    const tx = await this.cover.migrateCoverDataAndPoolAllocations(coverIds);
    const txReceipt = await tx.wait();

    const txsNeeded = Math.ceil(totalCovers / coversPerTx);

    const weiPerTx = txReceipt.gasUsed.mul(gasPriceWei);
    const totalWei = weiPerTx.mul(txsNeeded);

    console.log('gas price: %s gwei', gasPriceWei / 1e9);
    console.log('num covers per tx: %s', coversPerTx);
    console.log('gas used per tx: %s', txReceipt.gasUsed.toString());
    console.log('ETH per tx: %s', ethers.utils.formatEther(weiPerTx));
    console.log('txs num for %s covers: %s', totalCovers, txsNeeded);
    console.log('total ETH needed: %s', ethers.utils.formatEther(totalWei));
  });

  it('calculate total gas for cover data migration', async function () {
    const gasPriceWei = 1e9; // 1 gwei
    const totalCovers = 1868;
    const coversPerTx = 100;

    let totalWei = BigNumber.from(0);

    for (let startId = 1; startId < totalCovers; startId += coversPerTx) {
      const endId = Math.min(startId + coversPerTx - 1, totalCovers);
      const coverIds = [];
      for (let i = startId; i <= endId; i++) {
        coverIds.push(i);
      }

      const tx = await this.cover.migrateCoverDataAndPoolAllocations(coverIds);
      const txReceipt = await tx.wait();

      await sleep(1000);

      const weiSpent = txReceipt.gasUsed.mul(gasPriceWei);
      console.log('eth spent for ids from %s to %s: %s', startId, endId, ethers.utils.formatEther(weiSpent));
      totalWei = totalWei.add(weiSpent);
    }

    console.log('total ETH needed: %s', ethers.utils.formatEther(totalWei));
  });
});
