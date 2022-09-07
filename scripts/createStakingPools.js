const { config, network, ethers } = require('hardhat');

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  const cover = await ethers.getContractAt('Cover', '0x610178dA211FEF7D417bC0e6FeD39F05609AD788');

  await cover.createStakingPool(owner.address, false, 0, 0, [], 0, 0);
  await cover.createStakingPool('0x0000000000000000000000000000000000000001', false, 0, 0, [], 0, 0);
  await cover.createStakingPool('0x0000000000000000000000000000000000000002', false, 0, 0, [], 0, 0);

  console.log('Done!');
}

main()
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  })
  .then(() => process.exit(0));
