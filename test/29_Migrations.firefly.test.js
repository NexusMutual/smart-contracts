// This is the automatically generated test file for contract: Migrations
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const Migrations = artifacts.require('Migrations');
const {assertRevert} = require('./utils/assertRevert');

contract('Migrations', (accounts) => {
	// Coverage imporvement tests for Migrations
	describe('MigrationsBlackboxTest', () => {
		it('call func upgrade with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Migrations.new();
			const arg0 = "0xaa97e2aa39a09baf505634c7b6b82376687ecf18";
			await assertRevert(obj.upgrade(arg0));
		});

		it('call func owner with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Migrations.new();
			const res = await obj.owner();
			res.toString().should.be.equal("0x004B7D0721cbffcB87Aeae35Bf88196dd07281D1");
		});

		it('call func lastCompletedMigration with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Migrations.new();
			const res = await obj.lastCompletedMigration();
			res.toString().should.be.equal("0");
		});

	});
});