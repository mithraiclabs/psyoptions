# Protocol architecture
## The Vault
There is a single USDC vault at the protocol level. Because there is a separation of concerns 
(e.g. the vAMM is an isolated component with virtual balances) then the vault can be shared
across all everlastings, regardless of the strike or asset pair involved.

## Margin and liquidation:

### How is a short handled? If I deposit USDC to my account, then want to short an everlasting, what happens?
To short we need to track the collateral deposited separately from the vAMM balances a Portfolio has.
Lets say a user deposits 100 USDC to their Portfolio. They would now have a _net_usdc_deposit_ of 100.
Then they place a trade on an everlasting that is short 200 USDC that everlasting. Their Portfolio would
maintain the `net_usdc_deposit = 100`, but their `SingleMarketBalance` would be 
`{marks: -2, quotes: 200, margin: 100, collateral: 100}`. Here we have the mark price at $100 for calculation 
ease, so the account just borrowed and sold 2 everlasting_x to earn $200.

Now lets say the mark price increases to $125. The margin ratio of the `SingleMarketBalance` is 
`marginRatio = (collateral + PnL)/(margin + collateral) = (100 + (-50))/(100 + 100) = 50/200 = .25`.
Continuing on, lets say the mark price continues to increase and hits $140. The marginRatio becomes
`marginRatio = (100 + (-80))/200 = 20/200 = .10`. The margin ratio will also be calculated and 
stored at the `Portfolio` level. Because this Portfolio only has 1 SingleMarketBalance account, the
margin ratio on the portfolio level is the same as the SingleMarketBalance.

When an account is liquidatable, a liquidator can call the liquidate instruction. Which will 
validate the martio ratio is below the margin maintenance requirement and the account will be 
suceptible to partial liquidation.

Liquidating 25% when mark is $125:
* Buy .5 marks @ $125 from vAMM. marks becomes -1.5 quotes become 137.5. So positionNotional liquidated = 62.5
* new collateral: 100 + (-50 * 0.25) = 87.5
* margin ratio: (87.5 - (50 * .75)) / (200 - 62.5) =  50/137.5 = .3636
* marks: -1.5, quotes: 137.5, collateral: 87.5, margin: 50

Liquidating 25% when mark is $140:
* Buy .5 marks @ $140 from vAMM. marks becomes -1.5 quotes become 130. So positionNotional liquidated = 70
* new collateral: 100 + (-80 * 0.25) = 80
* margin ration: (80 - 60) / (200 - 70) = 20 /130 = .15
* marks: -1.5, quotes: 130, collateral: 80, margin: 50

#### The liquidation
The core of the liquidate instruction will:
* check the overall Portfolio margin ratio to validate it is liquidate-able (return error if not)
    * Calculate the PnL (and margin ratio for following steps) of each `SingleMarketBalance` 
    account in the Portfolio. Use the aggregate PnL to calculate the margin ratio of the Portfolio
* We want to liquidate across the portfolio as to affect the users 


##### Liquidation example 1
Portfolio has 2 SingleMarketBalance accounts. SingleMarketBalance 1 is for ETH strike of $3000, the 
values on the account are `{marks: -2, quotes: 200, margin: 100, collateral: 100}`



## Questions that need more research
### Should MarginAccounts be cross collateralized? Or each MarginAccount can only be tied to 1 everlasting?
If you do cross collateralization then you likely have to limit the number of everlastings a
MarginAccount can be tied to, otherwise you will hit computation limits when running any check
against margin requirements. Cross collateralization would be cool because MarginAccounts could
create long and short positions on different strikes to hedge exposure.

### How are funding payments handled?
The current belief is that funding payments can be "made" by rebalancing the pools. The funding 
payment is basically another line item in the list of actions. And that line item would be 
long or short the mark at the funding rate. 

The one concern here is if you look at the exmple below, when only longs open positions, 
a funding payment occurs and then everyone closes out their positions...there is left over USDC
in the vault. Assets locked in limbo seems like poor efficiency, 
so something must be wrong. Is the logic wrong? Or is this an edge case where funding payments 
shouldn't apply because no one actually took the otherside of the trade?

### How do funding rates play into MarginAccounts?
Funding rates rebalance the vAMM pools which adjusts the value of the mark price. (This is subject to change if 
our theory on funding rates as a rebalancing mechanism are flawed)

### How does interest on margin come into play on MarginAccount?

### Should there be an event queue for tracking trades?

### Do liquidators need to put collateral up?
Not sure if with the vAMM if liquidators even need to put up collateral. They might just have to
turn the crank to liquidate.
