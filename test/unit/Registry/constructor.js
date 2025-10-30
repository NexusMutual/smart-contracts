const { ethers } = require('hardhat');
const { expect } = require('chai');

const { concat, keccak256, toUtf8Bytes, zeroPadValue } = ethers;

describe('constructor', () => {
  it('correctly sets the master address and calculates the domain separator', async () => {
    const verifyingContract = '0x0000000000000000000000000000000000000001';
    const master = '0x0000000000000000000000000000000000000002';
    const registry = await ethers.deployContract('Registry', [verifyingContract, master]);

    const hashedName = keccak256(toUtf8Bytes('NexusMutualRegistry'));
    const hashedVersion = keccak256(toUtf8Bytes('1.0.0'));
    const typeHash = keccak256(
      toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
    );

    const chainId = await ethers.provider.send('eth_chainId');

    const domainSeparator = keccak256(
      concat([typeHash, hashedName, hashedVersion, zeroPadValue(chainId, 32), zeroPadValue(verifyingContract, 32)]),
    );

    expect(await registry.master()).to.equal(master);
    expect(await registry.DOMAIN_SEPARATOR()).to.equal(domainSeparator);
  });
});
