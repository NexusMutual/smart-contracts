const { ethers } = require('hardhat');
const { setNextBlockTime } = require('./utils/evm');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// THIS DOES NOT REPRO THE ISSUE

describe('time travel test', () => {
  it('should respect desired timestamp', async () => {
    const [signer] = await ethers.getSigners();

    const weth = await ethers.deployContract('WETH9');
    await weth.deployed();

    const initialBlock = await ethers.provider.getBlock('latest');
    console.log('initial block', initialBlock);

    const desiredTimestamp = initialBlock.timestamp + 5;
    await sleep(10000);
    await setNextBlockTime(desiredTimestamp);

    // send 1 eth to self
    const tx = await signer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther('1') });
    const receipt = await tx.wait();

    const finalBlock = await ethers.provider.getBlock('latest');
    console.log('final block', finalBlock);

    console.log('receipt', receipt);
  });
});
