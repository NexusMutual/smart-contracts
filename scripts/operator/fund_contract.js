const swapOperatorAddress = require('./operatorAddress');
const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');

const main = async () => {
  const signer = (await ethers.getSigners())[0];
  const signerAddress = await signer.getAddress();

  const wethAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  const ierc20 = '@openzeppelin/contracts-v4/token/ERC20/IERC20.sol:IERC20';
  const minBalance = ethers.utils.parseEther('0.005');

  const wethContract = await ethers.getContractAt(ierc20, wethAddress);

  const operatorBalance = await wethContract.balanceOf(swapOperatorAddress);
  const signerBalance = await wethContract.balanceOf(signerAddress);

  console.log({ operatorBalance, signerBalance });

  if (operatorBalance.lt(minBalance)) {
    if (signerBalance.gt(minBalance)) {
      console.log('Sending weth to operator contract');
      await (await wethContract.transfer(swapOperatorAddress, minBalance)).wait();
      console.log('Done');
    } else {
      console.log('not enough weth to send');
    }
  } else {
    console.log('no need to fund');
  }
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
