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

const sleep = (time) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, time || 5000);
  });
};

contract("LOFT", async (accounts) => {
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

  describe("should shadow transfer", async () => {
    it("should transfer test", async () => {
      await loft.transfer(account1, toUnit(1000), {
        from: owner,
      });

      assert.bnEqual(await loft.balanceOf(account1), toUnit(1000));

      await loft.transfer(account2, toUnit(2000), {
        from: owner,
      });

      assert.bnEqual(await loft.balanceOf(account2), toUnit(2000));

      await loft.transfer(account1, toUnit(1000), { from: account2 });

      assert.bnEqual(await loft.balanceOf(account1), toUnit(2000));
      assert.bnEqual(await loft.balanceOf(account2), toUnit(1000));
    });

    it("should transferFrom test", async () => {
      await loft.transfer(account1, toUnit(1000), {
        from: owner,
      });

      await loft.transfer(account2, toUnit(2000), {
        from: owner,
      });

      await loft.approve(owner, toUnit(1000), { from: account1 });

      await loft.transferFrom(account1, account2, toUnit(1000), {
        from: owner,
      });

      assert.bnEqual(await loft.balanceOf(account1), 0);

      assert.bnEqual(await loft.balanceOf(account2), toUnit(3000));
    });

    describe("should issue synths", async () => {
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

      it("should not transfer and transferFrom", async () => {
        await assert.revert(
          loft.transfer(account2, toUnit(1000), {
            from: account1,
          }),
          "Cannot transfer staked LOFT"
        );

        await loft.approve(owner, toUnit(1000), { from: account1 });
        await assert.revert(
          loft.transferFrom(account1, account2, toUnit(1000), {
            from: owner,
          }),
          "Cannot transfer staked LOFT"
        );
      });
    });
  });
});
