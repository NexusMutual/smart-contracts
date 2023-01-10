const fs = require('fs');
const { artifacts, ethers } = require('hardhat');
const { expect } = require('chai');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');

const newPoolFixture = {
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  productInitializationParams: [
    {
      productId: 0,
      weight: 100,
      initialPrice: '500',
      targetPrice: '500',
    },
  ],
  ipfsDescriptionHash: 'Description Hash',
};

describe('createStakingPool', function () {

  it('reverts if system is paused', async function () {
    const { cover, master } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    await master.setEmergencyPause(true);

    await expect(
      cover.connect(stakingPoolCreator).createStakingPool(
        stakingPoolManager.address,
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        '', // ipfsDescriptionHash
      )).to.be.revertedWith('System is paused');
  });

  it('should create and initialize a new pool minimal beacon proxy pool', async function () {
    const { cover, stakingPoolFactory } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    // beacon proxy init code hash
    const stakingLibraryPath = 'contracts/libraries/StakingPoolLibrary.sol';
    const stakingLibrary = fs.readFileSync(stakingLibraryPath, 'utf8').toString();
    const hardcodedInitCodeHash = stakingLibrary.match(/hex'([0-9a-f]+)' \/\/ init code hash/i)[1];

    const { bytecode: proxyBytecode } = await artifacts.readArtifact('MinimalBeaconProxy');
    const requiredHash = bytesToHex(keccak256(hexToBytes(proxyBytecode.replace(/^0x/i, ''))));

    // we're skipping this expect test when running the coverage
    // solidity-coverage instrumentation modifies the contract code so we manually patched the
    // bytecode of the contracts that are using the library. if the cover bytecode contains the
    // hardcoded init code hash (i.e. not patched) - we're not in coverage
    const { bytecode: coverBytecode } = await artifacts.readArtifact('Cover');

    if (coverBytecode.includes(hardcodedInitCodeHash)) {
      expect(hardcodedInitCodeHash).to.equal(
        requiredHash,
        'StakingPoolLibrary does not contain the actual MinimalBeaconProxy init code hash',
      );
    }

    const poolId = 0;
    const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
    const initCodeHash = Buffer.from(requiredHash, 'hex');
    const expectedAddress = ethers.utils.getCreate2Address(stakingPoolFactory.address, salt, initCodeHash);

    // calculated address check
    const reportedAddress = await cover.stakingPool(poolId);
    expect(reportedAddress).to.be.equal(expectedAddress);

    const tx = await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    // actual address check
    await expect(tx).to.emit(stakingPoolFactory, 'StakingPoolCreated').withArgs(poolId, expectedAddress);

    const proxyInstance = await ethers.getContractAt('MinimalBeaconProxy', expectedAddress);
    const beacon = await proxyInstance.beacon();
    expect(beacon).to.be.equal(cover.address);

    const stakingPoolInstance = await ethers.getContractAt('CoverMockStakingPool', expectedAddress);

    const storedManager = await stakingPoolInstance.manager();
    expect(storedManager).to.be.equal(stakingPoolManager.address);

    // validate variable is initialized
    const contractPoolId = await stakingPoolInstance.poolId();
    expect(contractPoolId).to.be.equal(poolId);
  });

  it('allows anyone to create a new pool', async function () {
    const { cover } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.generalPurpose;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;
    const poolId = 0;

    const firstStakingPoolAddress = await cover.stakingPool(poolId);

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      '', // ipfsDescriptionHash
    );

    const stakingPoolInstance = await ethers.getContractAt('IStakingPool', firstStakingPoolAddress);
    const storedManager = await stakingPoolInstance.manager();
    expect(storedManager).to.be.equal(stakingPoolManager.address);
  });

  it('emits StakingPoolCreated event', async function () {
    const { cover, stakingPoolFactory } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    const tx = await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    const poolId = 0;
    const expectedSPAddress = await cover.stakingPool(poolId);
    await expect(tx).to.emit(stakingPoolFactory, 'StakingPoolCreated').withArgs(poolId, expectedSPAddress);
  });

  it('increments staking pool count', async function () {
    const { cover, stakingPoolFactory } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    const stakingPoolCountBefore = await stakingPoolFactory.stakingPoolCount();

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      '', // ipfsDescriptionHash
    );

    const stakingPoolCountAfter = await stakingPoolFactory.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));
  });
});
