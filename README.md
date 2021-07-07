## Run

Add the following variables in a `.env` file

```
# Url of a subgraph
GEB_SUBGRAPH_URL=https://subgraph.reflexer.finance/subgraphs/name/reflexer-labs/rai
# Uniswap v3 subgraph supporting snapshots
UNISWAP_SUBGRAPH_URL=https://api.thegraph.com/subgraphs/name/benesjan/uniswap-v3-test
# Uniswap pool reward to target
UNISWAP_POOL_ADDRESS=0xcb0c5d9d92f4f2f80cce7aa271a1e148c226e19d
# Start of the campaign block
START_BLOCK=11923942
# End of the campaign block
END_BLOCK=11978942
# Total reward distributed over the campaign
REWARD_AMOUNT=100
# Ethereum RPC
RPC_URL=https://mainnet.infura.io/v3/<KEY>
```

Run:

```
npm run start
```

Output file: `rewards.csv`

## Test

```
npm run test
```
