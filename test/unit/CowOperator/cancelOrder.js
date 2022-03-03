const { contracts, makeWrongValue } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@gnosis.pm/gp-v2-contracts');
const { setEtherBalance } = require('../../utils/evm');

const {
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes },
} = ethers;

const hashUtf = str => keccak256(toUtf8Bytes(str));

describe('cancelOrder', function () {
  let signer, otherSigner;

  let order, contractOrder, domain, domainHash, orderUID;

  let dai, weth, pool, swapOperator, cowSettlement, cowVaultRelayer, twap;

  beforeEach(async () => {
    [signer, otherSigner] = await ethers.getSigners();

    // Assign contracts (destructuring isn't working)
    dai = contracts.dai;
    weth = contracts.weth;
    pool = contracts.pool;
    swapOperator = contracts.swapOperator;
    cowSettlement = contracts.cowSettlement;
    cowVaultRelayer = contracts.cowVaultRelayer;
    twap = contracts.twap;

    // Build order struct, domain separator and calculate UID
    order = {
      sellToken: weth.address,
      buyToken: dai.address,
      sellAmount: parseEther('0.999'),
      buyAmount: parseEther('3000'),
      validTo: Math.floor(new Date().getTime() / 1000 + 650),
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
    domain = makeDomain(chainId, cowSettlement.address);
    domainHash = ethers.utils._TypedDataEncoder.hashDomain(domain);
    orderUID = computeOrderUid(domain, order, order.receiver);

    // Fund the pool contract
    await setEtherBalance(pool.address, parseEther('100'));

    // Set price in oracle
    await (await twap.addPrice(weth.address, dai.address, 5000 * 10000)).wait(); // 1 weth = 5000 dai

    // place order
    await swapOperator.placeOrder(contractOrder, domainHash, orderUID);
  });

  it('is callable only by swap controller', async function () {
    // call with non-controller, should fail
    await expect(
      contracts.swapOperator.connect(otherSigner).cancelOrder(contractOrder, domainHash),
    ).to.revertedWith('SwapOp: only controller can execute');

    // call with controller, should succeed
    await expect(
      contracts.swapOperator.connect(signer).cancelOrder(contractOrder, domainHash),
    ).to.not.be.reverted;
  });

  it('computes order UID on-chain and validates against placed order UID', async function () {
    // the contract's currentOrderUID is the one for the placed order in beforeEach step
    // we call with multiple invalid orders, with each individual field modified. it should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      await expect(
        contracts.swapOperator.connect(signer).placeOrder(wrongOrder, domainHash, orderUID),
      ).to.revertedWith('SwapOp: Provided UID doesnt match calculated UID');
    }

    // call with an order that matches currentOrderUID, should succeed
    await expect(
      contracts.swapOperator.connect(signer).cancelOrder(contractOrder, domainHash),
    ).to.not.be.reverted;
  });

  it('validates that theres an order in place', async function () {
    // cancel the current order, leaving no order in place
    await expect(swapOperator.cancelOrder(contractOrder, domainHash)).to.not.be.reverted;

    await expect(swapOperator.cancelOrder(contractOrder, domainHash)).to.be.revertedWith('SwapOp: No order in place');
  });

  it('validates the swap was executed', async function () {
    // if it was executed, then buyToken balance should be >= buyAmount
    // set balance to be 1 wei short
    await dai.mint(swapOperator.address, contractOrder.buyAmount.sub(1));

    await expect(swapOperator.cancelOrder(contractOrder, domainHash)).to.be.revertedWith('SwapOp: Order was not executed');

  });
});
