# Nexus x Symbiotic

## Ownership

### Nexus
* **Network** (Nexus Network) - admin for network level configs. consumer of allocated stake
* **Operator** (Nexus Operator) - vaults will delegate to the Nexus Operator
* **Middleware** - network middleware that has the rights and responsibility to call `rewards.distributeRewards` and `slasher.slash`.
* **BurnerRouter** - vaults that wants to participate in Nexus network needs to initialize their vaults with the Nexus burnerRouter address and agreed `epochDuration`. Sends slashed funds to claim payout receiver.
* **Rewards** - for each participating vault, Nexus will deploy a corresponding `DefaultStakerRewards` to distribute rewards to the vault.

### Curator
Curators will operator their own Symbiotic setup and choose if they want to participate in the Nexus Network.
* Vault - needs to be configured with:
  * Nexus BurnerRouter address
  * Nexus required `epochDuration`
* Delegator - controls how much stake to allocate to Nexus Network
* Slasher - has the permission to slash the vault

## Integration Steps

1. Register Nexus Network and Nexus Operator **(Nexus)**

```js
await operatorRegistry.connect(SAFE_MULTISIG).registerOperator();
await networkRegistry.connect(SAFE_MULTISIG).registerNetwork();
```
**NOTE:** we are planning to register the same SAFE_MULTISIG address as the Nexus Network and Nexus Operator

2. Nexus Operator <-> Nexus Network  **(Nexus)**
- Nexus Operator opts in the Nexus Network
```js
await operatorNetworkOptIn.connect(NEXUS_OPERATOR).optIn(NEXUS_NETWORK);
```

3. Set Network Middleware **(Nexus)**
- Using the network address, set the middleware for the network to distribute rewards and execute slash
```js
await networkMiddlewareService.connect(NEXUS_NETWORK).setMiddleware(SAFE_MULTISIG);
```
**NOTE:** We are considering using a SAFE_MULTISIG address for the middleware on the MVP and possibly a contract owned by the SAFE_MULTISIG later on.


4. BurnerRouter deployment **(Nexus)**
- Using `BurnerRouterFactory` create a new instance of BurnerRouter setting token collateral and Nexus claims payout receiver address
```js
await burnerRouterFactory.create({ ... });
```

5. Create Vault, Deployer and Slasher **(Curators)**
   - Curators needs to create a new vault, deployer and slasher with the required Nexus params (if not already matching):
     * Nexus BurnerRouter address
     * Nexus required `epochDuration`
   - Curators  ensures their vault has stake to allocate to the Nexus Network

6. Vault <-> Nexus Operator **(Nexus)**
- Nexus Operator opts in any vault that wants to allocate to Nexus Network
```js
await operatorVaultOptIn.connect(NEXUS_OPERATOR).optIn(VAULT_ADDRESS);
```

7. Deploy DefaultStakerRewards contract for each Vault opted in **(Nexus)**
- For each vault opted in the Nexus Network, Nexus deploys a `DefaultStakerRewards` contract specific to each vault via `DefaultStakerRewardsFactory`

8. Vault allocates capital to Nexus Network (via operator) **(Curators)**
- Using the delegator contract curators executes the following actions:
  * `setMaxNetworkLimit` - max limit
  * `setNetworkLimit` - current limit
  * `stake` - allocates stake to Nexus Operator up to the configured network limit

9. Distribute Rewards **(Nexus)**
- Using the registered middleware for the network, on each cover buy distribute the cover fee to all active vaults via their own Rewards contract proportional to the stake shares they have on the network.

10. Slash capital **(Nexus)**
- In the event of an approved claim, the middleware calls `slash` on each active vault proportional to its stake in the Nexus Network.
- After the slash, burnerRouter is called to transfer the slashed funds to the Nexus claim payout receiver to be used for claim payouts.

