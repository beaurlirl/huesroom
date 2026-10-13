// Coin and speed-bonus rules (src/economy.ts), no browser needed: node tests/economy.mjs
import { bonusFor, medalFor, settleRun, NO_PROGRESS } from '../src/economy.ts';
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fails++; };
const par = { fast: 25, slow: 90, bonusMax: 20 };
check('fastest time earns the full bonus', bonusFor(20, par) === 20);
check('slowest time earns none', bonusFor(95, par) === 0);
check('bonus falls as time rises', bonusFor(40, par) > bonusFor(60, par));
check('medals follow the bonus', medalFor(25, par) === 'gold' && medalFor(50, par) === 'silver' && medalFor(85, par) === 'bronze' && medalFor(95, par) === null);
const r1 = settleRun(NO_PROGRESS, 60, 18, par);
check('first run pays the level coins plus the speed bonus', r1.reward.base === 18 && r1.reward.bonus === bonusFor(60, par) && r1.reward.total === 18 + r1.reward.bonus, JSON.stringify(r1.reward));
const r2 = settleRun(r1.next, 40, 18, par);
check('a faster replay pays only the extra bonus on top', r2.reward.base === 0 && r2.reward.bonus === bonusFor(40, par) - bonusFor(60, par) && r2.reward.bonus > 0, JSON.stringify(r2.reward));
const r3 = settleRun(r2.next, 70, 18, par);
check('a slower replay pays nothing and loses nothing', r3.reward.total === 0 && r3.next.bonusPaid === r2.next.bonusPaid);
const r4 = settleRun(r3.next, 40, 18, par);
check('repeating the same best time pays nothing', r4.reward.total === 0);
const lifetime = r1.reward.total + r2.reward.total + r3.reward.total + r4.reward.total;
check('lifetime pay is capped at coins + bonusMax', lifetime <= 18 + par.bonusMax, `(${lifetime})`);

import { EMPTY_LEDGER, applyRun, walletOf, buyItem, addPack, equip, mergeLedgers, parseLedger } from '../src/ledger.ts';
const a1 = applyRun(EMPTY_LEDGER, 'home', 60, 18, par);
check('ledger wallet equals the run reward', walletOf(a1.ledger) === a1.reward.total);
const a2 = applyRun(a1.ledger, 'home', 40, 18, par);
check('ledger faster replay adds only the difference', walletOf(a2.ledger) === a1.reward.total + a2.reward.total && a2.reward.base === 0);
const shirt = { id: 'tee', price: 10 };
check('buying needs the coins', buyItem(EMPTY_LEDGER, shirt).reason === 'short');
const bought = buyItem(a2.ledger, shirt);
check('buying spends coins once', bought.ok && walletOf(bought.ledger) === walletOf(a2.ledger) - 10 && buyItem(bought.ledger, shirt).reason === 'owned');
check('only owned items can be worn', equip(a2.ledger, 'top', 'tee') === a2.ledger && equip(bought.ledger, 'top', 'tee').equipped.top === 'tee');
check('a coin pack counts once per transaction', walletOf(addPack(addPack(EMPTY_LEDGER, 't1', 100), 't1', 100)) === 100);
// A guest and a profile that both played level 1 merge without paying it twice, in either order, and merging again changes nothing.
const guest = a1.ledger, profile = applyRun(EMPTY_LEDGER, 'home', 40, 18, par).ledger;
const m1 = mergeLedgers(guest, profile), m2 = mergeLedgers(profile, guest);
check('merge never double-pays a level', walletOf(m1) === walletOf(profile) && walletOf(m2) === walletOf(profile), `(${walletOf(m1)})`);
check('merging twice changes nothing', JSON.stringify(mergeLedgers(m1, guest)) === JSON.stringify(m1));
check('a damaged stored ledger reads as empty', walletOf(parseLedger({ levels: { home: { coins: 'x' } }, items: { a: -5 } })) === 0);
process.exit(fails ? 1 : 0);
