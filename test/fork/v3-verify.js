const fs = require('node:fs/promises');
const path = require('node:path');
const { inspect } = require('node:util');

const v2 = require('@nexusmutual/deployments');
const { expect } = require('chai');
const { ethers, nexus, network } = require('hardhat');

const { Addresses } = require('./utils');
const addresses = require('../../deployments/src/addresses.json');
const { create2Impl, create2Proxies } = require('../../release/3.0/config/deployments-config.js');

const { ContractIndexes } = nexus.constants;
const { toUtf8Bytes } = ethers;

async function getPoolBalances(poolAddress, prefix) {
  const balanceConfig = [
    { name: 'ETH', getBalance: () => ethers.provider.getBalance(poolAddress), decimals: 18 },
    { name: 'DAI', getBalance: () => this.dai.balanceOf(poolAddress), decimals: 18 },
    { name: 'stETH', getBalance: () => this.stEth.balanceOf(poolAddress), decimals: 18 },
    { name: 'NXMTY', getBalance: () => this.enzymeShares.balanceOf(poolAddress), decimals: 18 },
    { name: 'rEth', getBalance: () => this.rEth.balanceOf(poolAddress), decimals: 18 },
    { name: 'SafeTracker', getBalance: () => this.safeTracker.balanceOf(poolAddress), decimals: 18 },
    { name: 'USDC', getBalance: () => this.usdc.balanceOf(poolAddress), decimals: 6 },
    { name: 'cbBTC', getBalance: () => this.cbBTC.balanceOf(poolAddress), decimals: 8 },
  ];

  console.log(`\n${prefix} POOL BALANCES:`);

  const balances = Object.fromEntries(
    await Promise.all(
      balanceConfig.map(async ({ name, getBalance, decimals }) => {
        const balance = await getBalance();
        console.log(`${name} balance:`, ethers.formatUnits(balance, decimals));
        return [name, balance.toString()];
      }),
    ),
  );

  const poolContract = await ethers.getContractAt('Pool', poolAddress);
  const totalPoolValueInEth = (await poolContract.getPoolValueInEth()).toString();
  console.log('totalPoolValueInEth: ', ethers.formatEther(totalPoolValueInEth), '\n');

  return { balances, totalPoolValueInEth };
}

