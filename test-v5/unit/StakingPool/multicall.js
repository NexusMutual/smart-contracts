const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { DIVIDE_BY_ZERO } = require('../utils').errors;

const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

describe('Multicall unit tests', function () {
  it('should bubble up empty custom error signatures', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const calldata = multicall.interface.encodeFunctionData('emptyCustomError');
    await expect(multicall.multicall([calldata])).to.be.revertedWithCustomError(multicall, 'EmptyCustomError');
  });

  it('should bubble up custom error with 32 byte uint value', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const errorCode = parseEther('3459802');
    const calldata = multicall.interface.encodeFunctionData('uintCustomError', [errorCode]);
    await expect(multicall.multicall([calldata]))
      .to.be.revertedWithCustomError(multicall, 'UintCustomError')
      .withArgs(errorCode);
  });

  it('should bubble up custom error with 32 byte max uint', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const errorCode = MaxUint256;
    const calldata = multicall.interface.encodeFunctionData('uintCustomError', [errorCode]);
    await expect(multicall.multicall([calldata]))
      .to.be.revertedWithCustomError(multicall, 'UintCustomError')
      .withArgs(errorCode);
  });

  it('should bubble up 32 byte string revert messages', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const calldata = multicall.interface.encodeFunctionData('stringRevert32');
    await expect(multicall.multicall([calldata])).to.be.revertedWith('String revert');
  });

  it('should bubble up 64 byte string revert messages', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const calldata = multicall.interface.encodeFunctionData('stringRevert64');
    await expect(multicall.multicall([calldata])).to.be.revertedWith(
      '012345678901234567890123456789012345678901234567890123456789001234567890',
    );
  });

  it('should bubble up 512 byte string revert messages', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const reason = 'A'.repeat(512);
    const calldata = multicall.interface.encodeFunctionData('stringRevertParam', [reason]);
    await expect(multicall.multicall([calldata])).to.be.revertedWith(reason);
  });

  it('should bubble up correct returndata length', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    for (let size = 0; size <= 2048; size += 16) {
      const reason = 'A'.repeat(size);
      await multicall.returndataSizeTest(reason);
    }
  });

  it('should bubble up panic error codes', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const calldata = multicall.interface.encodeFunctionData('panicError');
    await expect(multicall.multicall([calldata])).to.be.revertedWithPanic(DIVIDE_BY_ZERO);
  });

  it('should bubble up first empty revert messages', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const calldata = [
      multicall.interface.encodeFunctionData('emptyRevert'),
      multicall.interface.encodeFunctionData('success'),
      multicall.interface.encodeFunctionData('emptyRevert'),
    ];
    await expect(multicall.multicall(calldata))
      .to.be.revertedWithCustomError(multicall, 'RevertedWithoutReason')
      .withArgs(0);
  });

  it('should bubble up empty require messages with correct index', async function () {
    const fixture = await loadFixture(setup);
    const { multicall } = fixture;
    const calldata = [
      multicall.interface.encodeFunctionData('success'), // 0
      multicall.interface.encodeFunctionData('success'), // 1
      multicall.interface.encodeFunctionData('emptyRequire'), // 2
    ];
    await expect(multicall.multicall(calldata))
      .to.be.revertedWithCustomError(multicall, 'RevertedWithoutReason')
      .withArgs(2);
  });
});
