// A standalone claimant process for the concurrency race test.
// argv: <dir> <id> <session> <startAtMs>
// Busy-waits until the shared start gate so all claimants race as simultaneously as
// possible, then attempts a single claim and prints the JSON result to stdout.
import { Mailbox } from '../../src/mailbox.mjs';

const [dir, id, session, startAtMs] = process.argv.slice(2);
const gate = Number(startAtMs);
while (Date.now() < gate) { /* spin to the start gate */ }

const mb = new Mailbox({ dir });
const res = mb.claim(id, { session });
process.stdout.write(JSON.stringify(res));
