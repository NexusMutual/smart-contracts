const { expect } = require('chai');
const { ethers, nexus } = require('hardhat');

const { ContractIndexes } = nexus.constants;
const { keccak256, toUtf8Bytes, concat, zeroPadValue } = ethers;

describe('constructor', function () {
  it('should set variables correctly', async function () {
    const coverNFT = '0x0000000000000000000000000000000000000001';
    const pool = '0x0000000000000000000000000000000000000002';
    const stakingNFT = '0x0000000000000000000000000000000000000003';
    const stakingPoolFactory = '0x0000000000000000000000000000000000000004';
    const stakingPoolImplementation = '0x0000000000000000000000000000000000000005';
    const tokenController = '0x0000000000000000000000000000000000000006';
    const verifyingContract = '0x0000000000000000000000000000000000000007';

    const registry = await ethers.deployContract('RegistryMock');
    await registry.addContract(ContractIndexes.C_COVER_NFT, coverNFT, true);
    await registry.addContract(ContractIndexes.C_POOL, pool, true);
    await registry.addContract(ContractIndexes.C_STAKING_NFT, stakingNFT, true);
    await registry.addContract(ContractIndexes.C_STAKING_POOL_FACTORY, stakingPoolFactory, true);
    await registry.addContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenController, true);

    const Cover = await ethers.getContractFactory('Cover');
    const cover = await Cover.deploy(registry, stakingPoolImplementation, verifyingContract);

    expect(await cover.coverNFT()).to.equal(coverNFT);
    expect(await cover.pool()).to.equal(pool);
    expect(await cover.stakingNFT()).to.equal(stakingNFT);
    expect(await cover.stakingPoolFactory()).to.equal(stakingPoolFactory);
    expect(await cover.stakingPoolImplementation()).to.equal(stakingPoolImplementation);
    expect(await cover.tokenController()).to.equal(tokenController);

    const chainId = await ethers.provider.send('eth_chainId');
    const hashedName = keccak256(toUtf8Bytes('NexusMutualCover'));
    const hashedVersion = keccak256(toUtf8Bytes('1.0.0'));
    const typeHash = keccak256(
      toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
    );
    const domainSeparator = keccak256(
      concat([typeHash, hashedName, hashedVersion, zeroPadValue(chainId, 32), zeroPadValue(verifyingContract, 32)]),
    );

    expect(await cover.DOMAIN_SEPARATOR()).to.equal(domainSeparator);
  });
});
