// const { expect } = require('chai');
// const { ethers } = require('hardhat');
// const { parseEther } = ethers.utils;

// describe('calculatePremium', function () {
// const stakedProductTemplate = {
//   lastEffectiveWeight: 50,
//   targetWeight: 70, // 70%
//   targetPrice: 500, // 5%
//   nextPrice: 1000, // 10%
//   nextPriceUpdateTime: 0,
// };
//
// const period = 90;
// const coverAmount = parseEther('100');
// const initialCapacityUsed = 20;
// const totalCapacity = 100;
//
// it('should calculate the premium correctly', async function () {
//   const { stakingPool } = this;
//   const { timestamp } = await ethers.provider.getBlock('latest');
//   // call staking pool and calculate premium
//   const premium = await stakingPool.calculatePremium(
//     { ...stakedProductTemplate },
//     period,
//     coverAmount,
//     initialCapacityUsed,
//     totalCapacity,
//     stakedProductTemplate.targetPrice,
//     timestamp,
//   );
// });
// });
