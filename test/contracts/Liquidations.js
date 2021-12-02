require(".");
const Oracle = artifacts.require("Oracle");
const LOFTContract = artifacts.require("LOFT");
const Synthesizer = artifacts.require("Synthesizer");
const FeePool = artifacts.require("FeePool");
const Exchanger = artifacts.require("Exchanger");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const AddressResolver = artifacts.require("AddressResolver");
const RewardEscrow = artifacts.require("RewardEscrow");
const Synth = artifacts.require("Synth");
const Liquidations = artifacts.require("Liquidations");

const {
  toBytes32,
  toUnit,
  fromUnit,
  ZERO_ADDRESS,
  fastForward,
  currentTime,
  divideDecimal,
  multiplyDecimal,
  onlyGivenAddressCanInvoke,
  assertEventsEqual,
} = require("../../utils");

const log = (value) => {
  console.log(fromUnit(value).toString());
};

contract("Liquidations", async (accounts) => {
  let loft,
    oracle,
    feePool,
    exchanger,
    addressResolver,
    rewardEscrow,
    safeDecimalMath,
    ofUSDContract,
    xETHContract,
    liquidations,
    timestamp;

  const [deployerAccount, owner, oracleAccount, account1, account2, account3] =
    accounts;

  const testAccounts = [account1, account2, account3];

  const [ofUSD, LOFT, xBTC, xETH] = ["OfUSD", "LOFT", "xBTC", "xETH"].map(
    toBytes32
  );

  const getRemainingIssuableSynths = async (account) =>
    (await synthesizer.remainingIssuableSynths(account))[0];

  const sleep = (time) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, time || 5000);
    });
  };

  before(async () => {
    safeDecimalMath = await SafeDecimalMath.new();
    await Synthesizer.link(safeDecimalMath);
    await Oracle.link(safeDecimalMath);
    await FeePool.link(safeDecimalMath);
    await Exchanger.link(safeDecimalMath);
    await Liquidations.link(safeDecimalMath);
  });

  beforeEach(async () => {
    timestamp = await currentTime();
    addressResolver = await AddressResolver.new();

    synthesizer = await Synthesizer.new();
    await synthesizer.initialize(addressResolver.address, { from: owner });
    await synthesizer.setIssuanceRatio(toUnit("0.2"), { from: owner });

    loft = await LOFTContract.new();
    await loft.initialize({ from: owner });
    await loft.setSynthesizer(synthesizer.address, { from: owner });

    //oracle
    oracle = await Oracle.new();
    await oracle.initialize(oracleAccount, [LOFT], ["0.1"].map(toUnit), {
      from: oracleAccount,
    });

    feePool = await FeePool.new();
    await feePool.initialize(toUnit("0.0030"), addressResolver.address, {
      from: owner,
    });

    exchanger = await Exchanger.new();
    await exchanger.initialize(addressResolver.address, { from: owner });

    rewardEscrow = await RewardEscrow.new();
    await rewardEscrow.initialize(addressResolver.address, { from: owner });

    liquidations = await Liquidations.new();
    await liquidations.initialize(addressResolver.address, { from: owner });

    await addressResolver.importAddresses(
      [
        toBytes32("LOFT"),
        toBytes32("Oracle"),
        toBytes32("FeePool"),
        toBytes32("Exchanger"),
        toBytes32("RewardEscrow"),
        toBytes32("Synthesizer"),
        toBytes32("Liquidations"),
      ],
      [
        loft.address,
        oracle.address,
        feePool.address,
        exchanger.address,
        rewardEscrow.address,
        synthesizer.address,
        liquidations.address,
      ]
    );

    //add xBTC
    // const xBTCSynth = await Synth.new();
    // await xBTCSynth.initialize(
    //   "Synth xBTC",
    //   "xBTC",
    //   xBTC,
    //   addressResolver.address,
    //   { from: owner }
    // );
    // await synthesizer.addSynth(xBTCSynth.address, { from: owner });

    // //add xETH
    // const xETHSynth = await Synth.new();
    // await xETHSynth.initialize(
    //   "Synth xETH",
    //   "xETH",
    //   xETH,
    //   addressResolver.address,
    //   { from: owner }
    // );
    // await synthesizer.addSynth(xETHSynth.address, { from: owner });
    // xETHContract = await Synth.at(await synthesizer.synths(xETH));

    //add ofUSD
    const ofUSDSynth = await Synth.new();
    await ofUSDSynth.initialize(
      "LOFT USD",
      "OfUSD",
      ofUSD,
      addressResolver.address,
      { from: owner }
    );
    await synthesizer.addSynth(ofUSDSynth.address, { from: owner });
    ofUSDContract = await Synth.at(await synthesizer.synths(ofUSD));
  });

  describe("constructor", () => {
    it("should set params on initialize", async () => {
      assert.equal(await liquidations.owner(), owner);
      assert.equal(await liquidations.resolver(), addressResolver.address);
    });
  });

  describe("Default settings", () => {
    it("liquidation ratio", async () => {
      const liquidationRatio = await liquidations.liquidationRatio();
      assert.bnEqual(liquidationRatio, toUnit("0.5"));
    });
    it("liquidation penalty ", async () => {
      const liquidationPenalty = await liquidations.liquidationPenalty();
      assert.bnEqual(liquidationPenalty, toUnit("0.1"));
    });
    it("liquidation delay", async () => {
      const liquidationDelay = await liquidations.liquidationDelay();
      assert.bnEqual(liquidationDelay, 1 * 60 * 60 * 2); // 2 hours
    });
  });

  describe("Change default setting", async () => {
    const newLiquidationRatio = toUnit("0.4");
    const newLiquidationPenalty = toUnit("0.2");
    const newLiquidationDelay = 1 * 60 * 60;

    describe("should owner from setting liquidation ratio, penalty, delay", () => {
      beforeEach(async () => {
        await liquidations.setLiquidationRatio(newLiquidationRatio, {
          from: owner,
        });
        await liquidations.setLiquidationPenalty(newLiquidationPenalty, {
          from: owner,
        });
        await liquidations.setLiquidationDelay(newLiquidationDelay, {
          from: owner,
        });
      });

      it("should liquidation ratio 0.4", async () => {
        const liquidationRatio = await liquidations.liquidationRatio();
        assert.bnEqual(liquidationRatio, newLiquidationRatio);
        assert.bnNotEqual(liquidationRatio, toUnit("0.5"));
      });

      it("should liquidation penalty 0.2", async () => {
        const liquidationPenalty = await liquidations.liquidationPenalty();
        assert.bnEqual(liquidationPenalty, newLiquidationPenalty);
        assert.bnNotEqual(liquidationPenalty, toUnit("0.1"));
      });

      it("should liquidation delay 1 hours", async () => {
        const liquidationDelay = await liquidations.liquidationDelay();
        assert.bnEqual(liquidationDelay, newLiquidationDelay);
        assert.bnNotEqual(liquidationDelay, 1 * 60 * 60 * 2);
      });
    });

    it("should disallow a non-owner from setting liquidation ratio, penalty, delay", async () => {
      await assert.revert(
        liquidations.setLiquidationRatio(newLiquidationRatio, {
          from: account1,
        })
      );
      await assert.revert(
        liquidations.setLiquidationPenalty(newLiquidationPenalty, {
          from: account2,
        })
      );
      await assert.revert(
        liquidations.setLiquidationDelay(newLiquidationDelay, {
          from: account3,
        })
      );
    });
  });

  describe("when LOFT is stale", async () => {
    beforeEach(async () => {
      // await oracle.setRateStalePeriod(1, { from: oracleAccount });
      await fastForward(1 * 60 * 60 * 3 + 10);
    });

    it("when flagAccountForLiquidation() is invoked, it reverts for rate stale", async () => {
      await assert.revert(
        liquidations.flagAccountForLiquidation(account1, { from: owner }),
        "Rate stale or not a synth"
      );
    });

    it("when checkAndRemoveAccountInLiquidation() is invoked, it reverts for rate stale", async () => {
      await assert.revert(
        liquidations.checkAndRemoveAccountInLiquidation(account1, {
          from: owner,
        }),
        "Rate stale or not a synth"
      );
    });
  });

  it("when liquidateDelinquentAccount() is invoked, it reverts with Account not open for liquidation", async () => {
    await assert.revert(
      loft.liquidateDelinquentAccount(account1, toUnit("10"), {
        from: owner,
      }),
      "Account not open for liquidation"
    );
  });

  it("when checkAndRemoveAccountInLiquidation() is invoked, it reverts with Account has no liquidation set", async () => {
    await assert.revert(
      liquidations.checkAndRemoveAccountInLiquidation(account1),
      "Account has no liquidation set"
    );
  });

  describe("calculateAmountToFixCollateral", () => {
    let liquidationPenalty;
    beforeEach(async () => {
      liquidationPenalty = await liquidations.liquidationPenalty();
      assert.bnEqual(liquidationPenalty, toUnit("0.1"));
    });

    it("calculates ofUSD to fix ratio from 200%, with $100 LOFT collateral and $50 debt", async () => {
      const expectedAmount = toUnit("38.461538461538461538");
      const collateralBefore = toUnit("100");
      const debtBefore = toUnit("50");
      const susdToLiquidate = await liquidations.calculateAmountToFixCollateral(
        debtBefore,
        collateralBefore
      );

      assert.bnEqual(susdToLiquidate, expectedAmount);

      const debtAfter = debtBefore.sub(susdToLiquidate);
      const collateralAfterMinusPenalty = collateralBefore.sub(
        multiplyDecimal(susdToLiquidate, toUnit("1").add(liquidationPenalty))
      );

      // c-ratio = debt / collateral
      const collateralRatio = divideDecimal(
        debtAfter,
        collateralAfterMinusPenalty
      );

      assert.bnEqual(collateralRatio, toUnit(0.2));
    });

    it("calculates ofUSD to fix ratio from 400%, with $100 LOFT collateral and $25 debt", async () => {
      const expectedAmount = toUnit("6.410256410256410256");
      const collateralBefore = toUnit("100");
      const debtBefore = toUnit("25");
      const susdToLiquidate = await liquidations.calculateAmountToFixCollateral(
        debtBefore,
        collateralBefore
      );

      assert.bnEqual(susdToLiquidate, expectedAmount);

      const debtAfter = debtBefore.sub(susdToLiquidate);
      const collateralAfterMinusPenalty = collateralBefore.sub(
        multiplyDecimal(susdToLiquidate, toUnit("1").add(liquidationPenalty))
      );

      // c-ratio = debt / collateral
      const collateralRatio = divideDecimal(
        debtAfter,
        collateralAfterMinusPenalty
      );

      assert.bnEqual(collateralRatio, toUnit(0.2));
    });
  });

  describe("should calls liquidateDelinquentAccount on anyone undercollateralized", async () => {
    beforeEach(async () => {
      await loft.transfer(account1, toUnit(1000), {
        from: owner,
      });

      const maofUSD = await synthesizer.maxIssuableSynths(account1);
      await synthesizer.issueSynths(maofUSD, { from: account1 });

      await oracle.updateRates(
        [LOFT],
        ["0.04"].map(toUnit),
        await currentTime(),
        { from: oracleAccount }
      );
    });

    describe("should has not been flagged for liquidation", () => {
      it("then isLiquidationDeadlinePassed returns false as no liquidation set", async () => {
        assert.isFalse(
          await liquidations.isLiquidationDeadlinePassed(account1)
        );
      });

      it("then isOpenForLiquidation returns false as no liquidation set", async () => {
        assert.isFalse(await liquidations.isOpenForLiquidation(account1));
      });

      it("should calls checkAndRemoveAccountInLiquidation then it reverts", async () => {
        await assert.revert(
          liquidations.checkAndRemoveAccountInLiquidation(account1),
          "Account has no liquidation set"
        );
      });
    });

    describe("should flags for liquidation", async () => {
      let timeOfTransaction;
      let transaction;

      beforeEach(async () => {
        timeOfTransaction = await currentTime();
        transaction = await liquidations.flagAccountForLiquidation(account1);
      });

      it("should sets a deadline liquidation delay of 2 hours", async () => {
        const liquidationDeadline =
          await liquidations.getLiquidationDeadlineForAccount(account1);
        assert.isTrue(liquidationDeadline.gt(0));
        assert.isTrue(liquidationDeadline.gt(timeOfTransaction));
        assert.isTrue(
          liquidationDeadline.gt(timeOfTransaction + 1 * 60 * 60 * 2)
        );
      });

      it("should sets a deadline liquidation equal AccountFlaggedForLiquidation event", async () => {
        const liquidationDeadline =
          await liquidations.getLiquidationDeadlineForAccount(account1);
        assert.eventEqual(transaction, "AccountFlaggedForLiquidation", {
          account: account1,
          deadline: liquidationDeadline,
        });
      });

      it("should account flag and is openForLiquidation false", async () => {
        const accountIsOpen = await liquidations.isOpenForLiquidation(account1);
        assert.isFalse(accountIsOpen);
      });

      it("should account liquidation Deadline is passed false", async () => {
        const liquidationDeadlinePassed =
          await liquidations.isLiquidationDeadlinePassed(account1);
        assert.isFalse(liquidationDeadlinePassed);
      });

      it("should Account already flagged for liquidation", async () => {
        await assert.revert(
          liquidations.flagAccountForLiquidation(account1),
          "Account already flagged for liquidation"
        );
      });

      describe("when the price of LOFT increases and deadline has passed", async () => {
        beforeEach(async () => {
          const delay = await liquidations.liquidationDelay();

          // fast forward to after deadline
          await fastForward(delay + 100);

          await oracle.updateRates(
            [xETH, LOFT, xBTC],
            ["2000", "0.1", "30000"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );

          const liquidationRatio = await liquidations.liquidationRatio();

          const ratio = await synthesizer.collateralisationRatio(account1);
          const targetIssuanceRatio = await synthesizer.issuanceRatio();

          // check account1 ratio is below liquidation ratio
          assert.isTrue(ratio.lt(liquidationRatio));

          // check account1 ratio is below or equal to target issuance ratio
          assert.isTrue(ratio.lte(targetIssuanceRatio));
        });

        it("then account1 isLiquidationDeadlinePassed returns true", async () => {
          const deadlinePass = await liquidations.isLiquidationDeadlinePassed(
            account1
          );
          assert.isTrue(deadlinePass);
        });

        it("then account1 is not open for liquidation", async () => {
          const isOpenForLiquidation = await liquidations.isOpenForLiquidation(
            account1
          );
          assert.bnEqual(isOpenForLiquidation, false);
        });
      });

      describe("should issuance ratio is higher than the liquidation ratio", () => {
        let liquidationRatio;
        beforeEach(async () => {
          liquidationRatio = await liquidations.liquidationRatio();

          const ratio = await synthesizer.collateralisationRatio(account1);
          const targetIssuanceRatio = await synthesizer.issuanceRatio();
          // check account1 ratio is above or equal liquidation ratio
          assert.isTrue(ratio.gte(liquidationRatio));

          // check account1 ratio is above target issuance ratio
          assert.isTrue(ratio.gt(targetIssuanceRatio));
        });
        describe("when the liquidation deadline has not passed", () => {
          it("then isOpenForLiquidation returns false as deadline not passed", async () => {
            assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          });
          it("then isLiquidationDeadlinePassed returns false", async () => {
            assert.isFalse(
              await liquidations.isLiquidationDeadlinePassed(account1)
            );
          });
        });
        describe("fast forward 2 hours, when the liquidation deadline has passed", () => {
          beforeEach(async () => {
            const delay = await liquidations.liquidationDelay();

            await fastForward(delay + 100);

            await oracle.updateRates(
              [xETH, LOFT, xBTC],
              ["2000", "0.04", "30000"].map(toUnit),
              await currentTime(),
              { from: oracleAccount }
            );
          });
          it("then isLiquidationDeadlinePassed returns true", async () => {
            assert.isTrue(
              await liquidations.isLiquidationDeadlinePassed(account1)
            );
          });
          it("then isOpenForLiquidation returns true", async () => {
            assert.isTrue(await liquidations.isOpenForLiquidation(account1));
          });
        });
      });

      describe("when the price of LOFT increases", () => {
        beforeEach(async () => {
          await oracle.updateRates(
            [xETH, LOFT, xBTC],
            ["2000", "0.1", "30000"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );
        });
        describe("should calls checkAndRemoveAccountInLiquidation", () => {
          beforeEach(async () => {
            await liquidations.checkAndRemoveAccountInLiquidation(account1);
          });
          it("should liquidation entry is removed", async () => {
            const deadline =
              await liquidations.getLiquidationDeadlineForAccount(account1);
            assert.bnEqual(deadline, 0);
          });
          it("should account is not open for liquidation", async () => {
            const isOpenForLiquidation =
              await liquidations.isOpenForLiquidation(account1);
            assert.bnEqual(isOpenForLiquidation, false);
          });
        });
      });

      describe("given the liquidation deadline has passed ", () => {
        beforeEach(async () => {
          await fastForward(1 * 60 * 60 * 2 + 10);
          await oracle.updateRates(
            [xETH, LOFT, xBTC],
            ["2000", "0.04", "30000"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );
        });

        it("should c-ratio is above the liquidation Ratio", async () => {
          // dows rate up
          await oracle.updateRates(
            [xETH, LOFT, xBTC],
            ["2000", "0.1", "30000"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );

          await assert.revert(
            loft.liquidateDelinquentAccount(account1, toUnit(20), {
              from: owner,
            }),
            "Account not open for liquidation"
          );

          const removeTransaction =
            await liquidations.checkAndRemoveAccountInLiquidation(account1);
          assert.eventEqual(
            removeTransaction,
            "AccountRemovedFromLiquidation",
            {
              account: account1,
            }
          );

          const deadline = await liquidations.getLiquidationDeadlineForAccount(
            account1
          );
          assert.bnEqual(deadline, 0);
          const isOpenForLiquidation = await liquidations.isOpenForLiquidation(
            account1
          );
          assert.bnEqual(isOpenForLiquidation, false);
        });

        it("should new LOFT transfer account1", async () => {
          await loft.transfer(account1, toUnit(10000), { from: owner });
          const liquidationRatio = await liquidations.liquidationRatio();

          const ratio = await synthesizer.collateralisationRatio(account1);
          const targetIssuanceRatio = await synthesizer.issuanceRatio();

          assert.isTrue(ratio.lte(liquidationRatio));
          assert.isTrue(ratio.lte(targetIssuanceRatio));

          assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          assert.isTrue(
            (await liquidations.getLiquidationDeadlineForAccount(account1)).gt(
              0
            )
          );

          await assert.revert(
            loft.liquidateDelinquentAccount(account1, toUnit(20), {
              from: owner,
            }),
            "Account not open for liquidation"
          );

          const removeTransaction =
            await liquidations.checkAndRemoveAccountInLiquidation(account1);
          assert.eventEqual(
            removeTransaction,
            "AccountRemovedFromLiquidation",
            {
              account: account1,
            }
          );

          assert.bnEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
        });

        it("should burn some ofUSD", async () => {
          await oracle.updateRates(
            [LOFT],
            ["0.1"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );

          await synthesizer.burnSynths(toUnit(10), { from: account1 });
          assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          assert.isTrue(
            (await liquidations.getLiquidationDeadlineForAccount(account1)).gt(
              0
            )
          );

          const removeTransaction =
            await liquidations.checkAndRemoveAccountInLiquidation(account1);
          assert.eventEqual(
            removeTransaction,
            "AccountRemovedFromLiquidation",
            {
              account: account1,
            }
          );

          assert.bnEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
        });

        it("should account1 do not fix c-ratio", async () => {
          assert.isTrue(await liquidations.isOpenForLiquidation(account1));
          assert.isTrue(
            (await liquidations.getLiquidationDeadlineForAccount(account1)).gt(
              0
            )
          );

          await assert.revert(
            loft.liquidateDelinquentAccount(account1, toUnit(20), {
              from: account2,
            }),
            "Not enough ofUSD"
          );

          await loft.transfer(account2, toUnit("10000"), {
            from: owner,
          });

          await synthesizer.issueSynths(toUnit(15), { from: account2 });
          await assert.revert(
            loft.liquidateDelinquentAccount(account1, toUnit(20), {
              from: account2,
            }),
            "Not enough ofUSD"
          );
        });

        it("should account1 calls checkAndRemoveAccountInLiquidation", async () => {
          await liquidations.checkAndRemoveAccountInLiquidation(account1);
          assert.bnEqual(
            await liquidations.isOpenForLiquidation(account1),
            true
          );
          assert.notEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
        });

        describe("when account2 liquidates with 20 ofUSD", async () => {
          let collateral;
          let debtBalanceOf;
          let collateralValue;
          let trans;
          beforeEach(async () => {
            collateral = await synthesizer.collateral(account1);
            debtBalanceOf = await synthesizer.debtBalanceOf(account1, ofUSD);
            collateralValue = await oracle.effectiveValue(
              toBytes32("LOFT"),
              collateral,
              ofUSD
            );

            // transfer new LOFT and enough ofUSD
            await loft.transfer(account2, toUnit("50000"), {
              from: owner,
            });
            // Issue $2000 ofUSD
            await synthesizer.issueMaxSynths({ from: account2 });

            // liquidate account
            trans = await loft.liquidateDelinquentAccount(
              account1,
              toUnit(20),
              { from: account2 }
            );
          });

          it("should after downs number eq", async () => {
            const liquidationPenalty = await liquidations.liquidationPenalty();
            const AmountToFix =
              await liquidations.calculateAmountToFixCollateral(
                debtBalanceOf,
                collateralValue
              );

            const afterDows = await synthesizer.collateral(account1);

            let dowsRedeemed = await oracle.effectiveValue(
              ofUSD,
              AmountToFix,
              toBytes32("LOFT")
            );
            dowsRedeemed = multiplyDecimal(
              dowsRedeemed,
              toUnit(1).add(liquidationPenalty)
            );

            assert.bnEqual(afterDows, collateral.sub(dowsRedeemed));
          });

          it("should account1 debtBalanceOf eq AmountToFix", async () => {
            const liquidationPenalty = await liquidations.liquidationPenalty();

            const AmountToFix =
              await liquidations.calculateAmountToFixCollateral(
                debtBalanceOf,
                collateralValue
              );

            let dowsRedeemed = await oracle.effectiveValue(
              ofUSD,
              AmountToFix,
              toBytes32("LOFT")
            );
            dowsRedeemed = multiplyDecimal(
              dowsRedeemed,
              toUnit(1).add(liquidationPenalty)
            );

            let afterXUSD = await oracle.effectiveValue(
              toBytes32("LOFT"),
              collateral.sub(dowsRedeemed),
              ofUSD
            );

            assert.isTrue(
              (await synthesizer.collateralisationRatio(account1)).lte(
                toUnit(0.2)
              )
            );
            assert.isTrue(
              debtBalanceOf
                .sub(AmountToFix)
                .gte(await synthesizer.debtBalanceOf(account1, ofUSD))
            );
          });

          it("shuold calculateAmountToFixCollateral event", async () => {
            const liquidationPenalty = await liquidations.liquidationPenalty();
            const AmountToFix =
              await liquidations.calculateAmountToFixCollateral(
                debtBalanceOf,
                collateralValue
              );
            let dowsRedeemed = await oracle.effectiveValue(
              ofUSD,
              AmountToFix,
              toBytes32("LOFT")
            );
            dowsRedeemed = multiplyDecimal(
              dowsRedeemed,
              toUnit(1).add(liquidationPenalty)
            );

            assert.eventEqual(trans.logs[2], "AccountLiquidated", {
              account: account1,
              dowsRedeemed: dowsRedeemed,
              amountLiquidated: AmountToFix,
              liquidator: account2,
            });
          });

          it("should isOpenForLiquidation is false", async () => {
            assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          });
        });
      });
    });
  });

  describe("Given account1 has LOFT and never issued any debt", () => {
    beforeEach(async () => {
      await loft.transfer(account1, toUnit("100"), { from: owner });
    });

    it("then she should not be able to be flagged for liquidation", async () => {
      await assert.revert(
        liquidations.flagAccountForLiquidation(account1),
        "Account issuance ratio is less than liquidation ratio"
      );
    });

    it("then liquidateDelinquentAccount fails", async () => {
      await assert.revert(
        loft.liquidateDelinquentAccount(account1, toUnit("100")),
        "Account not open for liquidation"
      );
    });
  });

  describe("when collateral value is less than debt issued + penalty", async () => {
    beforeEach(async () => {
      await loft.transfer(account1, toUnit(1000), {
        from: owner,
      });

      // Issue $20 ofUSD
      const maofUSD = await synthesizer.maxIssuableSynths(account1);
      await synthesizer.issueSynths(maofUSD, { from: account1 });

      await oracle.updateRates(
        [LOFT],
        ["0.04"].map(toUnit),
        await currentTime(),
        { from: oracleAccount }
      );
    });

    describe("should account1 flag liquidate", async () => {
      beforeEach(async () => {
        await liquidations.flagAccountForLiquidation(account1);

        const liquidationDeadline =
          await liquidations.getLiquidationDeadlineForAccount(account1);

        await fastForward(liquidationDeadline + 1);

        await oracle.updateRates(
          [LOFT],
          ["0.04"].map(toUnit),
          await currentTime(),
          { from: oracleAccount }
        );
      });

      it("then account1 is openForLiquidation true", async () => {
        assert.isTrue(await liquidations.isOpenForLiquidation(account1));
      });

      describe("when LOFT is stale", async () => {
        beforeEach(async () => {
          await fastForward(
            (await oracle.rateStalePeriod()).add(web3.utils.toBN("300"))
          );
        });

        it("then liquidate reverts", async () => {
          await assert.revert(
            loft.liquidateDelinquentAccount(account1, toUnit("20"), {
              from: owner,
            }),
            "Rate stale or not a synth"
          );
        });
      });

      describe("when liquidates all of collateral", async () => {
        it("when collateral <= 200% and collateral > 100%", async () => {
          // transfer new LOFT and enough ofUSD
          await loft.transfer(account2, toUnit("1000000"), {
            from: owner,
          });
          // Issue $800 ofUSD
          await synthesizer.issueMaxSynths({ from: account2 });

          const trans = await loft.liquidateDelinquentAccount(
            account1,
            toUnit(20),
            { from: account2 }
          );
          // assert.eventEqual(trans, 'AccountLiquidated', {
          //   account: account1,
          //   dowsRedeemed: totalRedeemed,
          //   amountLiquidated: amountToLiquidate,
          //   liquidator: account2
          // });

          assert.bnEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );

          assert.isFalse(await liquidations.isOpenForLiquidation(account1));

          const ratioAfter = await synthesizer.collateralisationRatio(account1);
          assert.isTrue(ratioAfter.lte(toUnit(0.2)));

          const debtBalanceOf = await synthesizer.debtBalanceOf(
            account1,
            ofUSD
          );
          assert.isTrue(debtBalanceOf.lt(toUnit(20)));

          const amount = await synthesizer.collateral(account1);
          assert.isTrue(amount.lt(toUnit(1000)));

          assert.bnEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
        });

        it("should be able to check and remove liquidation flag as no more collateral", async () => {
          // transfer new LOFT and enough ofUSD
          await loft.transfer(account2, toUnit("1000000"), {
            from: owner,
          });
          // Issue $800 ofUSD
          await synthesizer.issueMaxSynths({ from: account2 });

          await oracle.updateRates(
            [LOFT],
            ["0.01"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );

          await loft.liquidateDelinquentAccount(account1, toUnit("5"), {
            from: account2,
          });

          assert.bnNotEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
          assert.isTrue(await liquidations.isOpenForLiquidation(account1));
          assert.isTrue(
            await liquidations.isLiquidationDeadlinePassed(account1)
          );

          await loft.liquidateDelinquentAccount(account1, toUnit("5"), {
            from: account2,
          });

          assert.bnEqual(await synthesizer.debtBalanceOf(account1, ofUSD), 0);
          assert.bnEqual(await synthesizer.collateral(account1), 0);
          assert.bnEqual(await synthesizer.collateralisationRatio(account1), 0);

          assert.bnNotEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
          assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          assert.isTrue(
            await liquidations.isLiquidationDeadlinePassed(account1)
          );

          const removeFlagTransaction =
            await liquidations.checkAndRemoveAccountInLiquidation(account1);

          assert.bnEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
          assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          assert.isFalse(
            await liquidations.isLiquidationDeadlinePassed(account1)
          );

          await assert.revert(
            liquidations.checkAndRemoveAccountInLiquidation(account1),
            "Account has no liquidation set"
          );

          assert.eventEqual(
            removeFlagTransaction,
            "AccountRemovedFromLiquidation",
            {
              account: account1,
            }
          );

          // const susdAmount = toUnit(20);
          // const liquidationPenalty = await liquidations.liquidationPenalty();
          // const accountCollateral = await synthesizer.collateral(account1);
          // const collateralValue = await oracle.effectiveValue(toBytes32("LOFT"), accountCollateral, ofUSD);
          // const debtBalance = await synthesizer.debtBalanceOf(account1, ofUSD);
          // let amountToLiquidate;
          // const amountToFixRatio = await liquidations.calculateAmountToFixCollateral(debtBalance, collateralValue);
          // amountToLiquidate = amountToFixRatio.sub(susdAmount) < toUnit(0) ? amountToFixRatio : susdAmount;
          // let dowsRedeemed = await oracle.effectiveValue(ofUSD, amountToLiquidate, toBytes32("LOFT"));
          // totalRedeemed = multiplyDecimal(dowsRedeemed, toUnit(1).add(liquidationPenalty));

          // // log(amountToLiquidate)
          // // log(dowsRedeemed)
          // log(totalRedeemed)
          // log(accountCollateral)
          // console.log(totalRedeemed.sub(accountCollateral) > toUnit(0))
          // // console.log(accountCollateral.sub(totalRedeemed) > toUnit(0))
          // // log(totalRedeemed)
          // // log(accountCollateral)
          // // console.log(totalRedeemed > accountCollateral)

          // if (totalRedeemed.sub(accountCollateral) > toUnit(0)) {
          //   // set totalRedeemed to all collateral
          //   totalRedeemed = accountCollateral;

          //   // whats the equivalent ofUSD to burn for all collateral less penalty
          //   amountToLiquidate = await oracle.effectiveValue(toBytes32("LOFT"), divideDecimal(accountCollateral, toUnit(1).add(liquidationPenalty)), ofUSD);
          // }

          // log(amountToLiquidate)
          // log(debtBalance)
          // log(totalRedeemed)
          // log(amountToFixRatio)
          // // burn ofUSD from messageSender (liquidator) and reduce account's debt
          // // _burnSynthsForLiquidation(account, liquidator, amountToLiquidate, debtBalance);

          // if (amountToLiquidate == amountToFixRatio) {
          //   //     // Remove liquidation
          //   //     _liquidations.removeAccountInLiquidation(account);
          // }
        });

        it("should checkAndRemoveAccountInLiquidation deadline for account 0", async () => {
          // transfer new LOFT and enough ofUSD
          await loft.transfer(account2, toUnit("1000000"), {
            from: owner,
          });
          // Issue $800 ofUSD
          await synthesizer.issueMaxSynths({ from: account2 });

          assert.isTrue(await liquidations.isOpenForLiquidation(account1));
          assert.isTrue(
            (await liquidations.getLiquidationDeadlineForAccount(account1)).gt(
              0
            )
          );

          await oracle.updateRates(
            [LOFT],
            ["0.1"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );

          assert.isTrue(
            (await liquidations.getLiquidationDeadlineForAccount(account1)).gt(
              0
            )
          );
          assert.isFalse(await liquidations.isOpenForLiquidation(account1));

          await liquidations.checkAndRemoveAccountInLiquidation(account1);

          assert.bnEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
          assert.isFalse(await liquidations.isOpenForLiquidation(account1));

          assert.isFalse(
            await liquidations.isLiquidationDeadlinePassed(account1)
          );
        });

        it("when collateral < 100%", async () => {
          await oracle.updateRates(
            [LOFT],
            ["0.01"].map(toUnit),
            await currentTime(),
            { from: oracleAccount }
          );

          // transfer new LOFT and enough ofUSD
          await loft.transfer(account3, toUnit("1000000"), {
            from: owner,
          });
          // Issue $800 ofUSD
          await synthesizer.issueMaxSynths({ from: account3 });

          const beforeDebtBalanceOf = await synthesizer.debtBalanceOf(
            account1,
            ofUSD
          );

          // liquidations account1
          await loft.liquidateDelinquentAccount(account1, toUnit("20"), {
            from: account3,
          });

          const afterDebtBalanceOf = await synthesizer.debtBalanceOf(
            account3,
            ofUSD
          );

          //  debtBalanceOf, LOFT number and collateralisationRatio eq 0
          assert.bnEqual(await synthesizer.debtBalanceOf(account1, ofUSD), 0);
          assert.bnEqual(await synthesizer.collateral(account1), 0);
          assert.bnEqual(await synthesizer.collateralisationRatio(account1), 0);

          assert.bnNotEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
          assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          assert.isTrue(
            await liquidations.isLiquidationDeadlinePassed(account1)
          );

          // check and remove liquidation
          await liquidations.checkAndRemoveAccountInLiquidation(account1);

          assert.bnEqual(
            await liquidations.getLiquidationDeadlineForAccount(account1),
            0
          );
          assert.isFalse(await liquidations.isOpenForLiquidation(account1));
          assert.isFalse(
            await liquidations.isLiquidationDeadlinePassed(account1)
          );
        });
      });
    });
  });
});