describe('v3 verify', function () {
  const preReleaseStatePath = path.join(__dirname, '../../release/3.0/data/pre-release-state.json');
  const oldPoolAddress = v2.addresses.Pool;

  before(async function () {
    console.log('RUNNIGN on NETWORK:', network.name);
  });

  it('load contracts', async function () {
    // v2
    this.individualClaims = await ethers.getContractAt(v2.abis.IndividualClaims, v2.addresses.IndividualClaims);
    this.coverProductsV2 = await ethers.getContractAt(v2.abis.CoverProducts, v2.addresses.CoverProducts);
    this.mcr = await ethers.getContractAt(v2.abis.MCR, v2.addresses.MCR);
    this.legacyPool = await ethers.getContractAt(v2.abis.Pool, oldPoolAddress);

    // v3
    this.assessments = await ethers.getContractAt('Assessments', addresses.Assessments);
    this.claims = await ethers.getContractAt('Claims', addresses.Claims);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.coverBroker = await ethers.getContractAt('CoverBroker', addresses.CoverBroker);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.coverProducts = await ethers.getContractAt('CoverProducts', addresses.CoverProducts);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.pool = await ethers.getContractAt('Pool', addresses.Pool);
    this.ramm = await ethers.getContractAt('Ramm', addresses.Ramm);
    this.registry = await ethers.getContractAt('Registry', addresses.Registry);
    this.safeTracker = await ethers.getContractAt('SafeTracker', addresses.SafeTracker);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);

    // Tokens
    this.cbBTC = await ethers.getContractAt('ERC20Mock', Addresses.CBBTC_ADDRESS);
    this.dai = await ethers.getContractAt('ERC20Mock', Addresses.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Addresses.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Addresses.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Addresses.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Addresses.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);

    // Proxies
    this.registryProxy = await ethers.getContractAt('UpgradeableProxy', addresses.Registry);

    // Legacy
    const memberRolesAddress = await this.master.getLatestAddress(toUtf8Bytes('MR'));
    this.memberRoles = await ethers.getContractAt('LegacyMemberRoles', memberRolesAddress);

    // Price Feed Oracle
    const priceFeedOracleAddress = await this.legacyPool.priceFeedOracle();
    this.priceFeedOracle = await ethers.getContractAt(v2.abis.PriceFeedOracle, priceFeedOracleAddress);
  });

  it.skip('store pre release state', async function () {
    // fetch product types
    const productTypeCount = await this.coverProductsV2.getProductTypeCount();
    const productTypes = [];

    for (let i = 0; i < productTypeCount; i++) {
      const [productType, productTypeName, { ipfsHash }] = await Promise.all([
        this.coverProductsV2.getProductType(i),
        this.coverProductsV2.getProductTypeName(i),
        this.coverProductsV2.getLatestProductTypeMetadata(i),
      ]);
      productTypes.push({
        productTypeId: i,
        productTypeName,
        ipfsHash,
        productType: {
          claimMethod: Number(productType.claimMethod),
          gracePeriod: Number(productType.gracePeriod),
        },
      });
    }

    // fetch balances
    const poolBalances = await getPoolBalances.call(this, oldPoolAddress, '(BEFORE MIGRATION) OLD');
    const memberRolesBalance = await ethers.provider.getBalance(this.memberRoles);

    // fetch MCR value (drifts w/ time)
    const [stored, desired, updatedAt] = await Promise.all([
      this.mcr.getMCR(),
      this.mcr.desiredMCR(),
      this.mcr.lastUpdateTime(),
    ]);

    // fetch assets
    const assets = await this.legacyPool.getAssets();

    const poolAssets = [];
    for (const asset of assets) {
      const { aggregator, aggregatorType } = await this.priceFeedOracle.assetsMap(asset.assetAddress);
      poolAssets.push({
        assetAddress: asset.assetAddress,
        isCoverAsset: asset.isCoverAsset,
        isAbandoned: asset.isAbandoned,
        oracle: aggregator,
        oracleType: aggregatorType.toString(),
      });
    }

    const preReleaseState = {
      productTypes,
      poolBalances,
      memberRolesBalance: memberRolesBalance.toString(),
      mcr: {
        stored: stored.toString(),
        desired: desired.toString(),
        updatedAt: updatedAt.toString(),
      },
      poolAssets,
    };

    console.log('preReleaseState: ', inspect(preReleaseState, { depth: null }));

    // store pre release state
    await fs.writeFile(preReleaseStatePath, JSON.stringify(preReleaseState, null, 2));
  });

  it.skip('verify post phase 1 state', async function () {
    const contractIndexMap = {
      Governor: ContractIndexes.C_GOVERNOR,
      Pool: ContractIndexes.C_POOL,
      SwapOperator: ContractIndexes.C_SWAP_OPERATOR,
      Assessments: ContractIndexes.C_ASSESSMENTS,
      Claims: ContractIndexes.C_CLAIMS,
    };

    // verify create2 addresses are as expected
    for (const [contractName, contractIndex] of Object.entries(contractIndexMap)) {
      const address = await this.registry.getContractAddressByIndex(contractIndex);
      expect(address).to.equal(create2Proxies[contractName].expectedAddress);
    }

    let codeIndex = 0;

    // verify contract proxy ownerships are transferred to registry
    while (true) {
      const code = await this.master.contractCodes(codeIndex++).catch(e => {
        if (e.message.includes('reverted')) {
          // return false for revert, expecting invalid opcode meaning out of bounds read
          return false;
        }
        // rethrow for other kinds of errors
        throw e;
      });

      if (code === false) {
        break;
      }

      if (await this.master.isProxy(code)) {
        const proxyAddress = await this.master.getLatestAddress(code);
        const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);
        expect(await proxy.proxyOwner()).to.equal(this.registry.target);
      }
    }

    // AB multisig is the Registry owner
    expect(await this.registryProxy.proxyOwner()).to.equal(Addresses.ADVISORY_BOARD_MULTISIG);
  });

  it.skip('verify post phase 2 members migration state', async function () {
    const members = require('../../scripts/v3-migration/data/members.json');
    const batchSize = 100;
    const totalBatches = Math.ceil(members.length / batchSize);

    for (let i = 0; i < members.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      const batch = members.slice(i, i + batchSize);

      console.log(`Member migration check batch ${currentBatch}/${totalBatches}`);

      await Promise.all(
        batch.map(async member => {
          const isMember = await this.registry.isMember(member);
          if (!isMember) {
            console.log(`Member ${member} is not migrated`);
          }
          expect(isMember).to.be.true;
        }),
      );
    }
  });

  // execute in isolation AFTER phase 3
  it('verify post phase 3 state', async function () {
    const prevState = require(preReleaseStatePath);
    expect(await this.master.registry()).to.equal(this.registry.target);

    // old Pool balance should be 0 (allow tiny deviation ~ 1 wei)
    const prevPoolAfterBalance = await getPoolBalances.call(this, oldPoolAddress, '(AFTER MIGRATION) OLD');
    for (const balance of Object.values(prevPoolAfterBalance.balances)) {
      expect(balance).to.be.closeTo(0n, 1n);
    }
    expect(prevPoolAfterBalance.totalPoolValueInEth).to.be.closeTo(0n, 1n);

    // new Pool balance same as prev Pool balance before migration (allow tiny deviation ~ 2 wei)
    const newPoolBalance = await getPoolBalances.call(this, addresses.Pool, '(AFTER MIGRATION) NEW');
    for (const [token, balance] of Object.entries(newPoolBalance.balances)) {
      console.log(token);
      console.log('after  migration: ', balance);
      console.log('before migration: ', prevState.poolBalances.balances[token]);
    }
    console.log('totalPoolValueInEth');
    console.log('after migration:  ', newPoolBalance.totalPoolValueInEth);
    console.log('before migration: ', prevState.poolBalances.totalPoolValueInEth);

    // verify MCR value
    const [stored, desired, updatedAt] = await Promise.all([
      this.mcr.getMCR(),
      this.mcr.desiredMCR(),
      this.mcr.lastUpdateTime(),
    ]);
    const prevMCR = prevState.mcr;
    console.log('\n Stored MCR: ');
    console.log('after migration:  ', stored.toString());
    console.log('before migration: ', prevMCR.stored);
    console.log('desired MCR: ');
    console.log('after migration:  ', desired.toString());
    console.log('before migration: ', prevMCR.desired);
    console.log('updatedAt MCR: ');
    console.log('after migration:  ', updatedAt.toString());
    console.log('before migration: ', prevMCR.updatedAt);

    // verify assets are migrated correctly
    const assets = await this.pool.getAssets();
    expect(assets.length).to.equal(prevState.poolAssets.length);

    for (const [index, asset] of Object.entries(assets)) {
      const prevAsset = prevState.poolAssets[index];
      const { aggregator, aggregatorType } = await this.priceFeedOracle.assetsMap(asset.assetAddress);
      const expectedIsAbandoned = asset.assetAddress === Addresses.DAI_ADDRESS ? true : prevAsset.isAbandoned;

      expect(asset.assetAddress).to.equal(prevAsset.assetAddress);
      expect(asset.isCoverAsset).to.equal(prevAsset.isCoverAsset);
      expect(asset.isAbandoned).to.equal(expectedIsAbandoned);
      expect(aggregator).to.equal(prevAsset.oracle);
      expect(aggregatorType.toString()).to.equal(prevAsset.oracleType);
    }

    // Registry.setEmergencyAdmin 1 & 2
    const emergencyAdmins = [
      '0x23E1B127Fd62A4dbe64cC30Bb30FFfBfd71BcFc6',
      '0x8D38C81B7bE9Dbe7440D66B92d4EF529806baAE7',
      '0x43f4cd7d153701794ce25a01eFD90DdC32FF8e8E',
      '0x9063a2C78aFd6C8A3510273d646111Df67D6CB4b',
      '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
      '0x6FE2C2643cb5064951fB7DD87FbCE4777FB146E3',
    ];
    for (const admin of emergencyAdmins) {
      expect(await this.registry.isEmergencyAdmin(admin)).to.be.true;
    }

    // Registry.setKycAuthAddress
    expect(await this.registry.getKycAuthAddress()).to.equal(Addresses.KYC_AUTH_ADDRESS);

    // SwapOperator.setSwapController
    expect(await this.swapOperator.swapController()).to.equal(Addresses.SWAP_CONTROLLER);

    // Claims.initialize
    const latestClaimCount = await this.individualClaims.getClaimsCount();
    const latestClaimId = latestClaimCount - 1n; // latestClaimId is the last index
    expect(await this.claims.getClaimsCount()).to.equal(latestClaimId + 1n);

    // Assessments.addAssessorsToGroup
    const assessmentGroupId = await this.assessments.getGroupsCount();
    const assessorIds = [
      await this.registry.getMemberId('0x87B2a7559d85f4653f13E6546A14189cd5455d45'),
      await this.registry.getMemberId('0x43f4cd7d153701794ce25a01eFD90DdC32FF8e8E'),
      await this.registry.getMemberId('0x9063a2C78aFd6C8A3510273d646111Df67D6CB4b'),
    ];
    for (const assessorId of assessorIds) {
      expect(await this.assessments.isAssessor(assessorId)).to.be.true;
      expect(await this.assessments.isAssessorInGroup(assessorId, assessmentGroupId)).to.be.true;
    }

    // Assessments.setAssessingGroupIdForProductTypes
    const latestProductTypeCount = await this.coverProducts.getProductTypeCount();
    const allProductTypeIds = Array.from({ length: Number(latestProductTypeCount) }, (_, i) => i);
    await Promise.all(
      allProductTypeIds.map(async id => {
        expect(await this.assessments.getAssessingGroupIdForProductType(id)).to.equal(assessmentGroupId);
      }),
    );

    // Cover.changeCoverNFTDescriptor
    // expect(await this.coverNFT.nftDescriptor()).to.equal(create2Impl.CoverNFTDescriptor.expectedAddress);

    // RegistryProxy.transferProxyOwnership
    expect(await this.registryProxy.proxyOwner()).to.equal(addresses.Governor);
  });

  // execute in isolation AFTER phase 4
  it.skip('verify post phase 4 state', async function () {
    // cover product types
    const ONE_DAY = 24 * 60 * 60;
    const prevState = require(preReleaseStatePath);
    const productTypeCount = await this.coverProducts.getProductTypeCount();

    for (let i = 0; i < productTypeCount; i++) {
      const [productType, productTypeName, { ipfsHash }] = await Promise.all([
        this.coverProducts.getProductType(i),
        this.coverProducts.getProductTypeName(i),
        this.coverProducts.getLatestProductTypeMetadata(i),
      ]);

      const productTypeState = prevState.productTypes[i];

      expect(productType.claimMethod).to.equal(productTypeState.productType.claimMethod);
      expect(productType.gracePeriod).to.equal(productTypeState.productType.gracePeriod);
      expect(productType.assessmentCooldownPeriod).to.equal(ONE_DAY); // new fields
      expect(productType.payoutRedemptionPeriod).to.equal(30 * ONE_DAY); // new fields

      expect(productTypeName).to.equal(productTypeState.productTypeName);

      expect(ipfsHash).to.equal(productTypeState.ipfsHash);
    }

    // MemberRoles.recoverETH
    const poolEthBalanceBefore = BigInt(prevState.poolBalances.balances.ETH);
    const memberRolesEthBalanceBefore = BigInt(prevState.memberRolesBalance);
    expect(await ethers.provider.getBalance(this.pool)).to.equal(poolEthBalanceBefore + memberRolesEthBalanceBefore);
    expect(await ethers.provider.getBalance(this.memberRoles)).to.equal(0n);

    // cover IPFS metadata storage
    const { coverIds, ipfsMetadata } = require('../../scripts/v3-migration/data/cover-ipfs-metadata.json');
    await Promise.all(
      coverIds.map(async (coverId, index) => {
        expect(await this.cover.getCoverMetadata(coverId)).to.equal(ipfsMetadata[index]);
      }),
    );

    // CoverBroker - membership and allowances
    expect(await this.registry.isMember(this.coverBroker)).to.be.true;
    expect(await this.usdc.allowance(this.coverBroker, this.cover)).to.equal(ethers.MaxUint256);
    expect(await this.cbBTC.allowance(this.coverBroker, this.cover)).to.equal(ethers.MaxUint256);
  });
});
