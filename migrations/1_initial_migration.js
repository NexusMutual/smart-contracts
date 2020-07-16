const Migrations = artifacts.require('Migrations');

module.exports = async deployer => {
  console.log('Migrations: migration contract deployment started');
  await deployer.deploy(Migrations);
  console.log('Migrations: migration contract deployment finished');
};
