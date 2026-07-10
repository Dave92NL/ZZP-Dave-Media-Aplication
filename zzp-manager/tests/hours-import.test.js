const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHoursText } = require('../src/modules/hours-import');

test('parseHoursText handles decimal Dutch/Polish hours and pauses', () => {
  const text = `
  29 juni 2026
  08:00 tot 14:15
  (00:45 pauze)
  5,5 uur
  Client Alpha
  Opracowanie materiałów
  `;

  const entries = parseHoursText(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, '2026-06-29');
  assert.equal(entries[0].duration_minutes, 330);
  assert.equal(entries[0].break_minutes, 45);
  assert.equal(entries[0]._clientName, 'Client Alpha');
  assert.match(entries[0].description, /Opracowanie materiałów/);
});

test('parseHoursText handles h/min notation', () => {
  const text = `
  02 januari 2026
  09:30 - 15:00
  5h 30m
  Project Beta
  Research and editing
  `;

  const entries = parseHoursText(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, '2026-01-02');
  assert.equal(entries[0].duration_minutes, 330);
  assert.equal(entries[0]._clientName, 'Project Beta');
  assert.match(entries[0].description, /Research and editing/);
});

test('parseHoursText handles efaktura PDF style blocks', () => {
  const text = `
  02-01-2026(1)12:30 - 14:45(00:00h)02:15h
  montaż filmu, reaserch
  `;

  const entries = parseHoursText(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, '2026-01-02');
  assert.equal(entries[0].duration_minutes, 135);
  assert.equal(entries[0].break_minutes, 0);
  assert.equal(entries[0]._clientName, 'montaż filmu, reaserch');
});

test('parseHoursText parses break minutes from parentheses with h suffix', () => {
  const text = `
  05-07-2026
  09:00 - 12:00(00:30h)
  research
  `;

  const entries = parseHoursText(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, '2026-07-05');
  assert.equal(entries[0].duration_minutes, 150);
  assert.equal(entries[0].break_minutes, 30);
  assert.equal(entries[0].description, 'research');
});

test('parseHoursText strips summary footer lines from final block', () => {
  const text = `
  01-07-2026(27)
  08:00 - 14:15(00:45h)
  05:30h
  Videomontage, maken van de voice over in ElevenLabs
  Aantal uren 212:40h
  `;

  const entries = parseHoursText(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].description, 'Videomontage, maken van de voice over in ElevenLabs');
});

test('parseHoursText merges wrapped description lines into one entry', () => {
  const text = `
  11-05-2026(20)
  16:00 - 18:00(00:00h)
  02:00h
  masteren van een lied voor een youtube-kanaal, het toevoegen van een lied aan
  streamingdiensten.
  `;

  const entries = parseHoursText(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, '2026-05-11');
  assert.equal(entries[0].description, 'masteren van een lied voor een youtube kanaal, het toevoegen van een lied aan streamingdiensten.');
  assert.equal(entries[0]._clientName, 'masteren van een lied voor een youtube kanaal, het toevoegen van een lied aan');
});
