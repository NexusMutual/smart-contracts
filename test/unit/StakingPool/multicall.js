const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther } = ethers.utils;
const { DIVIDE_BY_ZERO } = require('../utils').errors;

describe('Multicall unit tests', function () {
  it('should bubble up empty custom error signatures', async function () {
    const { multicall } = this;
    const calldata = multicall.interface.encodeFunctionData('emptyCustomError');
    await expect(multicall.multicall([calldata])).to.be.revertedWithCustomError(multicall, 'EmptyCustomError');
  });

  it('should bubble up custom error with 32 byte uint value', async function () {
    const { multicall } = this;
    const calldata = multicall.interface.encodeFunctionData('uintCustomError', [parseEther('3459802')]);
    await expect(multicall.multicall([calldata])).to.be.revertedWithCustomError(multicall, 'UintCustomError', [
      calldata,
    ]);
  });

  it('should bubble up 32 byte string revert messages', async function () {
    const { multicall } = this;
    const calldata = multicall.interface.encodeFunctionData('stringRevert32');
    await expect(multicall.multicall([calldata])).to.be.revertedWith('String revert');
  });

  it('should bubble up 64 byte string revert messages', async function () {
    const { multicall } = this;
    const calldata = multicall.interface.encodeFunctionData('stringRevert64');
    await expect(multicall.multicall([calldata])).to.be.revertedWith(
      '012345678901234567890123456789012345678901234567890123456789001234567890',
    );
  });

  it('should bubble up panic error codes', async function () {
    const { multicall } = this;
    const calldata = multicall.interface.encodeFunctionData('panicError');
    await expect(multicall.multicall([calldata])).to.be.revertedWithPanic(DIVIDE_BY_ZERO);
  });

  it('should bubble up first empty revert messages', async function () {
    const { multicall } = this;
    const calldata = [
      multicall.interface.encodeFunctionData('emptyRevert'),
      multicall.interface.encodeFunctionData('success'),
      multicall.interface.encodeFunctionData('emptyRevert'),
    ];
    await expect(multicall.multicall(calldata)).to.be.revertedWithCustomError(multicall, 'RevertedWithoutReason', 0);
  });

  it('should bubble up empty require messages with correct index', async function () {
    const { multicall } = this;
    const calldata = [
      multicall.interface.encodeFunctionData('success'), // 0
      multicall.interface.encodeFunctionData('success'), // 1
      multicall.interface.encodeFunctionData('emptyRequire'), // 2
    ];
    await expect(multicall.multicall(calldata)).to.be.revertedWithCustomError(multicall, 'RevertedWithoutReason', 2);
  });
});
