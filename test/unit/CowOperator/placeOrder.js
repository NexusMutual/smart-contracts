const { contracts } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain, computeOrderUid } = require('@gnosis.pm/gp-v2-contracts');
const { setEtherBalance } = require('../../utils/evm');

const {
  BigNumber,
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes, hexlify, randomBytes, isHexString, hexDataLength },
} = ethers;

const hashUtf = str => keccak256(toUtf8Bytes(str));

describe('placeOrder', function () {
  let signer, otherSigner;

  let order, contractOrder, domainHash, orderUID;

  let dai, weth, pool, swapOperator, twap, cowSettlement, cowVaultRelayer;

  beforeEach(async () => {
    [signer, otherSigner] = await ethers.getSigners();

    // Assign contracts (destructuring isn't working)
    dai = contracts.dai;
    weth = contracts.weth;
    pool = contracts.pool;
    swapOperator = contracts.swapOperator;
    twap = contracts.twap;
    cowSettlement = contracts.cowSettlement;
    cowVaultRelayer = contracts.cowVaultRelayer;

    // Build order struct, domain separator and calculate UID
    order = {
      sellToken: weth.address,
      buyToken: dai.address,
      sellAmount: parseEther('0.999'),
      buyAmount: parseEther('3000'),
      validTo: Math.floor(new Date().getTime() / 1000 + 3600),
      appData: hexZeroPad(0, 32),
      feeAmount: parseEther('0.001'),
      kind: 'sell',
      receiver: swapOperator.address,
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    contractOrder = {
      ...order,
      kind: hashUtf(order.kind),
      sellTokenBalance: hashUtf(order.sellTokenBalance),
      buyTokenBalance: hashUtf(order.buyTokenBalance),
    };

    const { chainId } = await ethers.provider.getNetwork();
    const _domain = domain(chainId, cowSettlement.address);
    domainHash = ethers.utils._TypedDataEncoder.hashDomain(_domain);
    orderUID = computeOrderUid(_domain, order, order.receiver);

    // Fund the pool contract
    await setEtherBalance(pool.address, parseEther('100'));

    // Set price in oracle
    await (await twap.addPrice(weth.address, dai.address, 5000 * 10000)).wait(); // 1 weth = 5000 dai
  });

  it('is callable only by swap controller', async function () {
    // call with non-controller, should fail
    await expect(
      contracts.swapOperator.connect(otherSigner).placeOrder(contractOrder, domainHash, orderUID),
    ).to.revertedWith('Only controller');

    // call with controller, should succeed
    await expect(
      contracts.swapOperator.connect(signer).placeOrder(contractOrder, domainHash, orderUID),
    ).to.not.be.reverted;
  });

  it('computes order UID on-chain and validates against passed value', async function () {
    // call with invalid UID, should fail
    const wrongUID = hexlify(randomBytes(56));
    await expect(
      contracts.swapOperator.connect(signer).placeOrder(contractOrder, domainHash, wrongUID),
    ).to.revertedWith('Provided UID doesnt match calculated UID');

    // call with invalid struct, with each individual field modified, should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const makeWrongValue = (value) => {
        if (isHexString(value)) {
          return hexlify(randomBytes(hexDataLength(value)));
        } else if (value instanceof BigNumber) {
          return value.add(1);
        } else if (typeof (value) === 'number') {
          return value + 1;
        } else if (typeof (value) === 'boolean') {
          return !value;
        } else {
          throw new Error(`Unsupported value while fuzzing order: ${value}`);
        }
      };
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      await expect(
        contracts.swapOperator.connect(signer).placeOrder(wrongOrder, domainHash, orderUID),
      ).to.revertedWith('Provided UID doesnt match calculated UID');
    }

    // call with valid order and UID, should succeed
    await expect(
      contracts.swapOperator.connect(signer).placeOrder(contractOrder, domainHash, orderUID),
    ).to.not.be.reverted;
  });

});
