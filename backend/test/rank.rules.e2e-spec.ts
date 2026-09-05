import {
  DEFAULT_RATING,
  PLACEMENT_MATCHES,
  RANK_BANDS,
  RATING_CAP,
  applyEloDelta,
  eloDelta,
  expectedScore,
  gameSeasonRewardForRank,
  kFactorFor,
  protectionFloorForPeak,
  tierForRating,
} from '../src/competitive/rank/rank.constants';

/**
 * Pure-logic tests for the modified Elo ladder: rating cap, high-score
 * protection floor, placement/placement-free K-factor and rank band mapping.
 * These do not touch the database and run without the Nest app.
 */
describe('rank rules — modified Elo', () => {
  it('maps ratings to the correct tier bands', () => {
    expect(tierForRating(0).tier).toBe('bronze');
    expect(tierForRating(1000).tier).toBe('bronze');
    expect(tierForRating(1199).tier).toBe('bronze');
    expect(tierForRating(1200).tier).toBe('silver');
    expect(tierForRating(1499).tier).toBe('silver');
    expect(tierForRating(1500).tier).toBe('gold');
    expect(tierForRating(2400).tier).toBe('gold');
  });

  it('expected score favours the higher-rated player', () => {
    expect(expectedScore(1500, 1000)).toBeGreaterThan(0.9);
    expect(expectedScore(1000, 1500)).toBeLessThan(0.1);
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 5);
  });

  it('a higher-rated player gains fewer points for beating a weaker opponent', () => {
    const strong = { rating: 1800, score: 1 };
    const weak = [{ rating: 1000, score: 0 }];
    const gain = eloDelta(strong, weak, { kFactor: kFactorFor(1800, 20), isPlacement: false });
    expect(gain).toBeGreaterThanOrEqual(0);
    expect(gain).toBeLessThan(10); // strong beats weak — nearly zero
    const strongLoss = eloDelta({ rating: 1000, score: 0 }, [{ rating: 1800, score: 1 }], {
      kFactor: kFactorFor(1000, 20),
      isPlacement: false,
    });
    expect(strongLoss).toBeGreaterThan(-10); // weak loses to strong — nearly zero penalty
  });

  it('uses a larger K-factor during placement, smaller at the top', () => {
    expect(kFactorFor(1000, 0)).toBeGreaterThan(kFactorFor(1000, PLACEMENT_MATCHES));
    expect(kFactorFor(2100, 50)).toBeLessThan(kFactorFor(1000, 50));
  });

  it('hard rating cap: gains never exceed the cap', () => {
    const res = applyEloDelta({ currentRating: RATING_CAP - 5, peakRating: RATING_CAP - 5, delta: 100, matchesPlayed: 50 });
    expect(res.rating).toBe(RATING_CAP);
    // Even a huge delta at the cap stays at the cap.
    const atCap = applyEloDelta({ currentRating: RATING_CAP, peakRating: RATING_CAP, delta: 200, matchesPlayed: 50 });
    expect(atCap.rating).toBe(RATING_CAP);
  });

  it('high-score protection: a player cannot fall below the tier they reached', () => {
    // Reached gold (1500) earlier; a brutal loss streak cannot drop below 1500.
    const goldPlayer = applyEloDelta({ currentRating: 1505, peakRating: 1520, delta: -400, matchesPlayed: 50 });
    expect(goldPlayer.rating).toBe(protectionFloorForPeak(1520));
    expect(goldPlayer.rating).toBe(1500);

    // Reached silver; protected at 1200.
    const silverPlayer = applyEloDelta({ currentRating: 1210, peakRating: 1250, delta: -300, matchesPlayed: 30 });
    expect(silverPlayer.rating).toBe(1200);

    // Bronze player can fall to the absolute floor.
    const bronzePlayer = applyEloDelta({ currentRating: 1000, peakRating: 1000, delta: -2000, matchesPlayed: 30 });
    expect(bronzePlayer.rating).toBe(0);
  });

  it('provisional players are protected to the start rating during placement', () => {
    const newbie = applyEloDelta({ currentRating: DEFAULT_RATING, peakRating: DEFAULT_RATING, delta: -500, matchesPlayed: 1 });
    expect(newbie.rating).toBe(DEFAULT_RATING);
  });

  it('peak rating is monotonic and never decreases', () => {
    let peak = 1000;
    let rating = 1000;
    const up = applyEloDelta({ currentRating: rating, peakRating: peak, delta: 300, matchesPlayed: 10 });
    rating = up.rating;
    peak = up.peakRating;
    expect(peak).toBe(rating);
    const down = applyEloDelta({ currentRating: rating, peakRating: peak, delta: -200, matchesPlayed: 11 });
    expect(down.peakRating).toBe(peak);
    expect(down.rating).toBeLessThanOrEqual(peak);
  });

  it('game-specific season rewards scale with leaderboard rank', () => {
    expect(gameSeasonRewardForRank(1)?.coins).toBeGreaterThan(gameSeasonRewardForRank(3)!.coins);
    expect(gameSeasonRewardForRank(3)?.coins).toBeGreaterThan(gameSeasonRewardForRank(10)!.coins);
    expect(gameSeasonRewardForRank(11)).toBeNull();
    expect(gameSeasonRewardForRank(50)).toBeNull();
  });

  it('every tier has a complete reward set (coins, xp, title, badge)', () => {
    for (const band of RANK_BANDS) {
      expect(band.seasonReward.coins).toBeGreaterThan(0);
      expect(band.seasonReward.xp).toBeGreaterThan(0);
      expect(band.seasonReward.title.length).toBeGreaterThan(0);
      expect(band.seasonReward.badgeCode.length).toBeGreaterThan(0);
    }
  });
});
