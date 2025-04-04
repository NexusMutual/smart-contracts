const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('cover-edits', function () {
  it('estimate gas usage for cover data migration', async function () {
    const gasPriceWei = 1e9; // 1 gwei
    const totalCovers = await this.cover.getCoverDataCount();
    const coversPerTx = 100;

    const coverIds = [];
    const startId = totalCovers - coversPerTx - 1;
    for (let i = 0; i < coversPerTx; i++) {
      coverIds.push(startId + i);
    }

    const tx = await this.cover.migrateCoverDataAndPoolAllocations(coverIds, { gasLimit: 15000000 });
    const txReceipt = await tx.wait();

    const txsNeeded = Math.ceil(totalCovers / coversPerTx);

    const weiPerTx = txReceipt.gasUsed.mul(gasPriceWei);
    const totalWei = weiPerTx.mul(txsNeeded);

    console.log('gas price: %s gwei', gasPriceWei / 1e9);
    console.log('num covers per tx: %s', coversPerTx);
    console.log('gas used per tx: %s', txReceipt.gasUsed.toString());
    console.log('ETH per tx: %s', ethers.utils.formatEther(weiPerTx));
    console.log('txs num for %s covers: %s', totalCovers, txsNeeded);
    console.log('total ETH needed: %s', ethers.utils.formatEther(totalWei));
  });

  it.skip('calculate total gas for cover data migration', async function () {
    const gasPriceWei = 1e9; // 1 gwei
    const totalCovers = await this.cover.getCoverDataCount();
    const coversPerTx = 100;

    let totalWei = BigNumber.from(0);

    for (let startId = 1; startId < totalCovers; startId += coversPerTx) {
      const endId = Math.min(startId + coversPerTx - 1, totalCovers);
      const coverIds = [];
      for (let i = startId; i <= endId; i++) {
        coverIds.push(i);
      }

      const tx = await this.cover.migrateCoverDataAndPoolAllocations(coverIds, { gasLimit: 15000000 });
      const txReceipt = await tx.wait();

      const weiSpent = txReceipt.gasUsed.mul(gasPriceWei);
      console.log('eth spent for ids from %s to %s: %s', startId, endId, ethers.utils.formatEther(weiSpent));
      totalWei = totalWei.add(weiSpent);
    }

    console.log('total ETH needed: %s', ethers.utils.formatEther(totalWei));
  });
});
