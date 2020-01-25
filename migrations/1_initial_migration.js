var Migrations = artifacts.require('Migrations');

module.exports = async function(deployer) {
  if (deployer.network === 'skipMigrations') {
    return;
  }

  await deployer.deploy(Migrations);
};
