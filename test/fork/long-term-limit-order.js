const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');

const {
  Address,
  EnzymeAdress,
  V2Addresses,
  formatInternalContracts,
  getSigner,
  submitGovernanceProposal,
} = require('./utils');
const { ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const evm = require('./evm')();

const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

const GNOSIS_SAFE_ADDRESS = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';

function assertionErrorMsg(key, parentKey) {
  return `AssertionError: values of ${key}${parentKey ? ` in ${parentKey}` : ''} don't match\n`;
}

describe('long-term-limit-orders', function () {
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
    this.coverProducts = await ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
    this.poolBefore = await ethers.getContractAt(abis.Pool, addresses.Pool);
    this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
    this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
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
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
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

  it('Collect storage data before upgrade', async function () {
    this.poolData = { before: {}, after: {} };

    // Pool
    this.poolData.before.value = await this.poolBefore.getPoolValueInEth();
    this.poolData.before.ethBalance = await ethers.provider.getBalance(this.poolBefore.address);
    this.poolData.before.daiBalance = await this.dai.balanceOf(this.poolBefore.address);
    this.poolData.before.stEthBalance = await this.stEth.balanceOf(this.poolBefore.address);
    this.poolData.before.rEthBalance = await this.rEth.balanceOf(this.poolBefore.address);
    this.poolData.before.enzymeSharesBalance = await this.enzymeShares.balanceOf(this.poolBefore.address);

    const assets = (await this.poolBefore.getAssets()).map(([address]) => address);
    const assetSwapDetails = await Promise.all(assets.map(address => this.poolBefore.getAssetSwapDetails(address)));
    this.poolData.before.assets = assets;
    this.poolData.before.minPoolEth = await this.swapOperator.minPoolEth();
    this.poolData.before.assetSwapDetails = assets.reduce((acc, asset, i) => {
      return { ...acc, [asset]: assetSwapDetails[i] };
    }, {});
  });

  it('Deploy new SwapOperator', async function () {
    this.swapOperator = await ethers.deployContract('SwapOperator', [
      Address.COWSWAP_SETTLEMENT, // _cowSettlement
      Address.SWAP_CONTROLLER, // _swapController
      this.master.address, // _master
      Address.WETH_ADDRESS, // _weth
      EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS,
      GNOSIS_SAFE_ADDRESS, // _safe
      Address.DAI_ADDRESS, // _dai
      Address.USDC_ADDRESS, // _usdc
      EnzymeAdress.ENZYME_FUND_VALUE_CALCULATOR_ROUTER,
      0, // Min Pool ETH
    ]);
  });

  it('Upgrade contracts', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // Pool.sol
    const pool = await ethers.deployContract('Pool', [
      this.master.address,
      this.priceFeedOracle.address,
      this.swapOperator.address,
      this.nxm.address,
      this.poolBefore.address,
    ]);

    const contractCodeAddressMapping = {
      [ContractCode.Pool]: pool.address,
    };
    // NOTE: Do not manipulate the map between Object.keys and Object.values otherwise the ordering could go wrong
    const codes = Object.keys(contractCodeAddressMapping).map(code => toUtf8Bytes(code));
    const addresses = Object.values(contractCodeAddressMapping);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    console.info('Upgrade Contracts before:', formatInternalContracts(contractsBefore));
    console.info('Upgrade Contracts after:', formatInternalContracts(contractsAfter));

    // Set references to proxy contracts
    this.pool = await getContractByContractCode('Pool', ContractCode.Pool);
  });

  it('Compares storage of upgraded Pool contract', async function () {
    const { assets: beforeAssets, minPoolEth: beforeMinPoolEth } = this.poolData.before;
    const afterAssetsDataArray = await Promise.all(beforeAssets.map(address => this.pool.swapDetails(address)));
    const afterAssetsData = beforeAssets.reduce((acc, asset, i) => ({ ...acc, [asset]: afterAssetsDataArray[i] }), {});
    const afterMinPoolEth = await this.swapOperator.minPoolEth();

    expect(afterMinPoolEth, assertionErrorMsg('minPoolEth')).to.be.equal(beforeMinPoolEth);

    Object.entries(this.poolData.before.assetSwapDetails).forEach(([asset, before]) => {
      const { minAmount, maxAmount, lastSwapTime, maxSlippageRatio } = afterAssetsData[asset];
      expect(lastSwapTime, assertionErrorMsg('lastSwapTime', asset)).to.be.oneOf([before.lastSwapTime, 0]);
      expect(minAmount, assertionErrorMsg('minAmount', asset)).to.be.equal(before.minAmount);
      expect(maxAmount, assertionErrorMsg('maxAmount', asset)).to.be.equal(before.maxAmount);
      expect(maxSlippageRatio, assertionErrorMsg('maxSlippageRatio', asset)).to.be.equal(before.maxSlippageRatio);
    });
  });

  require('./basic-functionality-tests');
});
